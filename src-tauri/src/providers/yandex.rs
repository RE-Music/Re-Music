use super::{MusicProvider, Track, Playlist, UserInfo};
use async_trait::async_trait;
use serde_json::Value;
use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_TYPE};
use std::sync::Arc;
use crate::auth::AuthManager;
use tauri::AppHandle;
use md5;
use urlencoding;
use tauri::Manager;

pub struct YandexProvider {
    client: Arc<tokio::sync::RwLock<reqwest::Client>>,
    auth_manager: Arc<AuthManager>,
    uid: tokio::sync::RwLock<Option<String>>,
}

impl YandexProvider {
    pub fn new(auth_manager: Arc<AuthManager>) -> Self {
        let mut headers = HeaderMap::new();
        headers.insert("X-Yandex-Music-Client", HeaderValue::from_static("YandexMusicAndroid/2023.12.1"));
        headers.insert("User-Agent", HeaderValue::from_static("YandexMusic/2023.12.1 (Android 13; Pixel 7)"));
        headers.insert("Accept", HeaderValue::from_static("application/json"));
        headers.insert("Accept-Language", HeaderValue::from_static("ru-RU, ru;q=0.8, en-US;q=0.6, en;q=0.4"));
        headers.insert("Referer", HeaderValue::from_static("https://music.yandex.ru/"));

        let client = reqwest::Client::builder()
            .default_headers(headers)
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .unwrap();

        Self {
            client: Arc::new(tokio::sync::RwLock::new(client)),
            auth_manager,
            uid: tokio::sync::RwLock::new(None),
        }
    }

    async fn get_client(&self) -> reqwest::Client {
        self.client.read().await.clone()
    }

    async fn get_uid(&self) -> Result<String, String> {
        {
            let u = self.uid.read().await;
            if let Some(uid) = u.as_ref() {
                return Ok(uid.clone());
            }
        }

        let mut req = self.get_client().await.get("https://api.music.yandex.net/account/status");
        if let Some(auth) = self.get_auth_header().await {
            req = req.header(AUTHORIZATION, auth);
        }

        let resp = req.send().await.map_err(|e| format!("{:?}", e))?
            .json::<Value>().await.map_err(|e| format!("{:?}", e))?;

        let uid = resp["result"]["account"]["uid"].as_i64()
            .map(|id| id.to_string())
            .ok_or("UID not found")?;

        let mut u = self.uid.write().await;
        *u = Some(uid.clone());
        Ok(uid)
    }
}

#[async_trait]
impl MusicProvider for YandexProvider {
    fn id(&self) -> &str { "yandex" }
    fn name(&self) -> &str { "Yandex Music" }

    async fn get_auth_header(&self) -> Option<String> {
        let t = self.auth_manager.get_token("yandex").await;
        t.as_ref().map(|s| format!("OAuth {}", s))
    }

    async fn search(&self, query: &str, page: u32) -> Result<Vec<Track>, String> {
        let url = format!("https://api.music.yandex.net/search?text={}&type=all&page={}", 
            urlencoding::encode(query), page.saturating_sub(1));
        
        let mut req = self.get_client().await.get(&url);
        if let Some(auth) = self.get_auth_header().await {
            req = req.header(AUTHORIZATION, auth);
        }

        let resp = req.send().await.map_err(|e| e.to_string())?
            .json::<Value>().await.map_err(|e| e.to_string())?;

        let mut tracks = Vec::new();
        if let Some(results) = resp["result"]["tracks"]["results"].as_array() {
            for t in results {
                let album_id = t["albums"][0]["id"].as_i64();
                let track_id = t["id"].as_i64().unwrap_or(0);
                let full_id = match album_id {
                    Some(aid) => format!("{}:{}", track_id, aid),
                    None => track_id.to_string(),
                };

                let artists = t["artists"].as_array().map(|arr| {
                    arr.iter().map(|a| a["name"].as_str().unwrap_or("")).collect::<Vec<_>>().join(", ")
                }).unwrap_or_default();

                tracks.push(Track {
                    id: full_id,
                    title: t["title"].as_str().unwrap_or("Unknown").to_string(),
                    artist: artists,
                    provider: self.id().to_string(),
                    duration_ms: t["durationMs"].as_u64().map(|v| v as u32),
                    cover_url: t["coverUri"].as_str().map(|s| format!("https://{}", s.replace("%%", "200x200"))),
                    stream_url: None,
                    liked_at: None,
                });
            }
        }
        Ok(tracks)
    }

