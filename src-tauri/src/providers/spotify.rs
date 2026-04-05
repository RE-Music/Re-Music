use super::{MusicProvider, Track, Playlist, UserInfo};
use async_trait::async_trait;
use serde_json::Value;
use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION};
use std::sync::Arc;
use crate::auth::AuthManager;
use tauri::{AppHandle, Manager};
use sha2::{Sha256, Digest};
use base64::{engine::general_purpose, Engine as _};
use rand::{distributions::Alphanumeric, Rng};

pub struct SpotifyProvider {
    client: Arc<tokio::sync::RwLock<reqwest::Client>>,
    auth_manager: Arc<AuthManager>,
}

impl SpotifyProvider {
    pub fn new(auth_manager: Arc<AuthManager>) -> Self {
        let mut headers = HeaderMap::new();
        headers.insert("User-Agent", HeaderValue::from_static("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36"));
        headers.insert("Accept", HeaderValue::from_static("application/json, text/plain, */*"));
        headers.insert("Accept-Language", HeaderValue::from_static("en-US,en;q=0.9,ru;q=0.8"));

        let client = reqwest::Client::builder()
            .default_headers(headers)
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .unwrap();

        Self {
            client: Arc::new(tokio::sync::RwLock::new(client)),
            auth_manager,
        }
    }

    async fn get_client(&self) -> reqwest::Client {
        self.client.read().await.clone()
    }

    async fn get_auth_header(&self) -> Option<String> {
        let t = self.auth_manager.get_token("spotify").await;
        t.as_ref().map(|s| format!("Bearer {}", s))
    }

    async fn refresh_access_token(&self) -> Result<String, String> {
        println!("[Spotify Auth] Attempting to refresh access token...");
        let refresh_token = self.auth_manager.get_token("spotify_refresh").await
            .ok_or_else(|| "No refresh token found. Please relogin.".to_string())?;
        
        let client_id = "42935c9cccad4ee9a7b7ec96e9793420";
        let params = [
            ("grant_type", "refresh_token"),
            ("refresh_token", &refresh_token),
            ("client_id", client_id),
        ];

        let client = self.get_client().await;
        let resp = client.post("https://accounts.spotify.com/api/token")
            .form(&params)
            .send().await
            .map_err(|e| e.to_string())?;

        let data: Value = resp.json().await.map_err(|e| e.to_string())?;
        if let Some(new_token) = data["access_token"].as_str() {
            println!("[Spotify Auth] Token refreshed successfully!");
            self.auth_manager.set_token("spotify", new_token.to_string()).await;
            if let Some(new_refresh) = data["refresh_token"].as_str() {
                self.auth_manager.set_token("spotify_refresh", new_refresh.to_string()).await;
            }
            Ok(new_token.to_string())
        } else {
            let err = format!("Refresh failed: {:?}", data);
            println!("[Spotify Auth] {}", err);
            Err(err)
        }
    }

    async fn send_spotify_request(&self, request: reqwest::RequestBuilder) -> Result<reqwest::Response, String> {
        let mut req = request.try_clone().ok_or("Failed to clone request")?;
        if let Some(auth) = self.get_auth_header().await {
            req = req.header(AUTHORIZATION, auth);
        }
        
        let resp = req.send().await.map_err(|e| e.to_string())?;
        if resp.status() == 401 {
            println!("[Spotify] Request returned 401. Trying to refresh token...");
            if self.refresh_access_token().await.is_ok() {
                let mut retry_req = request.try_clone().ok_or("Failed to clone request for retry")?;
                if let Some(auth) = self.get_auth_header().await {
                    retry_req = retry_req.header(AUTHORIZATION, auth);
                }
                return retry_req.send().await.map_err(|e| e.to_string());
            }
        }
        Ok(resp)
    }

