use super::{MusicProvider, Track, Playlist, UserInfo};
use async_trait::async_trait;
use serde_json::Value;
use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION};
use std::sync::Arc;
use crate::auth::AuthManager;
use urlencoding;
use tauri::{AppHandle, Manager, WebviewWindowBuilder, WebviewUrl};
use tokio::sync::oneshot;
use crate::REQ_MAP;

pub struct SoundCloudProvider {
    client: Arc<tokio::sync::RwLock<reqwest::Client>>,
    auth_manager: Arc<AuthManager>,
    client_id: String,
    user_info: tokio::sync::RwLock<Option<Value>>,
}

impl SoundCloudProvider {
    pub fn new(auth_manager: Arc<AuthManager>) -> Self {
        let mut headers = HeaderMap::new();
        let desktop_ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) SoundCloud/233.0.0 (Desktop; Windows) Electron/26.6.1 Nmis/1.0.0";
        
        headers.insert("User-Agent", HeaderValue::from_str(desktop_ua).unwrap());
        headers.insert("Accept", HeaderValue::from_static("application/json, text/plain, */*"));
        headers.insert("Accept-Language", HeaderValue::from_static("en-US,en;q=0.9"));
        headers.insert("Origin", HeaderValue::from_static("https://soundcloud.com"));
        headers.insert("Referer", HeaderValue::from_static("https://soundcloud.com/"));
        headers.insert("Sec-Ch-Ua", HeaderValue::from_static("\"Chromium\";v=\"122\", \"Not(A:Brand\";v=\"24\", \"Google Chrome\";v=\"122\""));
        headers.insert("Sec-Ch-Ua-Mobile", HeaderValue::from_static("?0"));
        headers.insert("Sec-Ch-Ua-Platform", HeaderValue::from_static("\"Windows\""));
        headers.insert("Sec-Fetch-Dest", HeaderValue::from_static("empty"));
        headers.insert("Sec-Fetch-Mode", HeaderValue::from_static("cors"));
        headers.insert("Sec-Fetch-Site", HeaderValue::from_static("same-site"));

        let client = reqwest::Client::builder()
            .default_headers(headers)
            .cookie_store(true)
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .unwrap();

        Self {
            client: Arc::new(tokio::sync::RwLock::new(client)),
            auth_manager,
            client_id: "khI8ciOiYPX6UVGInQY5zA0zvTkfzuuC".to_string(),
            user_info: tokio::sync::RwLock::new(None),
        }
    }

    async fn get_client(&self) -> reqwest::Client {
        self.client.read().await.clone()
    }

    async fn get_authorized_url(&self, path: &str, include_token: bool) -> String {
        let token = self.auth_manager.get_token("soundcloud").await;
        let separator = if path.contains('?') { "&" } else { "?" };
        let extra_params = "app_version=1773418860&app_locale=en";
        
        let mut url = if path.starts_with("http") {
             path.to_string()
        } else {
            format!("https://api-v2.soundcloud.com{}", path)
        };

        if let Some(t) = token {
            if include_token {
                url = format!("{}{}{}client_id={}&oauth_token={}&{}", url, separator, if url.contains('?') { "&" } else { "" }, self.client_id, t, extra_params);
            } else {
                 url = format!("{}{}{}client_id={}&{}", url, separator, if url.contains('?') { "&" } else { "" }, self.client_id, extra_params);
            }
        } else {
            url = format!("{}{}{}client_id={}&{}", url, separator, if url.contains('?') { "&" } else { "" }, self.client_id, extra_params);
        }
        url
    }

    async fn get_me_cached(&self) -> Result<Value, String> {
        {
            let ui = self.user_info.read().await;
            if let Some(info) = ui.as_ref() {
                return Ok(info.clone());
            }
        }

        let url = self.get_authorized_url("/me", true).await;
        let mut req = self.get_client().await.get(&url);
        if let Some(token) = self.auth_manager.get_token("soundcloud").await {
            req = req.header(AUTHORIZATION, format!("OAuth {}", token));
        }

        let resp = req.send().await.map_err(|e| e.to_string())?
            .json::<Value>().await.map_err(|e| e.to_string())?;

        let mut ui = self.user_info.write().await;
        *ui = Some(resp.clone());
        Ok(resp)
    }

    fn map_track(&self, item: &Value) -> Track {
        let artwork_url = item["artwork_url"].as_str()
            .map(|s| s.replace("large", "t500x500"))
            .or_else(|| item["user"]["avatar_url"].as_str().map(|s| s.to_string()));

        Track {
            id: item["id"].as_i64().unwrap_or(0).to_string(),
            title: item["title"].as_str().unwrap_or("Unknown").to_string(),
            artist: item["user"]["username"].as_str().unwrap_or("Unknown").to_string(),
            provider: "soundcloud".to_string(),
            duration_ms: item["duration"].as_u64().map(|v| v as u32),
            cover_url: artwork_url,
            stream_url: None,
            liked_at: None,
        }
    }

}