    async fn get_playlists(&self, _handle: AppHandle) -> Result<Vec<Playlist>, String> {
        let uid = self.get_uid().await?;
        let url = format!("https://api.music.yandex.net/users/{}/playlists/list", uid);
        
        let mut req = self.get_client().await.get(&url);
        if let Some(auth) = self.get_auth_header().await {
            req = req.header(AUTHORIZATION, auth);
        }

        let resp = req.send().await.map_err(|e| e.to_string())?
            .json::<Value>().await.map_err(|e| e.to_string())?;

        let mut playlists = Vec::new();
        if let Some(results) = resp["result"].as_array() {
            for p in results {
                playlists.push(Playlist {
                    id: format!("{}:{}", p["uid"], p["kind"]),
                    title: p["title"].as_str().unwrap_or("Untitled").to_string(),
                    provider: self.id().to_string(),
                    track_count: p["trackCount"].as_u64().map(|v| v as u32),
                    cover_url: p["cover"]["uri"].as_str().map(|s| format!("https://{}", s.replace("%%", "200x200"))),
                });
            }
        }
        Ok(playlists)
    }

    async fn get_playlist_tracks(&self, playlist_id: &str, _handle: AppHandle) -> Result<Vec<Track>, String> {
        let parts: Vec<&str> = playlist_id.split(':').collect();
        if parts.len() < 2 { return Err("Invalid playlist ID".to_string()); }
        let (uid, kind) = (parts[0], parts[1]);

        let url = format!("https://api.music.yandex.net/users/{}/playlists/{}", uid, kind);
        
        let mut req = self.get_client().await.get(&url);
        if let Some(auth) = self.get_auth_header().await {
            req = req.header(AUTHORIZATION, auth);
        }

        let resp = req.send().await.map_err(|e| e.to_string())?
            .json::<Value>().await.map_err(|e| e.to_string())?;

        if let Some(tracks_arr) = resp["result"]["tracks"].as_array() {
            // Check if tracks are sparse (missing title)
            let is_sparse = tracks_arr.first().map(|item| item["track"]["title"].is_null()).unwrap_or(false);
            
            if is_sparse {
                let track_ids: Vec<String> = tracks_arr.iter()
                    .filter_map(|item| item["track"]["id"].as_i64().map(|id| id.to_string())
                        .or_else(|| item["track"]["id"].as_str().map(|s| s.to_string())))
                    .collect();
                return self.hydrate_tracks(&track_ids).await;
            }

            let mut tracks = Vec::new();
            for item in tracks_arr {
                let t = &item["track"];
                let album_id = t["albums"][0]["id"].as_i64();
                let track_id_str = t["id"].as_i64().map(|id| id.to_string())
                    .or_else(|| t["id"].as_str().map(|s| s.to_string()))
                    .unwrap_or_else(|| "0".to_string());

                let full_id = match album_id {
                    Some(aid) => format!("{}:{}", track_id_str, aid),
                    None => track_id_str,
                };

                let artists = t["artists"].as_array().map(|arr| {
                    arr.iter().map(|a| a["name"].as_str().unwrap_or("")).collect::<Vec<_>>().join(", ")
                }).unwrap_or_default();

                tracks.push(Track {
                    id: full_id,
                    title: t["title"].as_str().unwrap_or("Unknown").to_string(),
                    artist: artists,
                    provider: self.id().to_string(),
                    duration_ms: t["durationMs"].as_u64().map(|v| v as u32),
                    cover_url: t["coverUri"].as_str().map(|s| format!("https://{}", s.replace("%%", "200x200"))),
                    stream_url: None,
                    liked_at: None,
                });
            }
            Ok(tracks)
        } else {
            Ok(vec![])
        }
    }