    #[allow(dead_code)]
    async fn execute_recommendations_request(&self, base_url: &reqwest::Url, seed_tracks: Option<&str>, seed_genres: Option<&str>) -> Result<Vec<Track>, String> {
        let mut url = base_url.clone();
        {
            let mut query = url.query_pairs_mut();
            query.append_pair("limit", "20");
            if let Some(seeds) = seed_tracks {
                query.append_pair("seed_tracks", seeds);
            }
            if let Some(genres) = seed_genres {
                query.append_pair("seed_genres", genres);
            }
        }

        println!("[Spotify Wave] Requesting: {}", url);
        let req = self.get_client().await.get(url);
        let resp = self.send_spotify_request(req).await?;
        let status = resp.status();
        
        if status == reqwest::StatusCode::NOT_FOUND {
            println!("[Spotify Wave] Recommendations endpoint returned 404. Falling back to Top Tracks...");
            return self.get_top_tracks().await;
        }

        if !status.is_success() {
            let text = resp.text().await.unwrap_or_default();
            println!("[Spotify API Error] Status: {}, Body: {}", status, text);
            return Ok(vec![]);
        }
        
        let json: Value = resp.json().await.map_err(|e| e.to_string())?;
        let mut tracks = Vec::new();
        if let Some(items) = json["tracks"].as_array() {
            for t in items {
                let artists = t["artists"].as_array().map(|arr| {
                    arr.iter().filter_map(|a| a["name"].as_str()).collect::<Vec<_>>().join(", ")
                }).unwrap_or_else(|| "Unknown Artist".to_string());

                tracks.push(Track {
                    id: t["id"].as_str().unwrap_or("").to_string(),
                    title: t["name"].as_str().unwrap_or("Unknown").to_string(),
                    artist: artists,
                    provider: self.id().to_string(),
                    duration_ms: t["duration_ms"].as_u64().map(|v| v as u32),
                    cover_url: t["album"]["images"].as_array()
                        .and_then(|arr| arr.get(0).or(arr.get(1)).or(arr.get(2)))
                        .and_then(|img| img["url"].as_str()).map(|s| s.to_string()),
                    stream_url: None,
                    liked_at: None,
                });
            }
        }
        Ok(tracks)
    }

    #[allow(dead_code)]
    async fn get_top_tracks(&self) -> Result<Vec<Track>, String> {
        let req = self.get_client().await.get("https://api.spotify.com/v1/me/top/tracks?limit=20");
        let resp = self.send_spotify_request(req).await?;
        if !resp.status().is_success() {
            println!("[Spotify Wave] Top Tracks fallback also failed: {}", resp.status());
            return Ok(vec![]);
        }

        let json: Value = resp.json().await.map_err(|e| e.to_string())?;
        let mut tracks = Vec::new();
        if let Some(items) = json["items"].as_array() {
            for t in items {
                let artists = t["artists"].as_array().map(|arr| {
                    arr.iter().filter_map(|a| a["name"].as_str()).collect::<Vec<_>>().join(", ")
                }).unwrap_or_else(|| "Unknown Artist".to_string());

                tracks.push(Track {
                    id: t["id"].as_str().unwrap_or("").to_string(),
                    title: t["name"].as_str().unwrap_or("Unknown").to_string(),
                    artist: artists,
                    provider: self.id().to_string(),
                    duration_ms: t["duration_ms"].as_u64().map(|v| v as u32).or(Some(180000)),
                    cover_url: t["album"]["images"].as_array()
                        .and_then(|arr| arr.get(0).or(arr.get(1)).or(arr.get(2)))
                        .and_then(|img| img["url"].as_str()).map(|s| s.to_string()),
                    stream_url: None,
                    liked_at: None,
                });
            }
        }
        Ok(tracks)
    }