#[async_trait]
impl MusicProvider for SoundCloudProvider {
    fn id(&self) -> &str { "soundcloud" }
    fn name(&self) -> &str { "SoundCloud" }

    async fn get_auth_header(&self) -> Option<String> {
        let t = self.auth_manager.get_token("soundcloud").await;
        t.as_ref().map(|s| format!("OAuth {}", s))
    }

    async fn search(&self, query: &str, page: u32) -> Result<Vec<Track>, String> {
        let offset = (page.saturating_sub(1)) * 20;
        let url = self.get_authorized_url(&format!("/search/tracks?q={}&limit=20&offset={}", urlencoding::encode(query), offset), true).await;
        
        let mut req = self.get_client().await.get(&url);
        if let Some(h) = self.get_auth_header().await {
            req = req.header(AUTHORIZATION, h);
        }

        let resp = req.send().await.map_err(|e| e.to_string())?;

        if !resp.status().is_success() {
             return Ok(vec![]); 
        }

        let resp_json = resp.json::<Value>().await.map_err(|e| e.to_string())?;

        let mut tracks = Vec::new();
        if let Some(collection) = resp_json["collection"].as_array() {
            for item in collection {
                tracks.push(self.map_track(item));
            }
        }
        Ok(tracks)
    }

    async fn get_playlists(&self, _handle: AppHandle) -> Result<Vec<Playlist>, String> {
        let user = self.get_me_cached().await?;
        let user_id = user["id"].as_i64().ok_or("User ID not found")?;
        
        let url = self.get_authorized_url(&format!("/users/{}/playlists?limit=50", user_id), true).await;
        let mut req = self.get_client().await.get(&url);
        if let Some(h) = self.get_auth_header().await {
            req = req.header(AUTHORIZATION, h);
        }

        let resp = req.send().await.map_err(|e| e.to_string())?
            .json::<Value>().await.map_err(|e| e.to_string())?;

        let mut playlists = Vec::new();
        if let Some(collection) = resp["collection"].as_array() {
            for p in collection {
                playlists.push(Playlist {
                    id: p["id"].as_i64().unwrap_or(0).to_string(),
                    title: p["title"].as_str().unwrap_or("Untitled").to_string(),
                    provider: self.id().to_string(),
                    track_count: p["track_count"].as_u64().map(|v| v as u32),
                    cover_url: p["artwork_url"].as_str().or_else(|| p["user"]["avatar_url"].as_str()).map(|s| s.to_string()),
                });
            }
        }
        Ok(playlists)
    }

    async fn get_playlist_tracks(&self, playlist_id: &str, _handle: AppHandle) -> Result<Vec<Track>, String> {
        let url = self.get_authorized_url(&format!("/playlists/{}", playlist_id), true).await;
        let mut req = self.get_client().await.get(&url);
        if let Some(h) = self.get_auth_header().await {
            req = req.header(AUTHORIZATION, h);
        }

        let resp = req.send().await.map_err(|e| e.to_string())?
            .json::<Value>().await.map_err(|e| e.to_string())?;

        let mut tracks = Vec::new();
        if let Some(tracks_arr) = resp["tracks"].as_array() {
            for item in tracks_arr {
                tracks.push(self.map_track(item));
            }
        }
        Ok(tracks)
    }