    async fn get_stream_url(&self, track_id: &str) -> Result<String, String> {
        let id_only = track_id.split(':').next().unwrap_or(track_id);
        let url = format!("https://api.music.yandex.net/tracks/{}/download-info", id_only);
        
        let mut req = self.get_client().await.get(&url);
        if let Some(auth) = self.get_auth_header().await {
            req = req.header(AUTHORIZATION, auth);
        }

        let resp = req.send().await.map_err(|e| e.to_string())?
            .json::<Value>().await.map_err(|e| e.to_string())?;

        let info_list = resp["result"].as_array().ok_or("Result not an array")?;
        let track_info = info_list.iter()
            .find(|i| i["host"].as_str().map(|h| h != "api.music.yandex.net").unwrap_or(false))
            .or_else(|| info_list.first())
            .ok_or("No download info results found")?;

        let download_info_url = track_info["downloadInfoUrl"].as_str()
            .ok_or("Download info URL not found")?;

        let internal_info = self.get_client().await.get(format!("{}&format=json", download_info_url))
            .send().await.map_err(|e| e.to_string())?
            .json::<Value>().await.map_err(|e| e.to_string())?;

        let host = internal_info["host"].as_str().ok_or("Host not found")?;
        let path = internal_info["path"].as_str().ok_or("Path not found")?;
        let s = internal_info["s"].as_str().ok_or("S not found")?;
        let ts = internal_info["ts"].as_str().ok_or("TS not found")?;

        let secret = "Xgr";
        let sign_str = format!("{}{}{}", secret, &path[1..], s);
        let sign = format!("{:x}", md5::compute(sign_str));

        let stream_url = format!("https://{}/get-mp3/{}/{}{}", host, sign, ts, path);
        Ok(format!("http://127.0.0.1:5189/yandex/{}", stream_url))
    }

    async fn get_user_info(&self) -> Result<Option<UserInfo>, String> {
        let mut req = self.get_client().await.get("https://api.music.yandex.net/account/status");
        if let Some(auth) = self.get_auth_header().await {
            req = req.header(AUTHORIZATION, auth);
        } else {
            return Ok(None);
        }

        let resp = req.send().await.map_err(|e| e.to_string())?;
        if !resp.status().is_success() { return Ok(None); }
        let data = resp.json::<Value>().await.map_err(|e| e.to_string())?;

        Ok(Some(UserInfo {
            username: data["result"]["account"]["displayName"].as_str().unwrap_or("Yandex User").to_string(),
            avatar_url: None, // We can add avatar logic later if needed
        }))
    }

    async fn like_track(&self, track_id: &str, like: bool, _handle: tauri::AppHandle) -> Result<bool, String> {
        let parts: Vec<&str> = track_id.split(':').collect();
        let id = parts[0];
        let url = if like {
            format!("https://api.music.yandex.net/users/me/likes/tracks/add-multiple?track-ids={}", id)
        } else {
            format!("https://api.music.yandex.net/users/me/likes/tracks/remove?track-ids={}", id)
        };

        let mut req = self.get_client().await.post(&url);
        if let Some(auth) = self.get_auth_header().await {
            req = req.header(AUTHORIZATION, auth);
        }

        println!("[Yandex] Native like_track: id={}, like={}", id, like);
        let resp = req.send().await.map_err(|e| e.to_string())?;
        println!("[Yandex] Native like_track response status: {}", resp.status());
        Ok(resp.status().is_success())
    }