    async fn execute_manual_recommendations(&self, seed_tracks: Option<&str>, seed_artists: Option<&str>, seed_genres: Option<&str>, blacklist: Option<&str>) -> Result<Vec<Track>, String> {
        println!("[Spotify Wave v7.0] Higher Quality Discovery starting...");
        let mut all_tracks = Vec::new();
        let mut seen_ids = std::collections::HashSet::new();

        // 0. Initialize seen_ids with blacklist
        if let Some(bl) = blacklist {
            for id in bl.split(',') { seen_ids.insert(id.to_string()); }
        }

        // 1. Try OFFICIAL Recommendations API first
        if let Some(tracks_str) = seed_tracks {
            let limit_tracks: Vec<&str> = tracks_str.split(',').filter(|s| !s.is_empty()).take(5).collect();
            if !limit_tracks.is_empty() {
                println!("[Spotify Wave] Requesting recommendations for seeds: {}", limit_tracks.join(","));
                let url = format!("https://api.spotify.com/v1/recommendations?seed_tracks={}&limit=100&market=from_token", limit_tracks.join(","));
                let req = self.get_client().await.get(&url);
                match self.send_spotify_request(req).await {
                    Ok(resp) => {
                        println!("[Spotify Wave] Recommendations API Status: {}", resp.status());
                        if let Ok(json) = resp.json::<Value>().await {
                            if let Some(items) = json["tracks"].as_array() {
                                println!("[Spotify Wave] Found {} tracks from Recommendations API", items.len());
                                for t in items {
                                    let tid = t["id"].as_str().unwrap_or("");
                                    if !tid.is_empty() && !seen_ids.contains(tid) {
                                        let artists = t["artists"].as_array().map(|arr| {
                                            arr.iter().filter_map(|a| a["name"].as_str()).collect::<Vec<_>>().join(", ")
                                        }).unwrap_or_else(|| "Unknown Artist".to_string());
                                        all_tracks.push(Track {
                                            id: tid.to_string(),
                                            title: t["name"].as_str().unwrap_or("Unknown").to_string(),
                                            artist: artists,
                                            provider: self.id().to_string(),
                                            duration_ms: t["duration_ms"].as_u64().map(|v| v as u32).or(Some(180000)),
                                            cover_url: t["album"]["images"].as_array().and_then(|arr| arr.iter().find(|_| true)).and_then(|img| img["url"].as_str()).map(|s| s.to_string()),
                                            liked_at: None,
                                            stream_url: None,
                                        });
                                        seen_ids.insert(tid.to_string());
                                    }
                                }
                            } else {
                                println!("[Spotify Wave] No 'tracks' in Recommendations API response: {:?}", json);
                            }
                        }
                    },
                    Err(e) => println!("[Spotify Wave] Recommendations API Request FAILED: {}", e),
                }
            }
        }

        // 2. Fallback to Related Artists (Now with MORE artists)
        if all_tracks.len() < 10 {
            println!("[Spotify Wave] Fallback 1: Related Artists Depth Search...");
            if let Some(artists_str) = seed_artists {
                let artists: Vec<&str> = artists_str.split(',').filter(|s| !s.is_empty()).take(5).collect();
                for aid in artists {
                    let top = self.get_artist_top_tracks(aid).await.unwrap_or_default();
                    for track in top {
                        if !seen_ids.contains(&track.id) {
                            seen_ids.insert(track.id.clone());
                            all_tracks.push(track);
                        }
                    }
                }
            }
        }

        // 3. NUCLEAR FALLBACK: High Quality Search queries
        if all_tracks.is_empty() {
            println!("[Spotify Wave] Fallback 2: Diverse Search...");
            let mut queries = vec!["pop", "rock", "indie", "electronic", "hits", "trending"];
            if let Some(g) = seed_genres {
                for genre in g.split(',') { queries.push(genre); }
            }
            use rand::seq::SliceRandom;
            let mut shuffled_queries = queries.clone();
            shuffled_queries.shuffle(&mut rand::thread_rng());
            
            for q in shuffled_queries.iter().take(3) {
                println!("[Spotify Wave] Trying search fallback with query: {}", q);
                if let Ok(search_results) = self.search(q, 1).await {
                    println!("[Spotify Wave] Search found {} potential tracks.", search_results.len());
                    for track in search_results {
                        if !seen_ids.contains(&track.id) {
                            seen_ids.insert(track.id.clone());
                            all_tracks.push(track);
                        }
                    }
                }
            }
        }

        println!("[Spotify Wave] Candidates found: {}. Verifying likes...", all_tracks.len());
        
        let mut final_tracks = Vec::new();
        // Check likes via API
        for chunk in all_tracks.chunks(50) {
            let ids: Vec<String> = chunk.iter().map(|t| t.id.clone()).collect();
            if let Ok(liked_status) = self.check_tracks_liked(ids).await {
                for (i, is_liked) in liked_status.iter().enumerate() {
                    if !is_liked {
                        final_tracks.push(chunk[i].clone());
                    }
                }
            } else {
                final_tracks.extend(chunk.iter().cloned());
            }
        }

        // Emergency bypass: if everything is liked, return the candidates anyway
        if final_tracks.is_empty() && !all_tracks.is_empty() {
            println!("[Spotify Wave] All candidates were already liked. Emergency bypass enabled.");
            final_tracks = all_tracks;
        }


        // Shuffle and limit to 20
        use rand::seq::SliceRandom;
        final_tracks.shuffle(&mut rand::thread_rng());
        final_tracks.truncate(20);

        println!("[Spotify Wave] Discovery successful, found {} fresh tracks", final_tracks.len());
        Ok(final_tracks)
    }

    async fn check_tracks_liked(&self, ids: Vec<String>) -> Result<Vec<bool>, String> {
        if ids.is_empty() { return Ok(Vec::new()); }
        let url = format!("https://api.spotify.com/v1/me/tracks/contains?ids={}", ids.join(","));
        let req = self.get_client().await.get(&url);
        let resp = self.send_spotify_request(req).await?;
        if !resp.status().is_success() {
            return Err(format!("Spotify API Error checking likes: {}", resp.status()));
        }
        let bools: Vec<bool> = resp.json().await.map_err(|e| e.to_string())?;
        Ok(bools)
    }

