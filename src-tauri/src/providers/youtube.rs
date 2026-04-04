use super::{MusicProvider, Track, Playlist, UserInfo};
use async_trait::async_trait;
use serde_json::{Value, json};
use reqwest::header::{HeaderMap, HeaderValue};
use std::sync::Arc;
use crate::auth::AuthManager;
use tauri::{AppHandle, Manager, WebviewWindowBuilder, WebviewUrl, WebviewWindow};

pub struct YouTubeProvider {
    client: Arc<tokio::sync::RwLock<reqwest::Client>>,
    auth_manager: Arc<AuthManager>,
    visitor_data: Arc<tokio::sync::RwLock<Option<String>>>,
    worker_lock: Arc<tokio::sync::Mutex<()>>,
}

impl YouTubeProvider {
    pub fn new(auth_manager: Arc<AuthManager>) -> Self {
        let mut headers = HeaderMap::new();
        headers.insert("User-Agent", HeaderValue::from_static("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36"));
        headers.insert("Accept", HeaderValue::from_static("application/json"));
        headers.insert("Origin", HeaderValue::from_static("https://music.youtube.com"));
        headers.insert("Referer", HeaderValue::from_static("https://music.youtube.com/"));

        let client = reqwest::Client::builder()
            .default_headers(headers)
            .cookie_store(true)
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .unwrap();

        Self {
            client: Arc::new(tokio::sync::RwLock::new(client)),
            auth_manager,
            visitor_data: Arc::new(tokio::sync::RwLock::new(None)),
            worker_lock: Arc::new(tokio::sync::Mutex::new(())),
        }
    }

    async fn get_client(&self) -> reqwest::Client {
        self.client.read().await.clone()
    }