    async fn get_recommendations(&self, seed_track_id: Option<String>, _handle: AppHandle) -> Result<Vec<Track>, String> {
        let mut url = match seed_track_id {
            Some(id) if id.starts_with("category:") => {
                let cat = id.replace("category:", "");
                let station_id = match cat.as_str() {
                    "energy" => "mood:energetic",
                    "relax" => "mood:relax",
                    "focus" => "activity:work", 
                    "party" => "activity:party",
                    _ => "user:onyourwave"
                };
                format!("https://api.music.yandex.net/rotor/station/{}/tracks", station_id)
            },
            Some(id) if id.starts_with("station:") || id.starts_with("mood:") || id.starts_with("genre:") || id.starts_with("activity:") => {
                format!("https://api.music.yandex.net/rotor/station/{}/tracks", id.replace("station:", ""))
            },
            Some(id) => {
                let id_only = id.split(':').next().unwrap_or(&id);
                format!("https://api.music.yandex.net/tracks/{}/similar", id_only)
            },
            None => {
                // If no seed, randomly pick between "My Wave" and a discovery-focused mood station
                use rand::Rng;
                let mut rng = rand::thread_rng();
                let stations = vec!["user:onyourwave", "mood:energetic", "mood:relax", "activity:work", "activity:party"];
                let station_id = stations[rng.gen_range(0..stations.len())];
                println!("[Yandex Wave] Picking random station: {}", station_id);
                format!("https://api.music.yandex.net/rotor/station/{}/tracks", station_id)
            },
        };

        // Add a timestamp to bypass any caching layers
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
            
        if url.contains('?') {
            url.push_str(&format!("&__t={}", timestamp));
        } else {
            url.push_str(&format!("?__t={}", timestamp));
        }

        let mut req = self.get_client().await.get(&url);
        if let Some(auth) = self.get_auth_header().await {
            req = req.header(AUTHORIZATION, auth);
        }

        let resp = req.send().await.map_err(|e| e.to_string())?
            .json::<Value>().await.map_err(|e| e.to_string())?;

        let mut tracks = Vec::new();
        if let Some(results) = resp["result"]["similarTracks"].as_array() {
            tracks = self.map_yandex_tracks(results);
        } else if let Some(items) = resp["result"]["tracks"].as_array() {
            tracks = self.map_yandex_tracks(items);
        } else if let Some(seq) = resp["result"]["sequence"].as_array() {
            // "My Wave" returns a sequence of items, each containing a "track" object
            tracks = self.map_yandex_tracks(seq);
        }
        Ok(tracks)
    }

    async fn create_playlist(&self, title: &str) -> Result<Playlist, String> {
        let uid = self.get_uid().await?;
        let url = format!("https://api.music.yandex.net/users/{}/playlists/create", uid);
        
        let mut req = self.get_client().await.post(&url)
            .header(CONTENT_TYPE, "application/x-www-form-urlencoded")
            .body(format!("title={}&visibility=public", urlencoding::encode(title)));
            
        if let Some(auth) = self.get_auth_header().await {
            req = req.header(AUTHORIZATION, auth);
        }

        let resp = req.send().await.map_err(|e| e.to_string())?
            .json::<Value>().await.map_err(|e| e.to_string())?;

        let p = &resp["result"];
        Ok(Playlist {
            id: format!("{}:{}", p["uid"], p["kind"]),
            title: p["title"].as_str().unwrap_or(title).to_string(),
            provider: self.id().to_string(),
            track_count: Some(0),
            cover_url: None,
        })
    }