    async fn get_artist_top_tracks(&self, artist_id: &str) -> Result<Vec<Track>, String> {
        let url = format!("https://api.spotify.com/v1/artists/{}/top-tracks?market=from_token", artist_id);
        let req = self.get_client().await.get(&url);
        let resp = self.send_spotify_request(req).await?;
        if !resp.status().is_success() { return Ok(vec![]); }

        let json: Value = resp.json().await.map_err(|e| e.to_string())?;
        let mut tracks = Vec::new();
        if let Some(items) = json["tracks"].as_array() {
            for t in items.iter().take(5) { // Take top 5 tracks of the artist
                let artists = t["artists"].as_array().map(|arr| {
                    arr.iter().filter_map(|a| a["name"].as_str()).collect::<Vec<_>>().join(", ")
                }).unwrap_or_else(|| "Unknown Artist".to_string());

                tracks.push(Track {
                    id: t["id"].as_str().unwrap_or("").to_string(),
                    title: t["name"].as_str().unwrap_or("Unknown").to_string(),
                    artist: artists,
                    provider: self.id().to_string(),
                    duration_ms: t["duration_ms"].as_u64().map(|v| v as u32).or(Some(180000)),
                    cover_url: t["album"]["images"].as_array()
                        .and_then(|arr| arr.get(0).or(arr.get(1)).or(arr.get(2)))
                        .and_then(|img| img["url"].as_str()).map(|s| s.to_string()),
                    stream_url: None,
                    liked_at: None,
                });
            }
        }
        Ok(tracks)
    }
}

#[async_trait]
impl MusicProvider for SpotifyProvider {
    fn id(&self) -> &str { "spotify" }
    fn name(&self) -> &str { "Spotify" }

    async fn search(&self, query: &str, page: u32) -> Result<Vec<Track>, String> {
        let q = query.trim();
        if q.is_empty() { return Ok(vec![]); }

        let offset = (page.saturating_sub(1)) * 20;
        let url = reqwest::Url::parse_with_params("https://api.spotify.com/v1/search", &[
            ("q", q),
            ("type", "track"),
            ("limit", "10"),
            ("offset", &offset.to_string()),
        ]).map_err(|e| e.to_string())?;
        
        println!("[Spotify Search] URL: {}", url);
        let req = self.get_client().await.get(url);
        let resp = self.send_spotify_request(req).await?;
        let status = resp.status();
        if !status.is_success() {
            let text = resp.text().await.unwrap_or_default();
            println!("[Spotify API Error - Search] Status: {}, Body: {}", status, text);
            return Err(format!("Spotify API Error: {} - {}", status, text));
        }
        let json: Value = resp.json().await.map_err(|e| e.to_string())?;

        let mut tracks = Vec::new();
        if let Some(items) = json["tracks"]["items"].as_array() {
            for t in items {
                let artists = t["artists"].as_array().map(|arr| {
                    arr.iter().filter_map(|a| a["name"].as_str()).collect::<Vec<_>>().join(", ")
                }).unwrap_or_else(|| "Unknown Artist".to_string());

                tracks.push(Track {
                    id: t["id"].as_str().unwrap_or("").to_string(),
                    title: t["name"].as_str().unwrap_or("Unknown").to_string(),
                    artist: artists,
                    provider: self.id().to_string(),
                    duration_ms: t["duration_ms"].as_u64().map(|v| v as u32).or(Some(180000)),
                    cover_url: t["album"]["images"].as_array()
                        .and_then(|arr| arr.get(0).or(arr.get(1)).or(arr.get(2)))
                        .and_then(|img| img["url"].as_str()).map(|s| s.to_string()),
                    stream_url: None,
                    liked_at: None,
                });
            }
        }
        Ok(tracks)
    }

    async fn get_playlists(&self, _handle: AppHandle) -> Result<Vec<Playlist>, String> {
        let req = self.get_client().await.get("https://api.spotify.com/v1/me/playlists");
        let resp = self.send_spotify_request(req).await?;
        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            println!("[Spotify API Error - get_playlists] Status: {}, Body: {}", status, text);
            return Err(format!("Spotify API Error: {} - {}", status, text));
        }
        let json: Value = resp.json().await.map_err(|e| e.to_string())?;