    async fn get_stream_url(&self, track_id: &str) -> Result<String, String> {
        let info_url = self.get_authorized_url(&format!("/tracks/{}", track_id), true).await;
        let mut req = self.get_client().await.get(&info_url);
        if let Some(h) = self.get_auth_header().await {
            req = req.header(AUTHORIZATION, h);
        }

        let track_data = req.send().await.map_err(|e| e.to_string())?
            .json::<Value>().await.map_err(|e| e.to_string())?;

        let transcodings = track_data["media"]["transcodings"].as_array()
            .ok_or("No transcodings found")?;

        let transcoding = transcodings.iter()
            .find(|t| t["format"]["protocol"].as_str() == Some("progressive"))
            .or_else(|| transcodings.iter().find(|t| t["format"]["protocol"].as_str() == Some("hls")))
            .ok_or("No supported transcoding found")?;

        let transcoding_url = transcoding["url"].as_str().ok_or("Transcoding URL not found")?;
        let auth_transcoding_url = self.get_authorized_url(transcoding_url, true).await;
        
        let mut req2 = self.get_client().await.get(&auth_transcoding_url);
        if let Some(h) = self.get_auth_header().await {
            req2 = req2.header(AUTHORIZATION, h);
        }

        let stream_data = req2.send().await.map_err(|e| e.to_string())?
            .json::<Value>().await.map_err(|e| e.to_string())?;

        let final_url = stream_data["url"].as_str().ok_or("Final stream URL not found")?.to_string();
        
        Ok(format!("http://127.0.0.1:5189/soundcloud/{}", final_url))
    }

    async fn get_user_info(&self) -> Result<Option<UserInfo>, String> {
        match self.get_me_cached().await {
            Ok(data) => Ok(Some(UserInfo {
                username: data["username"].as_str().unwrap_or("SoundCloud User").to_string(),
                avatar_url: data["avatar_url"].as_str().map(|s| s.to_string()),
            })),
            Err(_) => Ok(None),
        }
    }