    async fn add_track_to_playlist(&self, playlist_id: &str, track_id: &str) -> Result<bool, String> {
        let parts: Vec<&str> = playlist_id.split(':').collect();
        if parts.len() < 2 { return Err("Invalid playlist ID".to_string()); }
        let (uid, kind) = (parts[0], parts[1]);

        let track_parts: Vec<&str> = track_id.split(':').collect();
        let id = track_parts[0];
        let album_id = track_parts.get(1).unwrap_or(&"");

        // 1. Get revision
        let url = format!("https://api.music.yandex.net/users/{}/playlists/{}", uid, kind);
        let mut req = self.get_client().await.get(&url);
        if let Some(auth) = self.get_auth_header().await {
            req = req.header(AUTHORIZATION, auth);
        }
        let resp = req.send().await.map_err(|e| e.to_string())?
            .json::<Value>().await.map_err(|e| e.to_string())?;
        
        let revision = resp["result"]["revision"].as_i64().ok_or("Revision not found")?;

        // 2. Add track
        let url = format!("https://api.music.yandex.net/users/{}/playlists/{}/change-relative", uid, kind);
        let diff = format!("[{{\"op\":\"insert\",\"at\":0,\"tracks\":[{{\"id\":\"{}\",\"albumId\":\"{}\"}}]}}]", id, album_id);
        
        let mut req = self.get_client().await.post(&url)
            .header(CONTENT_TYPE, "application/x-www-form-urlencoded")
            .body(format!("diff={}&revision={}", urlencoding::encode(&diff), revision));
            
        if let Some(auth) = self.get_auth_header().await {
            req = req.header(AUTHORIZATION, auth);
        }

        let resp = req.send().await.map_err(|e| e.to_string())?;
        Ok(resp.status().is_success())
    }

    async fn get_liked_tracks(&self, _handle: AppHandle) -> Result<Vec<Track>, String> {
        let uid = self.get_uid().await?;
        let url = format!("https://api.music.yandex.net/users/{}/likes/tracks", uid);
        
        let mut req = self.get_client().await.get(&url);
        if let Some(auth) = self.get_auth_header().await {
            req = req.header(AUTHORIZATION, auth);
        }

        let resp = req.send().await.map_err(|e| e.to_string())?
            .json::<Value>().await.map_err(|e| e.to_string())?;

        if let Some(items) = resp["result"]["library"]["tracks"].as_array() {
            let mut id_to_time = std::collections::HashMap::new();
            let mut track_ids = Vec::new();

            for t in items {
                let id_val = t["id"].as_i64().map(|id| id.to_string())
                    .or_else(|| t["id"].as_str().map(|s| s.to_string()));
                
                if let Some(id_s) = id_val {
                    if let Some(ts_str) = t["timestamp"].as_str() {
                        if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(ts_str) {
                            id_to_time.insert(id_s.clone(), dt.timestamp_millis() as u64);
                        }
                    }
                    track_ids.push(id_s);
                }
            }
            
            if track_ids.is_empty() {
                return Ok(vec![]);
            }

            let mut tracks = self.hydrate_tracks(&track_ids).await?;
            for t in &mut tracks {
                let id_only = t.id.split(':').next().unwrap_or(&t.id);
                if let Some(ts) = id_to_time.get(id_only) {
                    t.liked_at = Some(*ts);
                }
            }
            return Ok(tracks);
        }
        Ok(vec![])
    }