    async fn call_api(&self, endpoint: &str, body: Value) -> Result<Value, String> {
        let client_name = body.get("context")
            .and_then(|c| c.get("client"))
            .and_then(|c| c.get("clientName"))
            .and_then(|v| v.as_str())
            .unwrap_or("WEB_REMIX")
            .to_string();

        let base_url = if client_name == "ANDROID_VR" || client_name == "IOS" || client_name == "ANDROID" {
            "https://youtubei.googleapis.com"
        } else {
            "https://music.youtube.com"
        };
        
        let url = format!("{}/youtubei/v1/{}?alt=json&key=AIzaSyAO_FJ2nm_8u6qU", base_url, endpoint);
        let client = self.get_client().await;
        
        let mut body = body;
        let mut visitor_id_header = None;
        {
            let visitor_data_shared = self.visitor_data.read().await;
            if let Some(ref vd) = *visitor_data_shared {
                visitor_id_header = Some(vd.clone());
                if let Some(context) = body.get_mut("context").and_then(|v| v.as_object_mut()) {
                    context.insert("visitorData".to_string(), json!(vd));
                }
            }
        } // Read lock dropped here
        
        let (client_id, user_agent, is_web) = match client_name.as_str() {
            "IOS" => ("5", "com.google.ios.youtube/19.45.4 (iPhone16,2; U; CPU iOS 18_1_0 like Mac OS X; en_US)", false),
            "ANDROID_MUSIC" => ("21", "com.google.android.apps.youtube.music/6.41.52 (Linux; U; Android 12; en_US; Pixel 6)", false),
            "ANDROID" => ("10", "com.google.android.youtube/17.31.35 (Linux; U; Android 12; en_US; Pixel 6)", false),
            "ANDROID_VR" => ("28", "com.google.android.apps.youtube.vr.oculus/1.65.10 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip", false),
            "TVHTML5_SIMPLY_EMBEDDED_PLAYER" => ("85", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36", false),
            _ => ("26", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36", true), // WEB_REMIX
        };
        
        let client_version = body.get("context")
            .and_then(|c| c.get("client"))
            .and_then(|c| c.get("clientVersion"))
            .and_then(|v| v.as_str())
            .unwrap_or("1.20240214.01.00");

        let mut req = client.post(&url)
            .header("X-Youtube-Client-Name", client_id)
            .header("X-Youtube-Client-Version", client_version)
            .header("User-Agent", user_agent);
            
        if is_web {
            req = req.header("Origin", "https://music.youtube.com")
                     .header("Referer", "https://music.youtube.com/");
        }
            
        if let Some(vd) = visitor_id_header {
            req = req.header("X-Goog-Visitor-Id", vd);
        }

        if let Some(token) = self.auth_manager.get_token("youtube").await {
            // Debug: log cookie names found
            let cookie_names: Vec<&str> = token.split("; ")
                .filter_map(|c| c.split('=').next())
                .collect();
            println!("[YouTube API] Cookie names in token: {:?}", cookie_names);
            
            req = req.header("Cookie", &token);
            
            // Generate SAPISIDHASH from SAPISID cookie for authenticated API calls
            // SAPISID is NOT HttpOnly, so it's available in document.cookie
            // Try SAPISID first, fall back to __Secure-3PAPISID
            let sapisid = token.split("; ")
                .find(|c| c.starts_with("SAPISID="))
                .and_then(|c| c.strip_prefix("SAPISID="))
                .or_else(|| {
                    token.split("; ")
                        .find(|c| c.starts_with("__Secure-3PAPISID="))
                        .and_then(|c| c.strip_prefix("__Secure-3PAPISID="))
                });
            
            if let Some(sapisid_val) = sapisid {
                use sha1::{Sha1, Digest};
                let now = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_secs();
                // SAPISIDHASH origin MUST always be https://music.youtube.com
                let origin = "https://music.youtube.com";
                let hash_input = format!("{} {} {}", now, sapisid_val, origin);
                let hash = format!("{:x}", Sha1::digest(hash_input.as_bytes()));
                println!("[YouTube API] SAPISIDHASH generated (origin: {})", origin);
                req = req.header("Authorization", format!("SAPISIDHASH {}_{}", now, hash));
            } else {
                println!("[YouTube API] WARNING: No SAPISID found in cookies!");
            }
            
            // Required headers for authenticated YouTube API calls
            req = req.header("X-Goog-AuthUser", "0");
            
            if base_url.contains("music.youtube.com") {
                req = req.header("X-Origin", "https://music.youtube.com");
            }
        } else {
            println!("[YouTube API] WARNING: No youtube token stored!");
        }

        let resp = req.json(&body).send().await.map_err(|e| e.to_string())?;

        let status = resp.status();
        let text = resp.text().await.map_err(|e| e.to_string())?;
        
        let _ = std::fs::OpenOptions::new().create(true).append(true).open("nexus_debug.log").and_then(|mut f| {
            use std::io::Write;
            writeln!(f, "[YouTube API] Endpoint: {}, Status: {}, Body prefix: {}", endpoint, status, &text[..text.len().min(500)])
        });

        if !status.is_success() {
            println!("[YouTube API] Error {} for endpoint '{}'. Response: {}", status, endpoint, &text[..text.len().min(300)]);
            return Err(format!("API Error: {} - {}", status, &text[..text.len().min(200)]));
        }
        
        let data: Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;

        // Update visitor data from response
        if let Some(vd) = data["responseContext"]["visitorData"].as_str() {
            let mut visitor_data = self.visitor_data.write().await;
            *visitor_data = Some(vd.to_string());
        }

        Ok(data)
    }

    fn extract_text(&self, obj: &Value) -> String {
        if let Some(text) = obj["simpleText"].as_str() {
            return text.to_string();
        }
        if let Some(runs) = obj["runs"].as_array() {
            return runs.iter()
                .filter_map(|r| r["text"].as_str())
                .collect::<Vec<_>>()
                .join("");
        }
        "".to_string()
    }

    fn parse_duration(&self, t: &str) -> Option<u32> {
        let t = t.trim();
        if !t.contains(':') { return None; }
        
        let parts: Vec<&str> = t.split(':').collect();
        
        let total_secs = match parts.len() {
            2 => {
                let m = parts[0].trim().parse::<u32>().ok()?;
                let s = parts[1].trim().parse::<u32>().ok()?;
                m * 60 + s
            },
            3 => {
                let h = parts[0].trim().parse::<u32>().ok()?;
                let m = parts[1].trim().parse::<u32>().ok()?;
                let s = parts[2].trim().parse::<u32>().ok()?;
                h * 3600 + m * 60 + s
            },
            _ => return None,
        };
        
        Some(total_secs * 1000)
    }

    fn find_responsive_items(&self, val: &Value, tracks: &mut Vec<Track>) {
        if let Some(obj) = val.as_object() {
            if obj.contains_key("musicResponsiveListItemRenderer") {
                if let Some(track) = self.parse_responsive_item(val) {
                    tracks.push(track);
                }
            } else if let Some(video) = obj.get("videoRenderer") {
                if let Some(track) = self.parse_video_renderer(video) {
                    tracks.push(track);
                }
            } else if let Some(video) = obj.get("playlistVideoRenderer") {
                if let Some(track) = self.parse_video_renderer(video) {
                    tracks.push(track);
                }
            } else {
                for v in obj.values() {
                    self.find_responsive_items(v, tracks);
                }
            }
        } else if let Some(arr) = val.as_array() {
            for v in arr {
                self.find_responsive_items(v, tracks);
            }
        }
    }

    fn parse_video_renderer(&self, video: &Value) -> Option<Track> {
        let id = video["videoId"].as_str()?;
        let title = self.extract_text(&video["title"]);
        let artist = self.extract_text(&video["shortBylineText"]);
        
        let duration_ms = video["lengthText"]["simpleText"].as_str()
            .and_then(|s| self.parse_duration(s));

        // FILTER: Skip "trash" results
        // 1. Skip live streams or videos without duration
        if duration_ms.is_none() { return None; }
        
        // 2. Skip long videos (> 10 minutes) and apply title keyword filtering for extra safety
        if let Some(ms) = duration_ms {
            if ms > 10 * 60 * 1000 { return None; }
        }

        let title_low = title.to_lowercase();
        let trash = vec![
            "review", "let's play", "gameplay", "unboxing", "reaction", 
            "episode", "podcast", "full album", "tutorial", "walkthrough",
            "обзор", "прохождение", "распаковка", "реакция"
        ];
        if trash.iter().any(|&k| title_low.contains(k)) {
            return None;
        }
        
        // Skip if artist explicitly looks like a generic YouTube channel by having ONLY numeric data, 
        // but be careful: "views" is common even in YM. 
        // We'll trust the WEB_REMIX client more and rely on Title keywords.

        // 3. Skip common "trash" keywords in title
        let title_lower = title.to_lowercase();
        let trash_keywords = [
            "серия", "сезон", "полный фильм", "full movie", "episode", "season", 
            "1-4", "5-8", "9-12", "сборник серий", "все серии"
        ];
        if trash_keywords.iter().any(|k| title_lower.contains(k)) {
            return None;
        }

        let cover_url = video["thumbnail"]["thumbnails"]
            .as_array().and_then(|arr| arr.last())
            .and_then(|t| t["url"].as_str())
            .map(|s| s.to_string());

        Some(Track {
            id: format!("youtube:{}", id),
            title,
            artist,
            provider: self.id().to_string(),
            duration_ms,
            cover_url,
            stream_url: None,
            liked_at: None,
        })
    }

    fn find_duration_anywhere(&self, val: &Value) -> Option<u32> {
        if let Some(s) = val.as_str() {
            if let Some(d) = self.parse_duration(s) {
                return Some(d);
            }
        }
        
        if let Some(obj) = val.as_object() {
            for (k, v) in obj {
                // Skip common keys that might have false positives (though unlikely with parse_duration)
                if k == "videoId" || k == "browseId" || k == "trackingParams" { continue; }
                if let Some(d) = self.find_duration_anywhere(v) {
                    return Some(d);
                }
            }
        } else if let Some(arr) = val.as_array() {
            for v in arr {
                if let Some(d) = self.find_duration_anywhere(v) {
                    return Some(d);
                }
            }
        }
        None
    }

    fn parse_responsive_item(&self, item: &Value) -> Option<Track> {
        // Detect renderer type: musicResponsiveListItemRenderer (Search) or playlistPanelVideoRenderer (Radio/Next)
        let (track_data, is_radio) = if let Some(data) = item.get("musicResponsiveListItemRenderer") {
            (data, false)
        } else if let Some(data) = item.get("playlistPanelVideoRenderer") {
            (data, true)
        } else if item.get("videoId").is_some() {
            // Already direct data (passed from get_recommendations)
            (item, true)
        } else {
            return None;
        };

        let id = track_data["videoId"].as_str()
            .or_else(|| track_data["playlistItemData"]["videoId"].as_str())
            .or_else(|| track_data["navigationEndpoint"]["watchEndpoint"]["videoId"].as_str())
            .unwrap_or("");
        
        if id.is_empty() { return None; }

        let title = if is_radio {
            self.extract_text(&track_data["title"])
        } else {
            self.extract_text(&track_data["flexColumns"][0]["musicResponsiveListItemFlexColumnRenderer"]["text"])
        };

        let raw_subtitle = if is_radio {
            self.extract_text(&track_data["longBylineText"])
        } else {
            self.extract_text(&track_data["flexColumns"][1]["musicResponsiveListItemFlexColumnRenderer"]["text"])
        };
        
        // STRICT FILTER: Check for "Review", "Episode", etc. in subtitle
        let sub_low = raw_subtitle.to_lowercase();
        if sub_low.contains("episode") || sub_low.contains("unboxing") || sub_low.contains("gameplay") || sub_low.contains("review") {
            return None;
        }

        // Clean up artist (remove "Song • ", "Video • ")
        let artist = if raw_subtitle.contains(" • ") {
            let parts: Vec<&str> = raw_subtitle.split(" • ").collect();
            let first = parts[0];
            if first == "Song" || first == "Video" || first == "Episode" {
                parts.get(1).unwrap_or(&"").to_string()
            } else {
                first.to_string()
            }
        } else {
            raw_subtitle
        };

        let cover_url = track_data["thumbnail"]["musicThumbnailRenderer"]["thumbnail"]["thumbnails"]
            .as_array().or_else(|| track_data["thumbnail"]["thumbnails"].as_array())
            .and_then(|arr| arr.last())
            .and_then(|t| t["url"].as_str())
            .map(|s| s.to_string());

        let duration_ms = self.find_duration_anywhere(track_data);
        if duration_ms.is_none() && is_radio {
            // Some radio items have duration in a different spot
            // but find_duration_anywhere should find it.
        }

        Some(Track {
            id: format!("youtube:{}", id),
            title,
            artist,
            provider: self.id().to_string(),
            duration_ms,
            cover_url,
            stream_url: None,
            liked_at: None,
        })
    }


    async fn get_or_create_worker(&self, handle: &AppHandle) -> Result<WebviewWindow, String> {
        if let Some(w) = handle.get_webview_window("youtube-auth") {
            println!("[YouTube] Reusing hidden auth window as worker");
            return Ok(w);
        }
        
        if let Some(w) = handle.get_webview_window("yt-worker") {
            println!("[YouTube] Reusing existing stealth worker");
            return Ok(w);
        }

        println!("[YouTube] Creating stealth background worker...");
        let handle_clone = handle.clone();
        handle.run_on_main_thread(move || {
            if handle_clone.get_webview_window("yt-worker").is_some() {
                return;
            }
            let url = WebviewUrl::External("https://music.youtube.com/playlist?list=FLLM".parse().unwrap());
            let chrome_ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
            
            let builder = WebviewWindowBuilder::new(&handle_clone, "yt-worker", url)
                .title("YouTube Sync Worker")
                .visible(false)
                .position(-10000.0, -10000.0) // Stay out of sight
                .skip_taskbar(true)
                .initialization_script(r#"
                    console.log("Worker initialized");
                "#)
                .user_agent(chrome_ua);
            
            if let Err(e) = builder.build() {
                println!("[YouTube] Failed to build stealth worker: {}", e);
            }
        }).map_err(|e| e.to_string())?;

        tokio::time::sleep(std::time::Duration::from_secs(10)).await;
        
        handle.get_webview_window("yt-worker")
            .ok_or_else(|| "Failed to retrieve stealth worker window".to_string())
    }
}

#[async_trait]
impl MusicProvider for YouTubeProvider {
    fn id(&self) -> &str { "youtube" }
    fn name(&self) -> &str { "YouTube Music" }

    async fn search(&self, query: &str, _page: u32) -> Result<Vec<Track>, String> {
        let body = json!({
            "context": {
                "client": {
                    "clientName": "WEB_REMIX",
                    "clientVersion": "1.20240214.01.00",
                    "hl": "en",
                    "gl": "US"
                }
            },
            "query": query
        });

        let data = self.call_api("search", body).await?;
        
        let mut tracks = Vec::new();
        self.find_responsive_items(&data, &mut tracks);
        
        Ok(tracks)
    }

    async fn get_stream_url(&self, track_id: &str) -> Result<String, String> {
        let video_id = track_id.replace("youtube:", "");
        
        let body = json!({
            "context": {
                "client": {
                    "clientName": "ANDROID_VR",
                    "clientVersion": "1.65.10",
                    "androidSdkVersion": 32,
                    "osName": "Android",
                    "hl": "en",
                    "gl": "US"
                }
            },
            "videoId": video_id,
            "playbackContext": {
                "contentPlaybackContext": {
                    "signatureTimestamp": 19876
                }
            }
        });

        let data = self.call_api("player", body).await?;
        
        let mut final_url = None;
        if let Some(streaming_data) = data["streamingData"].as_object() {
            // Prefer itag 140 (AAC) over itag 251 (Opus/WebM) because Windows Media Foundation doesn't support WebM
            if let Some(formats) = streaming_data.get("adaptiveFormats").and_then(|v| v.as_array()) {
                let audio = formats.iter()
                    .find(|f| f["itag"] == 140 && f.get("url").is_some())
                    .or_else(|| formats.iter().find(|f| f["itag"] == 251 && f.get("url").is_some()))
                    .or_else(|| formats.iter().find(|f| f["mimeType"].as_str().unwrap_or("").starts_with("audio/") && f.get("url").is_some()));

                    if let Some(best_audio) = audio {
                        if let Some(url) = best_audio["url"].as_str() {
                            final_url = Some(url.to_string());
                        }
                    }
            }
            
            // Fallback to normal formats
            if final_url.is_none() {
                if let Some(formats) = streaming_data.get("formats").and_then(|v| v.as_array()) {
                    if let Some(format) = formats.first() {
                         if let Some(url) = format["url"].as_str() {
                             final_url = Some(url.to_string());
                         }
                    }
                }
            }
        }

        final_url.ok_or_else(|| "No playable stream found".to_string())
    }

    async fn get_playlists(&self, handle: AppHandle) -> Result<Vec<Playlist>, String> {
        let _lock = self.worker_lock.lock().await;
        let window = self.get_or_create_worker(&handle).await?;
        let _ = window.eval("window.location.hash = ''");
        
        println!("[YouTube] get_playlists: navigating to library...");
        const TARGET_URL: &str = "https://music.youtube.com/library/playlists";
        let _ = window.navigate(TARGET_URL.parse().unwrap());
        
        // 1. Wait for navigation to start/change URL
        let mut url_reached = false;
        for _ in 0..10 {
            tokio::time::sleep(std::time::Duration::from_millis(500)).await;
            if let Ok(url) = window.url() {
                if url.as_str().contains("library/playlists") {
                    url_reached = true;
                    break;
                }
            }
        }
        
        if !url_reached {
            println!("[YouTube] Warning: Could not verify TARGET_URL reached, proceeding anyway...");
        }

        // 2. Stabilization delay (important for WebView context)
        tokio::time::sleep(std::time::Duration::from_millis(1500)).await;

        let js = r#"
            (async () => {
                const sleep = ms => new Promise(r => setTimeout(r, ms));
                const findPlaylists = (obj, result = []) => {
                    if (!obj || typeof obj !== 'object') return result;
                    if (Array.isArray(obj)) {
                        for (const item of obj) findPlaylists(item, result);
                        return result;
                    }
                    
                    const renderer = obj.musicTwoRowItemRenderer || obj.musicResponsiveListItemRenderer || obj.playlistRenderer;
                    if (renderer) {
                        const title = renderer.title?.runs?.map(r => r.text).join('') || renderer.title?.simpleText;
                        const browseId = renderer.navigationEndpoint?.browseEndpoint?.browseId || renderer.playlistId;
                        if (title && browseId) {
                            const subtitle = renderer.subtitle?.runs?.map(r => r.text).join('') || renderer.subtitle?.simpleText || '';
                            const countMatch = subtitle.match(/(\d+)/);
                            const trackCount = countMatch ? parseInt(countMatch[1]) : null;
                            
                            const thumbObj = renderer.thumbnail?.musicThumbnailRenderer || renderer.thumbnailRenderer?.musicThumbnailRenderer || renderer.thumbnail;
                            const thumbnail = thumbObj?.thumbnail?.thumbnails?.[0]?.url || thumbObj?.thumbnails?.[0]?.url;
                            result.push({ id: 'youtube:' + browseId, title: title, cover_url: thumbnail, track_count: trackCount });
                        }
                    }
                    for (const key in obj) {
                        if (key !== 'musicTwoRowItemRenderer' && key !== 'musicResponsiveListItemRenderer') {
                            findPlaylists(obj[key], result);
                        }
                    }
                    return result;
                };

                const scrapeDom = () => {
                    const items = document.querySelectorAll('ytmusic-two-row-item-renderer, ytmusic-responsive-list-item-renderer');
                    if (items.length === 0) return [];
                    return Array.from(items).map(item => {
                        const allLinks = item.querySelectorAll('a.yt-simple-endpoint');
                        let title = '';
                        for (const link of allLinks) {
                            if (link.closest('#subtitle') || link.classList.contains('subtitle')) continue;
                            const text = link.innerText.trim();
                            if (text && text !== 'треков' && text !== 'tracks' && isNaN(parseInt(text))) {
                                title = text;
                                break;
                            }
                        }
                        if (!title) {
                            const titleEl = item.querySelector('.title-group #title, .title, #title');
                            title = titleEl?.innerText?.trim() || '';
                        }
                        
                        const subEl = item.querySelector('#subtitle, .subtitle');
                        const subText = subEl?.innerText || '';
                        const countMatch = subText.match(/(\d+)/);
                        const trackCount = countMatch ? parseInt(countMatch[1]) : null;

                        const link = item.querySelector('a[href*="browse/VL"], a[href*="list=PL"], a[href*="list=VLLL"], a[href*="list=LM"]');
                        if (!link) return null;
                        const href = link.getAttribute('href');
                        let browseId = '';
                        if (href.includes('browse/')) browseId = href.split('browse/')[1].split('?')[0];
                        else if (href.includes('list=')) {
                            const url = new URL(href, window.location.origin);
                            browseId = url.searchParams.get('list');
                        }
                        if (!browseId) return null;
                        const img = item.querySelector('img')?.src;
                        return { id: 'youtube:' + browseId, title, cover_url: img, track_count: trackCount };
                    }).filter(x => x && x.id);
                };

                try {
                    for (let i = 0; i < 30; i++) {
                        let playlists = [];
                        if (typeof ytInitialData !== 'undefined') {
                            playlists = findPlaylists(ytInitialData);
                        }
                        if (playlists.length === 0) {
                            playlists = scrapeDom();
                        }
                        
                        if (playlists.length > 0) {
                            const unique = [];
                            const seen = new Set();
                            for (const p of playlists) {
                                if (!seen.has(p.id)) {
                                    seen.add(p.id);
                                    unique.push(p);
                                }
                            }
                            window.location.hash = 'yt_browse_res=' + encodeURIComponent(JSON.stringify(unique));
                            return;
                        }
                        await sleep(500);
                    }
                    window.location.hash = 'yt_browse_res=error_timeout';
                } catch (e) {
                    window.location.hash = 'yt_browse_res=error_catch_' + encodeURIComponent(e.message);
                }
            })()
        "#;
        
        window.eval(js).map_err(|e| e.to_string())?;
        
        for _ in 0..30 {
            tokio::time::sleep(std::time::Duration::from_secs(1)).await;
            if let Ok(url) = window.url() {
                if let Some(fragment) = url.fragment() {
                    if fragment.starts_with("yt_browse_res=") {
                        let data_encoded = fragment.trim_start_matches("yt_browse_res=");
                        if data_encoded.starts_with("error_") { return Err(data_encoded.to_string()); }
                        let data_json = urlencoding::decode(data_encoded).unwrap().to_string();
                        let items: Vec<Value> = serde_json::from_str(&data_json).map_err(|e| e.to_string())?;
                        
                        let playlists: Vec<Playlist> = items.into_iter().map(|v| {
                            let title = v["title"].as_str().unwrap_or_default().to_string();
                            let id = v["id"].as_str().unwrap_or_default().to_string();
                            println!("[YouTube] get_playlists: ID={} Title={}", id, title);
                            Playlist {
                                id,
                                title,
                                provider: self.id().to_string(),
                                cover_url: v["cover_url"].as_str().map(|s| s.to_string()),
                                track_count: v["track_count"].as_u64().map(|n| n as u32),
                            }
                        }).collect();
                        
                        println!("[YouTube] get_playlists: found {} playlists", playlists.len());
                        return Ok(playlists);
                    }
                }
            }
        }
        Err("Timed out fetching playlists via navigation".to_string())
    }

    async fn get_playlist_tracks(&self, playlist_id: &str, handle: AppHandle) -> Result<Vec<Track>, String> {
        let _lock = self.worker_lock.lock().await;
        let browse_id = playlist_id.replace("youtube:", "");
        let window = self.get_or_create_worker(&handle).await?;
        let _ = window.eval("window.location.hash = ''");
        
        println!("[YouTube] get_playlist_tracks: navigating to playlist {}...", browse_id);
        let url = format!("https://music.youtube.com/playlist?list={}", browse_id);
        let _ = window.navigate(url.parse().unwrap());
        
        // 1. Wait for navigation to start/change URL
        let mut url_reached = false;
        for _ in 0..10 {
            tokio::time::sleep(std::time::Duration::from_millis(500)).await;
            if let Ok(current_url) = window.url() {
                if current_url.as_str().contains(&browse_id) {
                    url_reached = true;
                    break;
                }
            }
        }

        if !url_reached {
            println!("[YouTube] Warning: Could not verify playlist URL reached, proceeding anyway...");
        }

        // 2. Stabilization delay
        tokio::time::sleep(std::time::Duration::from_millis(1500)).await;

        let js = r#"
            (async () => {
                const sleep = ms => new Promise(r => setTimeout(r, ms));
                const findInJson = (obj, result = []) => {
                    if (!obj || typeof obj !== 'object') return result;
                    if (obj.musicResponsiveListItemRenderer) {
                        const tr = obj.musicResponsiveListItemRenderer;
                        const videoId = tr.playlistItemData?.videoId || tr.videoId;
                        if (videoId) {
                            const title = tr.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text;
                            const artist = tr.flexColumns?.[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text;
                            const thumbnail = tr.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails?.[0]?.url;
                            const durationText = tr.fixedColumns?.[0]?.musicResponsiveListItemFixedColumnRenderer?.text?.runs?.[0]?.text;
                            let durationMs = null;
                            if (durationText) {
                                const parts = durationText.split(':').map(p => parseInt(p));
                                if (parts.length === 2) durationMs = (parts[0] * 60 + parts[1]) * 1000;
                                else if (parts.length === 3) durationMs = (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
                            }
                            result.push({ id: videoId, t: title, a: artist, p: thumbnail, d: durationMs });
                        }
                    }
                    for (const key in obj) {
                        if (Object.prototype.hasOwnProperty.call(obj, key)) {
                            findInJson(obj[key], result);
                        }
                    }
                    return result;
                };

                const scrapeTracksDom = () => {
                    const items = document.querySelectorAll('ytmusic-responsive-list-item-renderer');
                    if (items.length === 0) return [];
                    return Array.from(items).map(item => {
                        const titleEl = item.querySelector('.title, #title, a.yt-simple-endpoint');
                        if (!titleEl) return null;
                        const title = titleEl.innerText.trim();
                        const artistEl = item.querySelector('.subtitle, #subtitle, [class*="secondary-column"]');
                        const artist = artistEl?.innerText?.trim() || '';
                        const videoId = item.querySelector('a[href*="watch?v="]')?.getAttribute('href')?.split('v=')?.[1]?.split('&')?.[0];
                        if (!videoId) return null;
                        const img = item.querySelector('img')?.src;
                        
                        // Extract duration
                        const fixedColumns = item.querySelectorAll('.fixed-column.style-scope.ytmusic-responsive-list-item-renderer');
                        let durationMs = null;
                        for (const col of fixedColumns) {
                            const text = col.innerText.trim();
                            if (text && /^(\d+:)?\d+:\d+$/.test(text)) {
                                const parts = text.split(':').map(p => parseInt(p));
                                if (parts.length === 2) durationMs = (parts[0] * 60 + parts[1]) * 1000;
                                else if (parts.length === 3) durationMs = (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
                                break;
                            }
                        }
                        
                        return { id: videoId, t: title, a: artist, p: img, d: durationMs };
                    }).filter(x => x !== null);
                };

                try {
                    for (let i = 0; i < 30; i++) {
                        let tracks = [];
                        if (typeof ytInitialData !== 'undefined') {
                            tracks = findInJson(ytInitialData);
                        }
                        if (tracks.length === 0) {
                            tracks = scrapeTracksDom();
                        }
                        
                        if (tracks.length > 0) {
                            window.location.hash = 'yt_playlist_res=' + encodeURIComponent(JSON.stringify(tracks));
                            return;
                        }
                        await sleep(500);
                    }
                    window.location.hash = 'yt_playlist_res=error_timeout';
                } catch (e) {
                    window.location.hash = 'yt_playlist_res=error_catch_' + encodeURIComponent(e.message);
                }
            })()
        "#;
        
        window.eval(js).map_err(|e| e.to_string())?;
        
        for _ in 0..60 {
            tokio::time::sleep(std::time::Duration::from_millis(500)).await;
            if let Ok(url) = window.url() {
                if let Some(fragment) = url.fragment() {
                    if fragment.starts_with("yt_playlist_res=") {
                        let data_encoded = fragment.trim_start_matches("yt_playlist_res=");
                        if data_encoded.starts_with("error_") { return Err(data_encoded.to_string()); }
                        let data_json = urlencoding::decode(data_encoded).unwrap().to_string();
                        let js_tracks: Vec<Value> = serde_json::from_str(&data_json).map_err(|e| e.to_string())?;
                        
                        let tracks: Vec<Track> = js_tracks.into_iter().map(|v| {
                            Track {
                                id: v["id"].as_str().unwrap_or_default().to_string(),
                                title: v["t"].as_str().unwrap_or_default().to_string(),
                                artist: v["a"].as_str().unwrap_or_default().to_string(),
                                provider: self.id().to_string(),
                                duration_ms: v["d"].as_u64().map(|n| n as u32),
                                cover_url: v["p"].as_str().map(|s| s.to_string()),
                                stream_url: None,
                                liked_at: None,
                            }
                        }).collect();
                        
                        println!("[YouTube] get_playlist_tracks: found {} tracks", tracks.len());
                        return Ok(tracks);
                    }
                }
            }
        }
        Err("Timed out fetching playlist tracks via navigation".to_string())
    }

    async fn get_user_info(&self) -> Result<Option<UserInfo>, String> {
        Ok(None)
    }

    async fn auth(&self, handle: AppHandle) -> Result<bool, String> {
        // Close any existing auth window
        if let Some(existing) = handle.get_webview_window("youtube-auth") {
            let _ = existing.close();
            tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
        }

        let (tx, rx) = tokio::sync::oneshot::channel();
        let tx = Arc::new(tokio::sync::Mutex::new(Some(tx)));
        
        let auth_manager = self.auth_manager.clone();
        let handle_clone = handle.clone();
        
        handle.run_on_main_thread(move || {
            let tx_clone = tx.clone();
            let auth_manager_clone = auth_manager.clone();
            
            if let Some(existing) = handle_clone.get_webview_window("youtube-auth") {
                let _ = existing.set_focus();
                return;
            }

            let url = match "https://accounts.google.com/ServiceLogin?service=youtube&continue=https%3A%2F%2Fmusic.youtube.com%2F".parse() {
                Ok(u) => WebviewUrl::External(u),
                Err(e) => {
                    println!("[YouTube] Failed to parse auth URL: {}", e);
                    return;
                }
            };

            let chrome_ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
            
            let builder = WebviewWindowBuilder::new(&handle_clone, "youtube-auth", url)
                .title("YouTube Music Login")
                .inner_size(850.0, 700.0)
                .user_agent(chrome_ua);

            // Spawn the cookie polling task
            // Uses handle.get_webview_window() to re-fetch the window (like SoundCloud does)
            let handle_poll = handle_clone.clone();
            let tx_poll = tx_clone.clone();
            let auth_mgr_poll = auth_manager_clone.clone();
            
            tauri::async_runtime::spawn(async move {
                // Wait for the window to fully load
                tokio::time::sleep(std::time::Duration::from_secs(5)).await;
                
                for _ in 0..150 {
                    tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                    
                    let w = match handle_poll.get_webview_window("youtube-auth") {
                        Some(w) => w,
                        None => break,
                    };
                    
                    // Check if we're on music.youtube.com (login succeeded)
                    if let Ok(current_url) = w.url() {
                        if current_url.as_str().contains("music.youtube.com") {
                            // Capture ALL available cookies — no name checks
                            // If cookies are all HttpOnly, fall back to ytcfg page data
                            let js_trap = r#"
                                (() => {
                                    if (window.location.hash.includes('yt_cookies=')) return;
                                    let data = document.cookie;
                                    if (!data || data.length < 10) {
                                        // Fallback: try to get SAPISID from ytcfg (embedded in page JS)
                                        try {
                                            if (typeof ytcfg !== 'undefined') {
                                                const pairs = [];
                                                const id = ytcfg.get && ytcfg.get('DELEGATED_SESSION_ID');
                                                if (id) pairs.push('SESSION_ID=' + id);
                                                const dsid = ytcfg.get && ytcfg.get('DATASYNC_ID');
                                                if (dsid) pairs.push('DATASYNC_ID=' + dsid);
                                                if (pairs.length > 0) data = pairs.join('; ');
                                            }
                                        } catch(e) {}
                                    }
                                    if (data && data.length > 0) {
                                        window.location.hash = 'yt_cookies=' + encodeURIComponent(data);
                                    }
                                })()
                            "#;
                            let _ = w.eval(js_trap);
                        }
                    }

                    // Check URL fragment for captured cookies (like SoundCloud checks for access_token)
                    if let Ok(url) = w.url() {
                        if let Some(fragment) = url.fragment() {
                            if fragment.contains("yt_cookies=") {
                                if let Some(cookie_data) = fragment.split("yt_cookies=").nth(1).and_then(|s| s.split('&').next()) {
                                    let decoded = urlencoding::decode(cookie_data).unwrap_or_default().to_string();
                                    if !decoded.is_empty() {
                                        let am = auth_mgr_poll.clone();
                                        let t_tx = tx_poll.clone();
                                        tauri::async_runtime::spawn(async move {
                                            am.set_token("youtube", decoded).await;
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

            if let Err(e) = builder.build() {
                println!("[YouTube] Failed to build auth window: {}", e);
            }
        }).map_err(|e| e.to_string())?;

        match tokio::time::timeout(std::time::Duration::from_secs(300), rx).await {
            Ok(Ok(success)) => {
                // HIDE the auth window instead of closing it!
                // It stays on music.youtube.com with ALL cookies (inc. HttpOnly).
                // like_track reuses this window for authenticated fetch() calls.
                if let Some(w) = handle.get_webview_window("youtube-auth") {
                    let _ = w.hide();
                    println!("[YouTube Auth] Window hidden (kept alive as worker)");
                }
                Ok(success)
            },
            _ => {
                let _ = handle.get_webview_window("youtube-auth").map(|w| w.close());
                Ok(false)
            }
        }
    }


    async fn like_track(&self, track_id: &str, like: bool, handle: AppHandle) -> Result<bool, String> {
        let video_id = track_id.replace("youtube:", "");
        let endpoint = if like { "like/like" } else { "like/removelike" };
        
        println!("[YouTube] like_track: video_id={}, like={}", video_id, like);
        
        let window = self.get_or_create_worker(&handle).await?;

        let _ = window.eval("window.location.hash = ''");
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
        
        let js = format!(r#"
            (async () => {{
                try {{
                    if (typeof ytcfg === 'undefined') {{
                        window.location.hash = 'yt_res=error_no_ytcfg';
                        return;
                    }}
                    
                    const context = ytcfg.get ? ytcfg.get('INNERTUBE_CONTEXT') : null;
                    const apiKey = ytcfg.get ? ytcfg.get('INNERTUBE_API_KEY') : 'AIzaSyAO_FJ2nm_8u6qU';
                    
                    if (!context) {{
                        window.location.hash = 'yt_res=error_no_context';
                        return;
                    }}

                    const cookies = document.cookie;
                    const sapisidMatch = cookies.split('; ').find(c => c.startsWith('SAPISID='));
                    if (!sapisidMatch) {{
                        window.location.hash = 'yt_res=error_not_logged_in';
                        return;
                    }}
                    const sapisid = sapisidMatch.split('=')[1];
                    const timestamp = Math.floor(Date.now() / 1000);
                    const hashInput = timestamp + ' ' + sapisid + ' https://music.youtube.com';
                    const hashBuffer = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(hashInput));
                    const hashHex = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
                    const authHeader = 'SAPISIDHASH ' + timestamp + '_' + hashHex;
                    
                    const endpointUrl = `https://music.youtube.com/youtubei/v1/{0}?alt=json&key=${{apiKey}}`;
                    
                    const headers = {{
                        'Content-Type': 'application/json',
                        'X-Youtube-Client-Name': context.client.clientName || '67',
                        'X-Youtube-Client-Version': context.client.clientVersion || '1.20240214.01.00',
                        'X-Goog-AuthUser': context.user.authuser || '0',
                        'X-Origin': 'https://music.youtube.com',
                        'Authorization': authHeader
                    }};
                    
                    const body = {{
                        context: context,
                        target: {{ videoId: '{1}' }}
                    }};
                    
                    const res = await fetch(endpointUrl, {{
                        method: 'POST',
                        headers: headers,
                        body: JSON.stringify(body),
                        credentials: 'include'
                    }});
                    
                    if (res.ok) {{
                        window.location.hash = 'yt_res=ok';
                    }} else {{
                        const errText = await res.text();
                        window.location.hash = 'yt_res=error_' + res.status + '_' + encodeURIComponent(errText.substring(0, 100));
                    }}
                }} catch (e) {{
                    window.location.hash = 'yt_res=error_catch_' + encodeURIComponent(e.message);
                }}
            }})()
        "#, endpoint, video_id);
        
        window.eval(&js).map_err(|e| format!("JS injection: {}", e))?;
        
        for _ in 0..30 {
            tokio::time::sleep(std::time::Duration::from_secs(1)).await;
            
            if let Ok(url) = window.url() {
                if let Some(fragment) = url.fragment() {
                    if fragment == "yt_res=ok" {
                        println!("[YouTube Like] Successfully liked track via stealth worker");
                        return Ok(true);
                    } else if fragment.starts_with("yt_res=error_") {
                        let err = fragment.trim_start_matches("yt_res=error_");
                        println!("[YouTube Like] Error in stealth worker: {}", err);
                        return Ok(false);
                    }
                }
            }
        }
        
        println!("[YouTube Like] Stealth worker timed out (URL was: {:?})", window.url().map(|u| u.to_string()));
        Ok(false)
    }

    async fn get_liked_tracks(&self, handle: AppHandle) -> Result<Vec<Track>, String> {
        println!("[YouTube] Sync: Navigating to Liked Music playlist...");
        let window = self.get_or_create_worker(&handle).await?;
        
        let _ = window.eval("window.location.hash = ''");
        
        // Navigate directly to the playlist
        let _ = window.navigate("https://music.youtube.com/playlist?list=LM".parse().unwrap());
        
        // Wait for page load and data
        tokio::time::sleep(std::time::Duration::from_secs(5)).await;

        let sync_js = r#"
            (async () => {
                try {
                    const findInJson = (obj) => {
                        let result = [];
                        if (!obj || typeof obj !== 'object') return result;
                        if (obj.musicResponsiveListItemRenderer) {
                            const tr = obj.musicResponsiveListItemRenderer;
                            const videoId = tr.playlistItemData?.videoId || tr.videoId;
                            if (videoId) {
                                const title = tr.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text;
                                const artist = tr.flexColumns?.[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text;
                                const thumbnail = tr.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails?.[0]?.url;
                                result.push({ id: 'youtube:' + videoId, t: title, a: artist, p: thumbnail });
                            }
                        }
                        for (const key in obj) {
                            if (Object.prototype.hasOwnProperty.call(obj, key)) {
                                const sub = findInJson(obj[key]);
                                if (sub.length > 0) result = result.concat(sub);
                            }
                        }
                        return result;
                    };

                    const scrapeDom = () => {
                        const items = document.querySelectorAll('ytmusic-responsive-list-item-renderer');
                        return Array.from(items).map(item => {
                            const link = item.querySelector('a[href*="watch?v="]');
                            if (!link) return null;
                            const videoId = new URL(link.href).searchParams.get('v');
                            if (!videoId) return null;
                            const title = item.querySelector('.title-column .title')?.innerText || 'Unknown';
                            const artist = item.querySelector('.secondary-flex-columns .complex-string')?.innerText || 'Unknown';
                            const img = item.querySelector('img')?.src;
                            return { id: 'youtube:' + videoId, t: title, a: artist, p: img };
                        }).filter(x => x !== null);
                    };

                    let tracks = [];
                    // 1. Try ytInitialData
                    if (typeof ytInitialData !== 'undefined') {
                        tracks = findInJson(ytInitialData);
                    }
                    // 2. Try Scraper
                    if (tracks.length === 0) {
                        tracks = scrapeDom();
                    }
                    // 3. Try brute force find in scripts
                    if (tracks.length === 0) {
                        for (const s of document.querySelectorAll('script')) {
                            if (s.innerText.includes('ytInitialData =')) {
                                try {
                                    const json = JSON.parse(s.innerText.split('ytInitialData =')[1].split(';')[0].trim());
                                    tracks = findInJson(json);
                                    if (tracks.length > 0) break;
                                } catch(e) {}
                            }
                        }
                    }

                    if (tracks.length > 0) {
                        window.location.hash = 'yt_sync_data=' + encodeURIComponent(JSON.stringify(tracks));
                    } else {
                        const diag = document.body.innerText.substring(0, 100).replace(/\n/g, ' ');
                        window.location.hash = 'yt_sync_error=' + encodeURIComponent('No data. Body: ' + diag);
                    }
                } catch (e) {
                    window.location.hash = 'yt_sync_error=' + encodeURIComponent(e.message);
                }
            })()
        "#;

        for i in 0..60 {
            if i == 0 {
                let _ = window.eval(sync_js);
            }
            
            tokio::time::sleep(std::time::Duration::from_secs(1)).await;
            
            if let Ok(url) = window.url() {
                let fragment = url.fragment().unwrap_or("");
                
                if i % 10 == 0 {
                    println!("[YouTube] Sync Loop {}...", i);
                }

                if fragment.starts_with("yt_sync_data=") {
                    let data_encoded = fragment.trim_start_matches("yt_sync_data=");
                    let data_json = urlencoding::decode(data_encoded)
                        .map_err(|_| "Failed to decode URL encoding".to_string())?
                        .to_string();
                    
                    let js_tracks: Vec<Value> = serde_json::from_str(&data_json).map_err(|e| format!("JSON parse: {}", e))?;
                    println!("[YouTube] Sync: Successfully fetched {} tracks via API", js_tracks.len());
                    
                    let tracks = js_tracks.into_iter().map(|v| {
                        Track {
                            id: v["id"].as_str().unwrap_or_default().to_string(),
                            title: v["t"].as_str().unwrap_or_default().to_string(),
                            artist: v["a"].as_str().unwrap_or_default().to_string(),
                            provider: self.id().to_string(),
                            duration_ms: None,
                            cover_url: v["p"].as_str().map(|s| s.to_string()),
                            stream_url: None,
                            liked_at: None,
                        }
                    }).collect();
                    
                    return Ok(tracks);
                } else if fragment.starts_with("yt_sync_error=") {
                    let err = fragment.trim_start_matches("yt_sync_error=").to_string();
                    println!("[YouTube] Sync API Error: {}", err);
                    return Err(err);
                }
            }
        }
        
        Err("Timed out fetching liked tracks via API".to_string())
    }

    async fn get_recommendations(&self, seed_track_id: Option<String>, _handle: AppHandle) -> Result<Vec<Track>, String> {
        let (video_id, playlist_id) = if let Some(seed) = seed_track_id {
            let id = seed.replace("youtube:", "");
            (id.clone(), format!("RDAMVM{}", id))
        } else {
            // Try to find a personal seed from Liked Music
            println!("[YouTube Wave] No seed provided. Fetching Liked Music for smart seed...");
            let liked = self.get_liked_tracks(_handle.clone()).await.unwrap_or_default();
            
            if !liked.is_empty() {
                use rand::Rng;
                let mut rng = rand::thread_rng();
                let random_track = &liked[rng.gen_range(0..liked.len())];
                let id = random_track.id.replace("youtube:", "");
                println!("[YouTube Wave] Using personal seed: {} - {}", random_track.artist, random_track.title);
                (id.clone(), format!("RDAMVM{}", id))
            } else {
                // Real fallback: search for a generic but safe music mix
                println!("[YouTube Wave] No liked tracks found. Falling back to generic mix.");
                let search_results = self.search("Music Mix", 1).await?;
                if search_results.is_empty() {
                    return Err("Failed to find any seed tracks".to_string());
                }
                let id = search_results[0].id.replace("youtube:", "");
                (id.clone(), format!("RDAMVM{}", id))
            }
        };
        
        println!("[YouTube Wave] Starting radio for video_id: {}", video_id);
        
        // Use the 'next' endpoint to get radio suggestions (automix)
        let body = json!({
            "context": {
                "client": {
                    "clientName": "WEB_REMIX",
                    "clientVersion": "1.20240214.01.00"
                }
            },
            "videoId": video_id,
            "playlistId": playlist_id,
        });

        let data = self.call_api("next", body).await?;
        let mut tracks = Vec::new();
        
        // Parse results from the 'up Next' list or automix
        if let Some(items) = data["contents"]["singleColumnMusicWatchNextResultsRenderer"]["tabbedRenderer"]["watchNextTabbedResultsRenderer"]["tabs"][0]["tabRenderer"]["content"]["musicQueueRenderer"]["content"]["playlistPanelRenderer"]["contents"].as_array() {
            for item in items {
                if let Some(track) = self.parse_responsive_item(&item["playlistPanelVideoRenderer"]) {
                    tracks.push(track);
                }
            }
        } else {
            // Fallback: search if 'next' fails to provide a structured queue
            println!("[YouTube Wave] 'next' endpoint returned no queue, falling back to search");
            return self.search("Music Mix", 1).await;
        }
        
        Ok(tracks)
    }

    async fn create_playlist(&self, _title: &str) -> Result<Playlist, String> {
        Err("Not implemented".to_string())
    }

    async fn add_track_to_playlist(&self, _playlist_id: &str, _track_id: &str) -> Result<bool, String> {
        Ok(false)
    }

    async fn get_auth_header(&self) -> Option<String> {
        self.auth_manager.get_token("youtube").await
    }

    async fn save_token(&self, token: String) -> Result<(), String> {
        self.auth_manager.set_token("youtube", token).await;
        Ok(())
    }
}