        let mut playlists = Vec::new();
        if let Some(items) = json["items"].as_array() {
            for p in items {
                playlists.push(Playlist {
                    id: p["id"].as_str().unwrap_or("").to_string(),
                    title: p["name"].as_str().unwrap_or("Untitled").to_string(),
                    provider: self.id().to_string(),
                    track_count: p["tracks"]["total"].as_u64().map(|v| v as u32),
                    cover_url: p["images"][0]["url"].as_str().map(|s| s.to_string()),
                });
            }
        }
        Ok(playlists)
    }

    async fn get_playlist_tracks(&self, playlist_id: &str, _handle: AppHandle) -> Result<Vec<Track>, String> {
        let url = format!("https://api.spotify.com/v1/playlists/{}", playlist_id);
        let req = self.get_client().await.get(&url);
        let resp = self.send_spotify_request(req).await?;
        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            println!("[Spotify API Error - get_playlist_tracks] Status: {}, Body: {}", status, text);
            return Err(format!("Spotify API Error: {} - {}", status, text));
        }
        let json: Value = resp.json().await.map_err(|e| e.to_string())?;

        let mut tracks = Vec::new();
        if let Some(items) = json["items"]["items"].as_array().or_else(|| json["tracks"]["items"].as_array()) {
            println!("[Spotify Playlist Tracks] Found array with {} items", items.len());
            for item in items {
                let t = if item["track"].is_object() {
                    &item["track"]
                } else if item["item"].is_object() {
                    &item["item"]
                } else {
                    item
                };

                if t.is_null() || t["id"].is_null() { 
                    println!("[Spotify Playlist Tracks] Skipping item. t.id is_null: {}", t["id"].is_null());
                    println!("[Spotify Playlist Tracks] Item json snippet: {}", item.to_string().chars().take(300).collect::<String>());
                    continue; 
                }

                let artists = t["artists"].as_array().map(|arr| {
                    arr.iter().filter_map(|a| a["name"].as_str()).collect::<Vec<_>>().join(", ")
                }).unwrap_or_else(|| "Unknown Artist".to_string());

                tracks.push(Track {
                    id: t["id"].as_str().unwrap_or("").to_string(),
                    title: t["name"].as_str().unwrap_or("Unknown").to_string(),
                    artist: artists,
                    provider: self.id().to_string(),
                    duration_ms: t["duration_ms"].as_u64().map(|v| v as u32).or(Some(180000)),
                    cover_url: t["album"]["images"].as_array()
                        .and_then(|arr| arr.get(0).or(arr.get(1)).or(arr.get(2)))
                        .and_then(|img| img["url"].as_str()).map(|s| s.to_string()),
                    stream_url: None,
                    liked_at: item["added_at"].as_str().and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok()).map(|dt| dt.timestamp_millis() as u64),
                });
            }
        }
        Ok(tracks)
    }

    async fn get_stream_url(&self, track_id: &str) -> Result<String, String> {
        // Spotify playback is handled via Web SDK or App opening
        // We return a unique URL for the proxy to intercept if needed, or just the ID
        Ok(format!("spotify:track:{}", track_id))
    }

    async fn get_user_info(&self) -> Result<Option<UserInfo>, String> {
        let req = self.get_client().await.get("https://api.spotify.com/v1/me");
        let resp = self.send_spotify_request(req).await?;
        
        if !resp.status().is_success() {
            return Ok(None);
        }
        
        let data = resp.json::<Value>().await.map_err(|e| e.to_string())?;

        Ok(Some(UserInfo {
            username: data["display_name"].as_str().unwrap_or("Spotify User").to_string(),
            avatar_url: data["images"][0]["url"].as_str().map(|s| s.to_string()),
        }))
    }

    async fn auth(&self, handle: tauri::AppHandle) -> Result<bool, String> {
        use tauri::WebviewWindowBuilder;
        use tauri::WebviewUrl;

        let client_id = "42935c9cccad4ee9a7b7ec96e9793420";
        let scopes = "user-read-private streaming user-library-read user-library-modify playlist-read-private playlist-modify-private playlist-modify-public user-read-playback-state user-modify-playback-state user-top-read user-read-recently-played";
        let redirect_uri = "https://www.google.com/";

        // Generate PKCE code verifier
        let code_verifier: String = rand::thread_rng()
            .sample_iter(&Alphanumeric)
            .take(128)
            .map(char::from)
            .collect();

        // Generate PKCE code challenge
        let mut hasher = Sha256::new();
        hasher.update(code_verifier.as_bytes());
        let hash = hasher.finalize();
        let code_challenge = general_purpose::URL_SAFE_NO_PAD.encode(hash);

        // Build auth URL with response_type=code and PKCE
        let auth_url = format!(
            "https://accounts.spotify.com/authorize?response_type=code&client_id={}&scope={}&redirect_uri={}&code_challenge={}&code_challenge_method=S256&show_dialog=true",
            client_id, 
            urlencoding::encode(scopes), 
            urlencoding::encode(redirect_uri),
            code_challenge
        );
        
        let (tx, rx) = tokio::sync::oneshot::channel();
        let tx = Arc::new(tokio::sync::Mutex::new(Some(tx)));
        let auth_manager = self.auth_manager.clone();
        let handle_clone = handle.clone();
        let code_verifier_clone = code_verifier.clone();
        let redirect_uri_clone = redirect_uri.to_string();
        let client_clone = self.get_client().await;

        handle.run_on_main_thread(move || {
            let tx_clone = tx.clone();
            let auth_manager_clone = auth_manager.clone();
            let cv_clone = code_verifier_clone.clone();
            let ru_clone = redirect_uri_clone.clone();
            let c_clone = client_clone.clone();
            
            if let Some(existing) = handle_clone.get_webview_window("spotify-auth") {
                let _ = existing.set_focus();
                return;
            }

            let url = match auth_url.parse() {
                Ok(u) => WebviewUrl::External(u),
                Err(e) => {
                    println!("[Spotify] Failed to parse auth URL: {}", e);
                    return;
                }
            };

            let builder = WebviewWindowBuilder::new(&handle_clone, "spotify-auth", url)
                .title("Spotify Login")
                .inner_size(600.0, 700.0)
                .on_navigation(move |url: &tauri::Url| {
                    if url.host_str() == Some("www.google.com") {
                        if let Some(code) = url.query_pairs().find(|(key, _)| key == "code").map(|(_, val)| val.into_owned()) {
                            let am = auth_manager_clone.clone();
                            let tx = tx_clone.clone();
                            let cv = cv_clone.clone();
                            let ru = ru_clone.clone();
                            let client = c_clone.clone();
                            
                            tauri::async_runtime::spawn(async move {
                                // Exchange code for token
                                let params = [
                                    ("grant_type", "authorization_code"),
                                    ("code", &code),
                                    ("redirect_uri", &ru),
                                    ("client_id", client_id),
                                    ("code_verifier", &cv),
                                ];

                                match client.post("https://accounts.spotify.com/api/token")
                                    .form(&params)
                                    .send().await 
                                {
                                    Ok(resp) => {
                                        if let Ok(data) = resp.json::<Value>().await {
                                            if let Some(token) = data["access_token"].as_str() {
                                                let granted_scopes = data["scope"].as_str().unwrap_or("UNKNOWN SCOPES");
                                                println!("[Spotify OAuth] Successfully retrieved token!");
                                                println!("[Spotify OAuth] Granted Scopes: {}", granted_scopes);
                                                am.set_token("spotify", token.to_string()).await;
                                                
                                                if let Some(refresh) = data["refresh_token"].as_str() {
                                                    println!("[Spotify OAuth] Refresh token captured!");
                                                    am.set_token("spotify_refresh", refresh.to_string()).await;
                                                }
                                                
                                                if let Some(tx) = tx.lock().await.take() {
                                                    let _ = tx.send(true);
                                                }
                                            } else {
                                                println!("[Spotify] Token missing in response: {:?}", data);
                                            }
                                        }
                                    }
                                    Err(e) => println!("[Spotify] Token exchange failed: {}", e),
                                }
                            });
                            return false;
                        }
                    }
                    true
                });

            if let Err(e) = builder.build() {
                println!("[Spotify] Failed to build auth window: {}", e);
            }
        }).map_err(|e| e.to_string())?;

        match tokio::time::timeout(std::time::Duration::from_secs(300), rx).await {
            Ok(Ok(success)) => {
                let _ = handle.get_webview_window("spotify-auth").map(|w| w.close());
                Ok(success)
            },
            _ => {
                let _ = handle.get_webview_window("spotify-auth").map(|w| w.close());
                Ok(false)
            }
        }
    }

    async fn like_track(&self, track_id: &str, like: bool, _handle: tauri::AppHandle) -> Result<bool, String> {
        // Spotify deprecated /v1/me/tracks for new apps created after Nov 2024.
        // The new unified endpoint is /v1/me/library and requires full URIs in the query string.
        let url = format!("https://api.spotify.com/v1/me/library?uris=spotify:track:{}", track_id);
        let req = if like {
            self.get_client().await.put(&url).header("Content-Length", "0")
        } else {
            self.get_client().await.delete(&url).header("Content-Length", "0")
        };

        let resp = self.send_spotify_request(req).await?;
        
        if resp.status().is_success() {
            Ok(true)
        } else {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            println!("[Spotify API Error - like_track] Status: {}, Body: {}", status, text);
            Ok(false)
        }
    }

    async fn get_recommendations(&self, seed_track_id: Option<String>, handle: AppHandle) -> Result<Vec<Track>, String> {
        // We bypass the official /recommendations endpoint entirely as it's 404/Partner Restricted
        // Instead, we use our Manual Wave algorithm to find Related Artists and their Top Tracks.
        
        // Prepare parameters
        let mut seed_tracks: Option<String> = None;
        let seed_artists: Option<String> = None;
        let mut seed_genres: Option<String> = None;

        match seed_track_id {
            Some(id) if id.starts_with("category:") => {
                let cat = id.replace("category:", "");
                let spotify_genre = match cat.as_str() {
                    "energy" => "dance",
                    "relax" => "chill",
                    "focus" => "study",
                    "party" => "party",
                    _ => "pop"
                };
                seed_genres = Some(spotify_genre.to_string());
            },
            Some(id) if id.starts_with("genre:") || id.starts_with("mood:") || id.starts_with("activity:") => {
                let tag = id.split(':').last().unwrap_or("pop");
                // Simplified mapping for Spotify
                let spotify_genre = match tag {
                    "energetic" => "dance",
                    "relax" => "chill",
                    "concentration" => "ambient",
                    "party" => "party",
                    _ => tag
                };
                seed_genres = Some(spotify_genre.to_string());
            },
            Some(id) => {
                seed_tracks = Some(id);
            },
            None => {
                println!("[Spotify Wave] No seed provided. Fetching User Top Tracks & Artists for smart seeds...");
                
                let mut seeds = Vec::new();
                let mut artist_seeds = Vec::new();
                let mut blacklist = Vec::new();

                // 1. Get Top Tracks
                let req_top = self.get_client().await.get("https://api.spotify.com/v1/me/top/tracks?limit=20&time_range=short_term");
                match self.send_spotify_request(req_top).await {
                    Ok(resp) => {
                        println!("[Spotify Wave] Top Tracks API Status: {}", resp.status());
                        if let Ok(json) = resp.json::<Value>().await {
                            if let Some(items) = json["items"].as_array() {
                                println!("[Spotify Wave] Top Tracks items found: {}", items.len());
                                use rand::seq::SliceRandom;
                                let mut shuffled = items.clone();
                                shuffled.shuffle(&mut rand::thread_rng());
                                
                                for item in shuffled.iter().take(3) {
                                    if let Some(id) = item["id"].as_str() { seeds.push(id.to_string()); }
                                }
                                
                                // Also add to blacklist
                                for item in items {
                                    if let Some(id) = item["id"].as_str() { blacklist.push(id.to_string()); }
                                }
                            } else {
                                println!("[Spotify Wave] No 'items' in Top Tracks response.");
                            }
                        }
                    },
                    Err(e) => println!("[Spotify Wave] Top Tracks Request FAILED: {}", e),
                }

                // 2. Get Top Artists & Genres
                println!("[Spotify Wave] Fetching Top Artists & Genres...");
                let req_artists = self.get_client().await.get("https://api.spotify.com/v1/me/top/artists?limit=10&time_range=short_term");
                match self.send_spotify_request(req_artists).await {
                    Ok(resp) => {
                        println!("[Spotify Wave] Top Artists API Status: {}", resp.status());
                        if let Ok(json) = resp.json::<Value>().await {
                            if let Some(items) = json["items"].as_array() {
                                println!("[Spotify Wave] Top Artists items found: {}", items.len());
                                
                                let mut genres = Vec::new();
                                for item in items {
                                    if let Some(id) = item["id"].as_str() { artist_seeds.push(id.to_string()); }
                                    if let Some(gs) = item["genres"].as_array() {
                                        for g in gs {
                                            if let Some(g_str) = g.as_str() { genres.push(g_str.to_string()); }
                                        }
                                    }
                                }
                                
                                use rand::seq::SliceRandom;
                                artist_seeds.shuffle(&mut rand::thread_rng());
                                artist_seeds.truncate(2);
                                
                                genres.shuffle(&mut rand::thread_rng());
                                if !genres.is_empty() {
                                    seed_genres = Some(genres.iter().take(2).cloned().collect::<Vec<_>>().join(","));
                                    println!("[Spotify Wave] Picked top genres: {:?}", seed_genres);
                                }
                            }
                        }
                    },
                    Err(e) => println!("[Spotify Wave] Top Artists Request FAILED: {}", e),
                }

                // 3. If we failed to get top content, fallback to random liked tracks (old way)
                if seeds.is_empty() {
                    println!("[Spotify Wave] Top Content empty. Using RECENT Liked Tracks...");
                    let url = "https://api.spotify.com/v1/me/tracks?limit=50";
                    let req = self.get_client().await.get(url);
                    if let Ok(resp) = self.send_spotify_request(req).await {
                        println!("[Spotify Wave] Liked Tracks Status: {}", resp.status());
                        if let Ok(json) = resp.json::<Value>().await {
                            if let Some(items) = json["items"].as_array() {
                                use rand::seq::SliceRandom;
                                let mut items_shuffled = items.clone();
                                items_shuffled.shuffle(&mut rand::thread_rng());
                                
                                for i in items_shuffled.iter().take(5) {
                                    if let Some(id) = i["track"]["id"].as_str() { seeds.push(id.to_string()); }
                                    if let Some(aid) = i["track"]["artists"][0]["id"].as_str() { artist_seeds.push(aid.to_string()); }
                                    if let Some(tid) = i["track"]["id"].as_str() { blacklist.push(tid.to_string()); }
                                }
                            }
                        }
                    }
                }

                let s_tracks = if seeds.is_empty() { None } else { Some(seeds.join(",")) };
                let s_artists = if artist_seeds.is_empty() { None } else { Some(artist_seeds.join(",")) };
                let s_blacklist = if blacklist.is_empty() { None } else { Some(blacklist.join(",")) };

                println!("[Spotify Wave] Smart Discovery initiated with {} track seeds and {} artist seeds.", seeds.len(), artist_seeds.len());
                let mut tracks = self.execute_manual_recommendations(s_tracks.as_deref(), s_artists.as_deref(), seed_genres.as_deref(), s_blacklist.as_deref()).await?;
                
                // Mix in some actual liked tracks (5 tracks)
                if let Ok(liked) = self.get_liked_tracks(handle).await {
                    println!("[Spotify Wave] Mixing in 5 existing liked tracks...");
                    use rand::seq::SliceRandom;
                    let mut liked_shuffled = liked;
                    liked_shuffled.shuffle(&mut rand::thread_rng());
                    for t in liked_shuffled.into_iter().take(5) {
                        if !tracks.iter().any(|existing| existing.id == t.id) {
                            tracks.push(t);
                        }
                    }
                }
                
                use rand::seq::SliceRandom;
                tracks.shuffle(&mut rand::thread_rng());
                return Ok(tracks);
            }
        }

        self.execute_manual_recommendations(seed_tracks.as_deref(), seed_artists.as_deref(), seed_genres.as_deref(), None).await
    }

    async fn create_playlist(&self, title: &str) -> Result<Playlist, String> {
        // First get user ID
        let req_me = self.get_client().await.get("https://api.spotify.com/v1/me");
        let me = self.send_spotify_request(req_me).await?
            .json::<Value>().await.map_err(|e| e.to_string())?;
        
        let user_id = me["id"].as_str().ok_or("User ID not found")?;
        
        let url = format!("https://api.spotify.com/v1/users/{}/playlists", user_id);
        let req = self.get_client().await.post(&url).json(&serde_json::json!({
            "name": title,
            "public": true
        }));
        
        let resp = self.send_spotify_request(req).await?
            .json::<Value>().await.map_err(|e| e.to_string())?;

        Ok(Playlist {
            id: resp["id"].as_str().unwrap_or("").to_string(),
            title: resp["name"].as_str().unwrap_or(title).to_string(),
            provider: self.id().to_string(),
            track_count: Some(0),
            cover_url: None,
        })
    }

    async fn add_track_to_playlist(&self, playlist_id: &str, track_id: &str) -> Result<bool, String> {
        let url = format!("https://api.spotify.com/v1/playlists/{}/tracks", playlist_id);
        let req = self.get_client().await.post(&url).json(&serde_json::json!({
            "uris": [format!("spotify:track:{}", track_id)]
        }));

        let resp = self.send_spotify_request(req).await?;
        Ok(resp.status().is_success())
    }

    async fn get_liked_tracks(&self, _handle: AppHandle) -> Result<Vec<Track>, String> {
        // 1. Get total count first to pick a random offset
        let mut total = 50;
        let req_count = self.get_client().await.get("https://api.spotify.com/v1/me/tracks?limit=1");
        if let Ok(resp) = self.send_spotify_request(req_count).await {
            if let Ok(json) = resp.json::<Value>().await {
                total = json["total"].as_u64().unwrap_or(50) as u32;
            }
        }

        let mut offset = 0;
        if total > 50 {
            use rand::Rng;
            offset = rand::thread_rng().gen_range(0..=(total - 50));
        }

        println!("[Spotify] Fetching liked tracks with offset {} (Total: {})", offset, total);
        let url = format!("https://api.spotify.com/v1/me/tracks?limit=50&offset={}", offset);
        let req = self.get_client().await.get(&url);

        let resp = self.send_spotify_request(req).await?;
        if !resp.status().is_success() {
            let status = resp.status();
            if status == 403 {
                return Ok(vec![]);
            }
            let text = resp.text().await.unwrap_or_default();
            println!("[Spotify API Error - get_liked_tracks] Status: {}, Body: {}", status, text);
            return Err(format!("Spotify API Error: {} - {}", status, text));
        }
        let json: Value = resp.json().await.map_err(|e| e.to_string())?;

        let mut tracks = Vec::new();
        if let Some(items) = json["items"].as_array() {
            for item in items {
                let t = &item["track"];
                let artists = t["artists"].as_array().map(|arr| {
                    arr.iter().filter_map(|a| a["name"].as_str()).collect::<Vec<_>>().join(", ")
                }).unwrap_or_else(|| "Unknown Artist".to_string());

                tracks.push(Track {
                    id: t["id"].as_str().unwrap_or("").to_string(),
                    title: t["name"].as_str().unwrap_or("Unknown").to_string(),
                    artist: artists,
                    provider: self.id().to_string(),
                    duration_ms: t["duration_ms"].as_u64().map(|v| v as u32).or(Some(180000)),
                    cover_url: t["album"]["images"].as_array()
                        .and_then(|arr| arr.get(0).or(arr.get(1)).or(arr.get(2)))
                        .and_then(|img| img["url"].as_str()).map(|s| s.to_string()),
                    stream_url: None,
                    liked_at: item["added_at"].as_str().and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok()).map(|dt| dt.timestamp_millis() as u64),
                });
            }
        }
        Ok(tracks)
    }
}