    async fn auth(&self, handle: tauri::AppHandle) -> Result<bool, String> {
        use tauri::WebviewWindowBuilder;
        use tauri::WebviewUrl;

        let chrome_ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
        let auth_url = "https://soundcloud.com/signin";
        
        let (tx, rx) = tokio::sync::oneshot::channel();
        let tx = Arc::new(tokio::sync::Mutex::new(Some(tx)));
        
        let auth_manager = self.auth_manager.clone();
        let handle_clone = handle.clone();
        
        handle.run_on_main_thread(move || {
            let tx_clone = tx.clone();
            let auth_manager_clone = auth_manager.clone();
            
            if let Some(existing) = handle_clone.get_webview_window("soundcloud-auth") {
                let _ = existing.set_focus();
                return;
            }

            let url = match auth_url.parse() {
                Ok(u) => WebviewUrl::External(u),
                Err(e) => {
                    println!("[SoundCloud] Failed to parse auth URL: {}: {}", auth_url, e);
                    return;
                }
            };

            let builder = WebviewWindowBuilder::new(&handle_clone, "soundcloud-auth", url)
                .title("SoundCloud Login")
                .inner_size(850.0, 700.0)
                .user_agent(chrome_ua);
            
            if let Err(e) = builder.build() {
                println!("[SoundCloud] Failed to build auth window: {}", e);
            }
            
            tauri::async_runtime::spawn(async move {
                for _ in 0..150 {
                    tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                    
                    let w = match handle_clone.get_webview_window("soundcloud-auth") {
                        Some(w) => w,
                        None => break,
                    };
                    
                    let js_trap = r#"
                        (() => {
                            const cookie = document.cookie.split('; ').find(row => row.startsWith('oauth_token='));
                            const token = cookie ? cookie.split('=')[1] : localStorage.getItem('oauth_token');
                            if (token && !window.location.hash.includes('access_token=')) {
                                window.location.hash = 'access_token=' + token;
                            }
                        })()
                    "#;
                    let _ = w.eval(js_trap);
                    
                    if let Ok(url) = w.url() {
                        if let Some(fragment) = url.fragment() {
                            let frag_str: &str = fragment;
                            if frag_str.contains("access_token=") {
                                if let Some(token) = frag_str.split("access_token=").nth(1).and_then(|s: &str| s.split('&').next()) {
                                    let token_final: String = token.to_string();
                                    if !token_final.is_empty() {
                                        let am = auth_manager_clone.clone();
                                        let t_tx = tx_clone.clone();
                                        tauri::async_runtime::spawn(async move {
                                            am.set_token("soundcloud", token_final).await;
                                            if let Some(tx) = t_tx.lock().await.take() {
                                                let _ = tx.send(true);
                                            }
                                        });
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }
            });
        }).map_err(|e| e.to_string())?;

        match tokio::time::timeout(std::time::Duration::from_secs(300), rx).await {
            Ok(Ok(success)) => {
                let _ = handle.get_webview_window("soundcloud-auth").map(|w| w.close());
                Ok(success)
            },
            _ => {
                let _ = handle.get_webview_window("soundcloud-auth").map(|w| w.close());
                Ok(false)
            }
        }
    }

    async fn like_track(&self, track_id: &str, like: bool, handle: tauri::AppHandle) -> Result<bool, String> {
        let me = self.get_me_cached().await?;
        let user_id = me["id"].as_i64().ok_or("User ID not found")?;
        let clean_id = track_id.split(':').last().unwrap_or(track_id);
        let method = if like { "PUT" } else { "DELETE" };
        let token = self.auth_manager.get_token("soundcloud").await.ok_or("No SC token")?;

        // Use the user-specific track_likes endpoint with full parameters
        let api_url = format!("https://api-v2.soundcloud.com/users/{}/track_likes/{}?client_id={}&app_version=1773418860&app_locale=en", 
            user_id, clean_id, self.client_id);

        println!("[SoundCloud] Worker-based like_track: id={}, like={}...", clean_id, like);

        // Generate dynamic request ID for callback
        let req_id = format!("sc-{}", uuid::Uuid::new_v4());
        let (tx, rx) = oneshot::channel();
        {
            let mut map = REQ_MAP.lock().await;
            map.insert(req_id.clone(), tx);
        }

        let (window, is_new) = if let Some(w) = handle.get_webview_window("sc-worker") {
            (w, false)
        } else {
            let w = WebviewWindowBuilder::new(&handle, "sc-worker", WebviewUrl::External("https://soundcloud.com".parse().map_err(|e| format!("URL Parse: {}", e))?))
                .title("SoundCloud Worker")
                .visible(false) 
                .build()
                .map_err(|e| format!("Window creation: {}", e))?;
            (w, true)
        };

        // Wait for navigation / loading
        if is_new {
            tokio::time::sleep(std::time::Duration::from_millis(5000)).await;
        }

        // Inject JS to perform the fetch and call back via proxy protocol (allowed everywhere)
        let js = format!(r#"
            (async () => {{
                try {{
                    const res = await fetch('{}', {{
                        method: '{}',
                        headers: {{
                            'Authorization': 'OAuth {}',
                            'Accept': 'application/json, text/plain, */*',
                            'Origin': 'https://soundcloud.com',
                            'Referer': 'https://soundcloud.com/'
                        }}
                    }});
                    const ok = res.ok || res.status === 201 || res.status === 204;
                    // Use nmis-proxy protocol for callback to bypass IPC restrictions
                    const status = ok ? 'ok' : 'err_' + res.status;
                    fetch('http://nmis-proxy.localhost/worker-callback/{}/' + status);
                }} catch (e) {{
                    fetch('http://nmis-proxy.localhost/worker-callback/{}/err_catch_' + encodeURIComponent(e.message));
                }}
            }})()
        "#, api_url, method, token, req_id, req_id);

        window.eval(&js).map_err(|e| format!("JS Injection: {}", e))?;

        // Wait for the result with a 30s timeout
        match tokio::time::timeout(std::time::Duration::from_secs(30), rx).await {
            Ok(Ok(Ok(res))) => Ok(res.as_bool().unwrap_or(true)),
            Ok(Ok(Err(e))) => Err(format!("Worker Error: {}", e)),
            _ => {{
                let mut map = REQ_MAP.lock().await;
                map.remove(&req_id);
                Err("Worker timed out (proxy)".to_string())
            }}
        }
    }

    async fn get_recommendations(&self, seed_track_id: Option<String>, handle: AppHandle) -> Result<Vec<Track>, String> {
        if let Some(sid) = &seed_track_id {
            if sid.starts_with("category:") {
                let cat = sid.replace("category:", "");
                let tag = match cat.as_str() {
                    "energy" => "techno",
                    "relax" => "ambient",
                    "focus" => "lofi",
                    "party" => "house",
                    _ => "electronic"
                };
                // Fallback to search by tag for categories
                return self.search(&format!("tags:{}", tag), 1).await;
            }
        }

        let id = match seed_track_id {
            Some(rid) => rid.split(':').last().unwrap_or(&rid).to_string(),
            None => {
                let liked = self.get_liked_tracks(handle).await?;
                if liked.is_empty() { return Ok(vec![]); }
                use rand::Rng;
                let mut rng = rand::thread_rng();
                let sample_size = liked.len().min(100);
                let random_idx = rng.gen_range(0..sample_size);
                let lid = &liked[random_idx].id;
                lid.split(':').last().unwrap_or(lid).to_string()
            }
        };

        let url = self.get_authorized_url(&format!("/tracks/{}/related?limit=20", id), true).await;
        let mut req = self.get_client().await.get(&url);
        if let Some(h) = self.get_auth_header().await {
            req = req.header(AUTHORIZATION, h);
        }

        let resp = req.send().await.map_err(|e| e.to_string())?
            .json::<Value>().await.map_err(|e| e.to_string())?;

        let mut tracks = Vec::new();
        if let Some(collection) = resp["collection"].as_array() {
            for item in collection {
                tracks.push(self.map_track(item));
            }
        }
        Ok(tracks)
    }

    async fn create_playlist(&self, _title: &str) -> Result<Playlist, String> {
        Err("Not implemented for SoundCloud yet".to_string())
    }

    async fn add_track_to_playlist(&self, _playlist_id: &str, _track_id: &str) -> Result<bool, String> {
        Ok(false)
    }

    async fn get_liked_tracks(&self, _handle: AppHandle) -> Result<Vec<Track>, String> {
        let user = self.get_me_cached().await?;
        let user_id = user["id"].as_i64().ok_or("User ID not found")?;
        
        let url = self.get_authorized_url(&format!("/users/{}/track_likes?limit=50", user_id), true).await;
        let mut req = self.get_client().await.get(&url);
        if let Some(h) = self.get_auth_header().await {
            req = req.header(AUTHORIZATION, h);
        }

        let resp = req.send().await.map_err(|e| e.to_string())?
            .json::<Value>().await.map_err(|e| e.to_string())?;

        let mut tracks = Vec::new();
        if let Some(collection) = resp["collection"].as_array() {
            for item in collection {
                let track_item = &item["track"];
                let t_val = if !track_item.is_null() { track_item } else { item };
                let mut track = self.map_track(t_val);
                track.liked_at = item["created_at"].as_str().and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok()).map(|dt| dt.timestamp_millis() as u64);
                tracks.push(track);
            }
        }
        Ok(tracks)
    }
    async fn stop(&self, handle: tauri::AppHandle) -> Result<(), String> {
        if let Some(w) = handle.get_webview_window("sc-worker") {
            let _ = w.close();
            println!("[SoundCloud] sc-worker window closed");
        }
        Ok(())
    }
}