    async fn auth(&self, handle: tauri::AppHandle) -> Result<bool, String> {
        use tauri::WebviewWindowBuilder;
        use tauri::WebviewUrl;

        let client_id = "23cabbbdc6cd418abb4b39c32c41195d";
        let redirect_uri = "https://oauth.yandex.ru/verification_code";
        let auth_url = format!(
            "https://oauth.yandex.ru/authorize?response_type=token&client_id={}&force_confirm=yes&redirect_uri={}", 
            client_id, 
            redirect_uri
        );
        
        let (tx, rx) = tokio::sync::oneshot::channel();
        let tx = Arc::new(tokio::sync::Mutex::new(Some(tx)));
        
        let auth_manager = self.auth_manager.clone();
        
        let handle_clone = handle.clone();
        handle.run_on_main_thread(move || {
            let tx_clone = tx.clone();
            let auth_manager_clone = auth_manager.clone();
            
            if let Some(existing) = handle_clone.get_webview_window("yandex-auth") {
                let _ = existing.set_focus();
                return;
            }

            let url = match auth_url.parse() {
                Ok(u) => WebviewUrl::External(u),
                Err(e) => {
                    println!("[Yandex] Failed to parse auth URL: {}", e);
                    return;
                }
            };

            let builder = WebviewWindowBuilder::new(&handle_clone, "yandex-auth", url)
                .title("Yandex Music Login")
                .inner_size(800.0, 700.0);

            let builder = builder.on_navigation(move |url: &tauri::Url| {
                if let Some(fragment) = url.fragment() {
                    if fragment.contains("access_token=") || fragment.contains("token=") {
                        let token_key = if fragment.contains("access_token=") { "access_token=" } else { "token=" };
                        if let Some(token) = fragment.split(token_key).nth(1)
                            .and_then(|s: &str| s.split('&').next()) 
                        {
                            let token: String = token.to_string();
                            let auth_manager = auth_manager_clone.clone();
                            let tx = tx_clone.clone();
                            
                            tauri::async_runtime::spawn(async move {
                                auth_manager.set_token("yandex", token).await;
                                if let Some(tx) = tx.lock().await.take() {
                                    let _ = tx.send(true);
                                }
                            });
                            return false; 
                        }
                    }
                }
                true
            });
            
            if let Err(e) = builder.build() {
                println!("[Yandex] Failed to build auth window: {}", e);
            }
        }).map_err(|e| e.to_string())?;

        match tokio::time::timeout(std::time::Duration::from_secs(300), rx).await {
            Ok(Ok(success)) => {
                let _ = handle.get_webview_window("yandex-auth").map(|w| w.close());
                Ok(success)
            },
            _ => {
                let _ = handle.get_webview_window("yandex-auth").map(|w| w.close());
                Ok(false)
            }
        }
    }
}

impl YandexProvider {
    fn map_yandex_tracks(&self, yandex_tracks: &[Value]) -> Vec<Track> {
        yandex_tracks.iter().map(|item| {
            let t = if !item["track"].is_null() { &item["track"] } else { item };
            
            let album_id = t["albums"][0]["id"].as_i64()
                .or_else(|| t["albums"][0]["id"].as_str().and_then(|s| s.parse().ok()))
                .or_else(|| t["albumId"].as_i64())
                .or_else(|| t["albumId"].as_str().and_then(|s| s.parse().ok()));

            let track_id_str = t["id"].as_str().map(|s| s.to_string())
                .or_else(|| t["id"].as_i64().map(|n| n.to_string()))
                .unwrap_or_else(|| "0".to_string());

            let full_id = match album_id {
                Some(aid) => format!("{}:{}", track_id_str, aid),
                None => track_id_str,
            };

            let artists = t["artists"].as_array().map(|arr| {
                arr.iter().filter_map(|a| a["name"].as_str()).collect::<Vec<_>>().join(", ")
            }).unwrap_or_default();

            Track {
                id: full_id,
                title: t["title"].as_str().unwrap_or("Unknown").to_string(),
                artist: artists,
                provider: "yandex".to_string(),
                duration_ms: t["durationMs"].as_u64().map(|v| v as u32),
                cover_url: t["coverUri"].as_str().map(|s| format!("https://{}", s.replace("%%", "200x200"))),
                stream_url: None,
                liked_at: None,
            }
        }).collect()
    }

    async fn hydrate_tracks(&self, track_ids: &[String]) -> Result<Vec<Track>, String> {
        let mut all_tracks = Vec::new();
        let client = self.get_client().await;
        let auth = self.get_auth_header().await;

        for chunk in track_ids.chunks(100) {
            let ids_str = chunk.join(",");
            let url = format!("https://api.music.yandex.net/tracks?track-ids={}", ids_str);
            let mut req = client.get(&url);
            if let Some(ref a) = auth {
                req = req.header(AUTHORIZATION, a);
            }

            let resp = req.send().await.map_err(|e| e.to_string())?
                .json::<Value>().await.map_err(|e| e.to_string())?;

            if let Some(results) = resp["result"].as_array() {
                all_tracks.extend(self.map_yandex_tracks(results));
            }
        }

        Ok(all_tracks)
    }
}
