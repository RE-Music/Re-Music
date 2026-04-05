mod auth;
mod config;
mod providers;

use auth::AuthManager;
use providers::manager::ProviderManager;
use tauri::State;
use serde_json::Value;
use std::sync::Arc;
use std::collections::HashMap;
use tauri::Manager;
use crate::config::{ConfigManager, LocalPlaylist};
use tauri_plugin_dialog::DialogExt;
use base64::{Engine as _, engine::general_purpose};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{TrayIconBuilder, TrayIconEvent, MouseButton};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use std::net::SocketAddr;
use once_cell::sync::Lazy;
use tokio::sync::oneshot;
use futures::StreamExt;
use rand::seq::SliceRandom;

// Global map to await results from WebView-based workers (via nmis-proxy protocol)
pub static REQ_MAP: Lazy<Arc<tokio::sync::Mutex<HashMap<String, oneshot::Sender<Result<Value, String>>>>>> = 
    Lazy::new(|| Arc::new(tokio::sync::Mutex::new(HashMap::new())));

pub static DISCORD_CLIENT: Lazy<Arc<tokio::sync::Mutex<discord_presence::Client>>> = 
    Lazy::new(|| {
        let mut client = discord_presence::Client::new(1488564820151242902); // Official RE:Music App ID
        let _ = client.start();
        Arc::new(tokio::sync::Mutex::new(client))
    });

#[tauri::command]
async fn search(
    query: String, 
    provider_id: String, 
    page: u32, 
    state: State<'_, ProviderManager>
) -> Result<Value, String> {
    if provider_id == "all" {
        let mut provider_results = Vec::new();
        let mut futures = Vec::new();
        let providers_list = state.list_providers();
        for (id, _) in providers_list {
            let state_clone = state.inner().clone();
            let query_clone = query.clone();
            let id_clone = id.to_string();
            futures.push(tokio::spawn(async move {
                if let Some(p) = state_clone.get_provider(&id_clone) {
                    return p.search(&query_clone, page).await.unwrap_or_default();
                }
                vec![]
            }));
        }
        for f in futures {
            if let Ok(tracks) = f.await {
                if !tracks.is_empty() {
                    provider_results.push(tracks);
                }
            }
        }
        
        let mut final_tracks = Vec::new();
        if !provider_results.is_empty() {
            let max_len = provider_results.iter().map(|v| v.len()).max().unwrap_or(0);
            for i in 0..max_len {
                for results in &mut provider_results {
                    if i < results.len() {
                        final_tracks.push(results[i].clone());
                    }
                }
            }
        }
        
        Ok(serde_json::to_value(final_tracks).map_err(|e| e.to_string())?)
    } else {
        if let Some(provider) = state.get_provider(&provider_id) {
            let tracks = provider.search(&query, page).await?;
            Ok(serde_json::to_value(tracks).map_err(|e| e.to_string())?)
        } else {
            Err("Provider not found".to_string())
        }
    }
}

#[tauri::command]
async fn get_playlists(
    provider_id: String, 
    state: State<'_, ProviderManager>,
    handle: tauri::AppHandle
) -> Result<Value, String> {
    if let Some(provider) = state.get_provider(&provider_id) {
        let playlists = provider.get_playlists(handle).await?;
        Ok(serde_json::to_value(playlists).map_err(|e| e.to_string())?)
    } else {
        Err("Provider not found".to_string())
    }
}

#[tauri::command]
async fn get_playlist_tracks(
    playlist_id: String,
    provider_id: String,
    state: State<'_, ProviderManager>,
    handle: tauri::AppHandle
) -> Result<Value, String> {
    if let Some(provider) = state.get_provider(&provider_id) {
        let tracks = provider.get_playlist_tracks(&playlist_id, handle).await?;
        Ok(serde_json::to_value(tracks).map_err(|e| e.to_string())?)
    } else {
        Err("Provider not found".to_string())
    }
}

#[tauri::command]
async fn play_track(
    track_id: String, 
    provider_id: String, 
    state: State<'_, ProviderManager>
) -> Result<String, String> {
    get_stream_url(track_id, provider_id, state).await
}

#[tauri::command]
async fn get_stream_url(
    track_id: String, 
    provider_id: String, 
    state: State<'_, ProviderManager>
) -> Result<String, String> {
    if let Some(provider) = state.get_provider(&provider_id) {
        provider.get_stream_url(&track_id).await
    } else {
        Err("Provider not found".to_string())
    }
}

#[tauri::command]
async fn like_track(
    provider_id: String,
    track_id: String,
    like: bool,
    state: State<'_, ProviderManager>,
    handle: tauri::AppHandle
) -> Result<bool, String> {
    println!("[IPC] like_track: provider={}, track={}, like={}", provider_id, track_id, like);
    if let Some(provider) = state.get_provider(&provider_id) {
        let res = provider.like_track(&track_id, like, handle).await;
        println!("[IPC] like_track result: {:?}", res);
        res
    } else {
        Err("Provider not found".to_string())
    }
}

#[tauri::command]
async fn get_track_radio(
    provider_id: String,
    track_id: String,
    state: State<'_, ProviderManager>,
    handle: tauri::AppHandle
) -> Result<Value, String> {
    let primary_tracks = if let Some(p) = state.get_provider(&provider_id) {
        p.get_recommendations(Some(track_id.clone()), handle.clone()).await.unwrap_or_default()
    } else {
        vec![]
    };

    let mut other_tracks = Vec::new();
    let all_providers = state.list_providers();
    for (id, _) in all_providers {
        if id != provider_id {
            if let Some(p) = state.get_provider(&id.to_string()) {
                let recs = p.get_recommendations(None, handle.clone()).await.unwrap_or_default();
                other_tracks.push(recs);
            }
        }
    }

    let mut mixed = Vec::new();
    let mut primary_iter = primary_tracks.into_iter();
    loop {
        if let Some(t) = primary_iter.next() { mixed.push(t); }
        else if other_tracks.is_empty() { break; }
        for list in &mut other_tracks {
            if !list.is_empty() {
                mixed.push(list.remove(0));
            }
        }
        if primary_iter.as_slice().is_empty() && other_tracks.iter().all(|l| l.is_empty()) { break; }
    }
    
    // Shuffle the final list to avoid repetitive sequences
    let mut rng = rand::thread_rng();
    mixed.shuffle(&mut rng);

    Ok(serde_json::to_value(mixed).map_err(|e| e.to_string())?)
}

#[tauri::command]
async fn get_my_wave(
    providers_list: Vec<String>,
    seeds: std::collections::HashMap<String, String>,
    state: State<'_, ProviderManager>,
    handle: tauri::AppHandle
) -> Result<Value, String> {
    let all_available = state.list_providers();
    let mut provider_results = Vec::new();
    let mut futures = Vec::new();
    for (id, _) in all_available {
        let provider_id = id.to_string();
        if !providers_list.is_empty() && !providers_list.contains(&provider_id) {
            continue;
        }
        let state_clone = state.inner().clone();
        let pid_clone = provider_id.clone();
        let provider_seed = seeds.get(&pid_clone).cloned();
        let handle_clone = handle.clone();
        futures.push(tokio::spawn(async move {
            if let Some(p) = state_clone.get_provider(&pid_clone) {
                match p.get_recommendations(provider_seed, handle_clone).await {
                    Ok(tracks) => return (pid_clone, tracks),
                    Err(e) => {
                        println!("[Wave] Provider {} error: {}", pid_clone, e);
                        return (pid_clone, vec![]);
                    }
                }
            }
            (pid_clone, vec![])
        }));
    }
    for f in futures {
        if let Ok((_pid, tracks)) = f.await {
            if !tracks.is_empty() {
                provider_results.push(tracks);
            }
        }
    }
    if provider_results.is_empty() {
        return Err("No tracks found for Wave".to_string());
    }

    let mut final_tracks = Vec::new();
    let mut seen_ids = std::collections::HashSet::new();
    let mut rng = rand::thread_rng();

    // Shuffle each source list first
    for results in &mut provider_results {
        results.shuffle(&mut rng);
    }

    let _num_providers = provider_results.len();
    let target_per_provider = 10; // Take up to 10 from each to form a 20-30 track wave

    // Balanced round-robin interleaving
    for i in 0..target_per_provider {
        for results in &mut provider_results {
            if i < results.len() {
                let track = &results[i];
                let dedup_key = format!("{}-{}", track.title.to_lowercase(), track.artist.to_lowercase());
                if !seen_ids.contains(&dedup_key) {
                    final_tracks.push(track.clone());
                    seen_ids.insert(dedup_key);
                }
            }
        }
    }

    Ok(serde_json::to_value(final_tracks).map_err(|e| e.to_string())?)
}

#[tauri::command]
async fn get_local_playlists(config: State<'_, Arc<ConfigManager>>) -> Result<Value, String> {
    let s = config.settings.read().await;
    Ok(serde_json::to_value(&s.local_playlists).map_err(|e| e.to_string())?)
}

#[tauri::command]
async fn save_local_playlist(
    playlist: LocalPlaylist,
    config: State<'_, Arc<ConfigManager>>
) -> Result<(), String> {
    config.save_local_playlist(playlist).await;
    Ok(())
}

#[tauri::command]
async fn delete_local_playlist(
    id: String,
    config: State<'_, Arc<ConfigManager>>
) -> Result<(), String> {
    config.delete_local_playlist(id).await;
    Ok(())
}

#[tauri::command]
async fn add_to_local_playlist(
    playlist_id: String,
    track: providers::Track,
    config: State<'_, Arc<ConfigManager>>
) -> Result<(), String> {
    let playlist = {
        let s = config.settings.read().await;
        s.local_playlists.iter().find(|p| p.id == playlist_id).cloned()
    };

    if let Some(mut p) = playlist {
        if !p.tracks.iter().any(|t| t.id == track.id && t.provider == track.provider) {
            p.tracks.push(track);
            config.save_local_playlist(p).await;
        }
        Ok(())
    } else {
        Err("Playlist not found".to_string())
    }
}

#[tauri::command]
async fn select_avatar_file(
    app: tauri::AppHandle,
    config: State<'_, Arc<ConfigManager>>
) -> Result<Option<String>, String> {
    let file = app.dialog().file()
        .add_filter("Images", &["jpg", "png", "jpeg", "webp"])
        .blocking_pick_file();

    if let Some(file_path) = file {
        let path = file_path.into_path().map_err(|_| "Failed to get path from dialog".to_string())?;
        let bytes = std::fs::read(&path).map_err(|e| format!("Failed to read file: {}", e))?;
        
        let b64 = general_purpose::STANDARD.encode(bytes);
        let ext = path.extension()
            .and_then(|e| e.to_str())
            .unwrap_or("png");
            
        let data_url = format!("data:image/{};base64,{}", 
            if ext == "jpg" { "jpeg" } else { ext }, 
            b64
        );

        {
            let mut s = config.settings.write().await;
            s.avatar_url = data_url.clone();
        }
        config.save().await;
        
        Ok(Some(data_url))
    } else {
        Ok(None)
    }
}


#[tauri::command]
async fn create_playlist(
    provider_id: String,
    title: String,
    state: State<'_, ProviderManager>
) -> Result<Value, String> {
    if let Some(provider) = state.get_provider(&provider_id) {
        let playlist = provider.create_playlist(&title).await?;
        Ok(serde_json::to_value(playlist).map_err(|e| e.to_string())?)
    } else {
        Err("Provider not found".to_string())
    }
}

#[tauri::command]
async fn add_track_to_playlist(
    provider_id: String,
    playlist_id: String,
    track_id: String,
    state: State<'_, ProviderManager>
) -> Result<bool, String> {
    if let Some(provider) = state.get_provider(&provider_id) {
        provider.add_track_to_playlist(&playlist_id, &track_id).await
    } else {
        Err("Provider not found".to_string())
    }
}

#[tauri::command]
fn get_providers(state: State<'_, ProviderManager>) -> Value {
    serde_json::to_value(state.list_providers().into_iter().map(|(id, name)| {
        serde_json::json!({ "id": id, "name": name })
    }).collect::<Vec<_>>()).unwrap_or(serde_json::json!([]))
}

// Settings and EQ are partially stubbed or managed by ConfigManager

#[tauri::command]
async fn get_eq_state(config: State<'_, Arc<ConfigManager>>) -> Result<Value, String> {
    let s = config.settings.read().await;
    if let Some(state) = &s.eq_state {
        Ok(serde_json::to_value(state).unwrap_or(Value::Null))
    } else {
        Ok(serde_json::json!({
            "gains": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            "isEnabled": false,
            "activePreset": "Flat",
            "presets": []
        }))
    }
}

#[tauri::command]
async fn save_eq_state(payload: crate::config::EqState, config: State<'_, Arc<ConfigManager>>) -> Result<(), String> {
    println!("[IPC] save_eq_state called with: {:?}", payload);
    {
        let mut s = config.settings.write().await;
        s.eq_state = Some(payload);
    }
    config.save().await;
    Ok(())
}

#[tauri::command]
async fn get_achievements(config: State<'_, Arc<ConfigManager>>) -> Result<Vec<String>, String> {
    let s = config.settings.read().await;
    Ok(s.unlocked_achievements.clone())
}

#[tauri::command]
async fn unlock_achievement(id: String, config: State<'_, Arc<ConfigManager>>) -> Result<bool, String> {
    println!("[Achievement] unlock_achievement attempt: {}", id);
    let mut updated = false;
    {
        let mut s = config.settings.write().await;
        if !s.unlocked_achievements.contains(&id) {
            println!("[Achievement] Unlocked: {}", id);
            s.unlocked_achievements.push(id);
            updated = true;
        }
    }
    if updated {
        config.save().await;
    }
    Ok(updated)
}



#[tauri::command]
async fn get_settings(config: State<'_, Arc<ConfigManager>>) -> Result<Value, String> {
    let settings = config.settings.read().await;
    Ok(serde_json::json!({
        "theme": &settings.theme,
        "language": &settings.language,
        "vibeGifMode": &settings.vibe_gif_mode,
        "volume": settings.volume,
        "profileName": &settings.profile_name,
        "avatarUrl": &settings.avatar_url
    }))
}

#[tauri::command]
async fn check_auth(state: State<'_, Arc<AuthManager>>, config: State<'_, Arc<ConfigManager>>) -> Result<Value, String> {
    let status = state.list_auth_status().await;
    
    // Auto-unlock Sound Explorer achievement
    let connected_count = status.values().filter(|&&v| v).count();
    if connected_count >= 3 {
        let mut updated = false;
        {
            let mut s = config.settings.write().await;
            if !s.unlocked_achievements.contains(&"sound-explorer".to_string()) {
                println!("[Achievement] Unlocked auto: sound-explorer");
                s.unlocked_achievements.push("sound-explorer".to_string());
                updated = true;
            }
        }
        if updated {
            config.save().await;
        }
    }
    
    Ok(serde_json::to_value(status).unwrap_or(serde_json::json!({})))
}

#[tauri::command]
async fn get_liked_tracks(
    provider_id: Option<String>,
    state: State<'_, ProviderManager>,
    config: State<'_, Arc<ConfigManager>>,
    handle: tauri::AppHandle
) -> Result<Value, String> {
    let pid = provider_id.unwrap_or_else(|| "all".to_string());
    if pid == "all" {
        let providers = state.list_providers();
        let mut all_tracks = Vec::new();
        let mut futures = Vec::new();
        for (id, _) in providers {
            let state_clone = state.inner().clone();
            let handle_clone = handle.clone();
            futures.push(tokio::spawn(async move {
                if let Some(p) = state_clone.get_provider(&id) {
                    match p.get_liked_tracks(handle_clone).await {
                        Ok(tracks) => return tracks,
                        Err(e) => {
                            println!("[Sync] Error fetching liked tracks for {}: {}", id, e);
                            return vec![];
                        }
                    }
                }
                vec![]
            }));
        }
        for f in futures {
            if let Ok(tracks) = f.await {
                all_tracks.extend(tracks);
            }
        }
        all_tracks.sort_by(|a, b| b.liked_at.cmp(&a.liked_at));

        // Auto-unlock Music Lover achievement
        if all_tracks.len() >= 100 {
            let mut updated = false;
            {
                let mut s = config.settings.write().await;
                if !s.unlocked_achievements.contains(&"music-lover".to_string()) {
                    println!("[Achievement] Unlocked auto: music-lover");
                    s.unlocked_achievements.push("music-lover".to_string());
                    updated = true;
                }
            }
            if updated {
                config.save().await;
            }
        }

        Ok(serde_json::to_value(all_tracks).map_err(|e| e.to_string())?)
    } else {
        if let Some(provider) = state.get_provider(&pid) {
            let mut tracks = provider.get_liked_tracks(handle).await?;
            tracks.sort_by(|a, b| b.liked_at.cmp(&a.liked_at));
            Ok(serde_json::to_value(tracks).map_err(|e| e.to_string())?)
        } else {
            Err("Provider not found".to_string())
        }
    }
}

#[tauri::command]
async fn get_auth_details(state: State<'_, ProviderManager>) -> Result<Value, String> {
    let providers = state.list_providers();
    let mut details = HashMap::new();
    for (id, _) in providers {
        if let Some(p) = state.get_provider(&id) {
            match p.get_user_info().await {
                Ok(Some(info)) => {
                    details.insert(id, info);
                },
                _ => {}
            }
        }
    }
    Ok(serde_json::to_value(details).unwrap_or(serde_json::json!({})))
}

#[tauri::command]
async fn auth_provider(
    provider_id: String, 
    provider_manager: State<'_, ProviderManager>,
    handle: tauri::AppHandle
) -> Result<bool, String> {
    if let Some(p) = provider_manager.get_provider(&provider_id) {
        p.auth(handle).await
    } else {
        Err("Provider not found".to_string())
    }
}

#[tauri::command]
async fn logout_provider(
    provider_id: String, 
    state: State<'_, Arc<AuthManager>>
) -> Result<bool, String> {
    state.delete_token(&provider_id).await;
    Ok(true)
}

#[tauri::command]
async fn set_token(
    provider_id: String, 
    token: String, 
    auth: State<'_, Arc<AuthManager>>,
) -> Result<(), String> {
    auth.set_token(&provider_id, token).await;
    Ok(())
}

#[tauri::command]
async fn get_spotify_token(auth: State<'_, Arc<AuthManager>>) -> Result<Option<String>, String> {
    Ok(auth.get_token("spotify").await)
}

#[tauri::command]
async fn play_spotify_uri(
    device_id: Option<String>, 
    track_id: String,
    auth: State<'_, Arc<AuthManager>>
) -> Result<bool, String> {
    println!("[IPC] play_spotify_uri: device={:?}, track={}", device_id, track_id);
    if let Some(token) = auth.get_token("spotify").await {
        let mut did = match device_id {
            Some(d) => d,
            None => "".to_string()
        };
        
        let client = reqwest::Client::new();
        
        // --- ШАГ 1: ПРОВЕРКА И АВТО-ПОИСК ID ---
        // Если ID пустой или мы подозреваем, что он может быть неверным (как показал лог),
        // попробуем найти устройство по имени "Nano-Mus" в списке Spotify.
        let devices_res = client.get("https://api.spotify.com/v1/me/player/devices")
            .header("Authorization", format!("Bearer {}", token))
            .send()
            .await;
            
        if let Ok(dr) = devices_res {
           if let Ok(json) = dr.json::<serde_json::Value>().await {
               if let Some(devices) = json["devices"].as_array() {
                   // Ищем наше устройство по имени
                   let found = devices.iter().find(|d| d["name"].as_str() == Some("Nano-Mus"));
                   if let Some(dev) = found {
                       if let Some(new_id) = dev["id"].as_str() {
                           if did != new_id {
                               println!("[Spotify Autofix] Replacing ID {} with active ID {}", did, new_id);
                               did = new_id.to_string();
                           }
                       }
                   }
               }
           }
        }

        if did.is_empty() {
            return Err("Устройство Nano-Mus еще не готово. Подожди секунду и попробуй снова.".to_string());
        }

        // --- ШАГ 2: АКТИВАЦИЯ (Transfer) ---
        let transfer_body = serde_json::json!({ "device_ids": [did], "play": false });
        let _ = client.put("https://api.spotify.com/v1/me/player")
            .header("Authorization", format!("Bearer {}", token))
            .json(&transfer_body)
            .send()
            .await;

        // --- ШАГ 3: ВОСПРОИЗВЕДЕНИЕ ---
        let body = serde_json::json!({
            "uris": [format!("spotify:track:{}", track_id)]
        });
        let res = client.put(&format!("https://api.spotify.com/v1/me/player/play?device_id={}", did))
            .header("Authorization", format!("Bearer {}", token))
            .json(&body)
            .send()
            .await;
            
        match res {
            Ok(resp) => {
                let status = resp.status();
                let body_text = resp.text().await.unwrap_or_default();
                if !status.is_success() {
                    println!("[Spotify Playback Error] Status: {}, Body: {}", status, body_text);
                    Ok(false)
                } else {
                    println!("[Spotify Playback Success] Track: {} on device {}", track_id, did);
                    Ok(true)
                }
            },
            Err(e) => {
                println!("[Spotify Playback Request Failed] {}", e);
                Err(e.to_string())
            }
        }
    } else {
        Err("No spotify token".to_string())
    }
}

#[tauri::command]
async fn update_setting(
    key: String, 
    value: Value, 
    config: State<'_, Arc<ConfigManager>>,
    _providers: State<'_, ProviderManager>,
    _handle: tauri::AppHandle
) -> Result<bool, String> {
    println!("[Settings] Updating {} = {:?}", key, value);
    if key == "theme" || key == "language" {
        if let Some(val) = value.as_str() {
            let mut s = config.settings.write().await;
            if key == "theme" { s.theme = val.to_string(); }
            else { s.language = val.to_string(); }
        }
        config.save().await;
    } else if key == "vibeGifMode" {
        if let Some(mode) = value.as_str() {
            let mut s = config.settings.write().await;
            s.vibe_gif_mode = mode.to_string();
        }
        config.save().await;
    } else if key == "volume" {
        if let Some(vol) = value.as_f64() {
            let mut s = config.settings.write().await;
            s.volume = vol;
        }
        config.save().await;
    } else if key == "profileName" {
        if let Some(name) = value.as_str() {
            let mut s = config.settings.write().await;
            s.profile_name = name.to_string();
        }
        config.save().await;
    } else if key == "avatarUrl" {
        if let Some(url) = value.as_str() {
            let mut s = config.settings.write().await;
            s.avatar_url = url.to_string();
        }
        config.save().await;
    }
    Ok(true)
}

async fn start_dev_proxy(provider_manager: ProviderManager) {
    let addr = SocketAddr::from(([127, 0, 0, 1], 5189));
    let listener = match tokio::net::TcpListener::bind(addr).await {
        Ok(l) => l,
        Err(_) => return,
    };
    loop {
        if let Ok((mut socket, _)) = listener.accept().await {
            let pm: ProviderManager = provider_manager.clone();
            tokio::spawn(async move {
                let mut buffer = [0; 8192];
                if let Ok(n) = socket.read(&mut buffer).await {
                    let req_text = String::from_utf8_lossy(&buffer[..n]);
                    let mut lines = req_text.lines();
                    if let Some(first_line) = lines.next() {
                        let parts: Vec<&str> = first_line.split_whitespace().collect();
                        if parts.len() >= 2 && parts[0] == "GET" {
                            let path = parts[1].trim_start_matches('/');
                            if let Some((provider_id, target_url)) = path.split_once('/') {
                                let target_url = urlencoding::decode(target_url).unwrap_or(std::borrow::Cow::Borrowed(target_url)).to_string();
                                let mut headers = reqwest::header::HeaderMap::new();
                                if let Some(provider) = pm.get_provider(provider_id) {
                                    if let Some(auth) = provider.get_auth_header().await {
                                        if let Ok(v) = reqwest::header::HeaderValue::from_str(&auth) {
                                            headers.insert(reqwest::header::AUTHORIZATION, v);
                                        }
                                    }
                                }
                                
                                // Forward Range header from the source request
                                for line in lines {
                                    if line.to_lowercase().starts_with("range:") {
                                        if let Some(r_val) = line.split_once(':').map(|(_, v)| v.trim()) {
                                            if let Ok(v) = reqwest::header::HeaderValue::from_str(r_val) {
                                                headers.insert(reqwest::header::RANGE, v);
                                            }
                                        }
                                    }
                                }
                                if provider_id == "youtube" {
                                    headers.insert(reqwest::header::USER_AGENT, reqwest::header::HeaderValue::from_static("Mozilla/5.0 (Android 12; VR; Mobile; rv:121.0) Gecko/121.0 Firefox/121.0"));
                                    headers.insert(reqwest::header::REFERER, reqwest::header::HeaderValue::from_static("https://music.youtube.com/"));
                                } else if provider_id == "yandex" {
                                    headers.insert(reqwest::header::USER_AGENT, reqwest::header::HeaderValue::from_static("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36"));
                                    headers.insert(reqwest::header::REFERER, reqwest::header::HeaderValue::from_static("https://music.yandex.ru/"));
                                } else {
                                    headers.insert(reqwest::header::USER_AGENT, reqwest::header::HeaderValue::from_static("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36"));
                                }
                                
                                let client = reqwest::Client::new();
                                match client.get(&target_url).headers(headers).send().await {
                                    Ok(resp) => {
                                        let status = resp.status();
                                        let mut response = format!(
                                            "HTTP/1.1 {} {}\r\nConnection: close\r\nAccess-Control-Allow-Origin: *\r\n",
                                            status.as_u16(),
                                            status.canonical_reason().unwrap_or("OK")
                                        );
                                        for (name, value) in resp.headers() {
                                            if let Ok(v) = value.to_str() {
                                                let name_s = name.as_str().to_lowercase();
                                                if name_s == "content-type" || name_s == "content-length" || name_s == "content-range" || name_s == "accept-ranges" {
                                                    response.push_str(&format!("{}: {}\r\n", name, v));
                                                }
                                            }
                                        }
                                        response.push_str("\r\n");
                                        let _ = socket.write_all(response.as_bytes()).await;
                                        
                                        let mut stream = resp.bytes_stream();
                                        while let Some(item) = stream.next().await {
                                            match item {
                                                Ok(chunk) => {
                                                    if let Err(_) = socket.write_all(&chunk).await {
                                                        break; // Connection closed by client
                                                    }
                                                }
                                                Err(_) => break, // Network error from source
                                            }
                                        }
                                    },
                                    Err(e) => {
                                        println!("[Proxy 5189] Network Error for {}: {}", provider_id, e);
                                    }
                                }
                            }
                        }
                    }
                }
            });
        }
    }
}

#[tauri::command]
async fn get_lyrics(artist: String, title: String, album: Option<String>, duration: Option<u32>) -> Result<Value, String> {
    println!("[Lyrics] Searching for: {} - {} (duration: {:?})", artist, title, duration);
    let mut url = reqwest::Url::parse("https://lrclib.net/api/get").map_err(|e| e.to_string())?;
    {
        let mut query = url.query_pairs_mut();
        query.append_pair("artist_name", &artist);
        query.append_pair("track_name", &title);
        if let Some(a) = album {
            query.append_pair("album_name", &a);
        }
        if let Some(d) = duration {
            query.append_pair("duration", &d.to_string());
        }
    }

    let client = reqwest::Client::new();
    let resp = client.get(url)
        .header("User-Agent", "RE-Music/1.0 (https://github.com/user/re-music)")
        .send().await
        .map_err(|e| e.to_string())?;

    if resp.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(Value::Null);
    }

    let data: Value = resp.json().await.map_err(|e| e.to_string())?;
    Ok(data)
}

#[tauri::command]
async fn stop_all_audio(state: State<'_, ProviderManager>, handle: tauri::AppHandle) -> Result<(), String> {
    state.stop_all(handle).await
}

#[tauri::command]
async fn update_discord_presence(
    track: Option<providers::Track>,
    is_playing: bool,
    progress_ms: Option<f64>,
) -> Result<(), String> {
    let mut client = DISCORD_CLIENT.lock().await;
    
    if !is_playing {
        let _ = client.clear_activity();
        return Ok(());
    }

    if let Some(t) = track {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|e| e.to_string())?
            .as_secs();

        let _ = client.set_activity(|mut activity| {
            activity = activity.state(&t.artist)
                .details(&t.title)
                .assets(|assets| {
                    assets.large_image("nexus_logo")
                        .large_text("RE:Music")
                        .small_image(if is_playing { "play_icon" } else { "pause_icon" })
                        .small_text(if is_playing { "Playing" } else { "Paused" })
                });

            if is_playing {
                let start = now.saturating_sub(progress_ms.unwrap_or(0.0) as u64 / 1000);
                let duration = t.duration_ms.unwrap_or(0) as u64 / 1000;
                if duration > 0 {
                    let end = start + duration;
                    activity = activity.timestamps(|ts| ts.start(start).end(end));
                } else {
                    activity = activity.timestamps(|ts| ts.start(start));
                }
            }

            activity
        });
    } else {
        let _ = client.clear_activity();
    }
    
    Ok(())
}

#[tauri::command]
async fn open_lyrics_window(handle: tauri::AppHandle) -> Result<(), String> {
    let _window = tauri::WebviewWindowBuilder::new(
        &handle,
        "lyrics",
        tauri::WebviewUrl::App("index.html".into())
    )
    .title("RE:Music Lyrics")
    .inner_size(450.0, 700.0)
    .resizable(true)
    .always_on_top(true)
    .decorations(true)
    .build()
    .map_err(|e| e.to_string())?;
    
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  println!("[DEBUG] Rust side v8.1 starting...");
  /*
  // Set global proxy environment variables for the process
  // This will be picked up by WebView2 and reqwest
  std::env::set_var("HTTP_PROXY", "http://127.0.0.1:5187");
  std::env::set_var("HTTPS_PROXY", "http://127.0.0.1:5187");
  std::env::set_var("ALL_PROXY", "http://127.0.0.1:5187");
  // Ensure we don't proxy localhost/127.0.0.1 to avoid infinite loops if some part of Tauri uses it
  std::env::set_var("NO_PROXY", "localhost,127.0.0.1");

  let relay = Arc::new(proxy_relay::ProxyRelay::new(current_proxy, current_bye_dpi));
  let relay_clone = relay.clone();
  
  tauri::async_runtime::spawn(async move {
      relay_clone.start(5187).await;
  });
  */

  tauri::Builder::default()
    .plugin(tauri_plugin_shell::init())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_store::Builder::default().build())
    .plugin(tauri_plugin_updater::Builder::new().build())
    .plugin(tauri_plugin_process::init())
    .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
        // When a second instance is launched, just show the existing window
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.show();
            let _ = window.unminimize();
            let _ = window.set_focus();
        }
    }))
    .setup(move |app| {
      let quit_i = MenuItem::with_id(app, "quit", "✕  Выйти", true, None::<&str>).unwrap();
      let show_i = MenuItem::with_id(app, "show", "🎵  Показать", true, None::<&str>).unwrap();
      let menu = Menu::with_items(app, &[&show_i, &quit_i]).unwrap();

      let _tray = TrayIconBuilder::new()
          .icon(app.default_window_icon().unwrap().clone())
          .tooltip("RE:Music")
          .menu(&menu)
          .show_menu_on_left_click(false)
          .on_menu_event(|app, event| match event.id.as_ref() {
              "quit" => {
                  app.exit(0);
              }
              "show" => {
                  if let Some(window) = app.get_webview_window("main") {
                      let _ = window.show();
                      let _ = window.unminimize();
                      let _ = window.set_focus();
                  }
              }
              _ => {}
          })
          .on_tray_icon_event(|tray, event| {
              if let TrayIconEvent::Click {
                  button: MouseButton::Left,
                  ..
              } = event
              {
                  let app = tray.app_handle();
                  if let Some(window) = app.get_webview_window("main") {
                      let _ = window.show();
                      let _ = window.unminimize();
                      let _ = window.set_focus();
                  }
              }
          })
          .build(app).unwrap();

      // Intercept the window close button — hide to tray instead of quitting
      if let Some(window) = app.get_webview_window("main") {
          let win_clone = window.clone();
          window.on_window_event(move |event| {
              if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                  api.prevent_close();
                  let _ = win_clone.hide();
              }
          });
      }

      let app_data = app.path().app_data_dir().unwrap_or_default();
      let auth_path = app_data.join("auth.json");
      let config_path = app_data.join("config.json");
      let _ = std::fs::create_dir_all(&app_data);
      
      let auth = Arc::new(AuthManager::new(Some(auth_path)));
      let providers = ProviderManager::new(auth.clone());
      let config = Arc::new(ConfigManager::new(Some(config_path)));
      
      app.manage(auth.clone());
      app.manage(providers.clone());
      app.manage(config.clone());
      // app.manage(relay.clone());

      let pm_for_proxy = providers.clone();
      tauri::async_runtime::spawn(async move {
          start_dev_proxy(pm_for_proxy).await;
      });
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .register_uri_scheme_protocol("nmis-proxy", move |ctx, request: tauri::http::Request<Vec<u8>>| {
        let uri = request.uri().to_string();
        
        let _ = std::fs::OpenOptions::new().create(true).append(true).open("nexus_debug.log").and_then(|mut f| {
            use std::io::Write;
            writeln!(f, "[Proxy] New request: {}", uri)
        });
        // Robust parsing for both nmis-proxy://, nmis-proxy:, and http://nmis-proxy.localhost/
        let path = if uri.starts_with("http://nmis-proxy.localhost/") {
            uri.replacen("http://nmis-proxy.localhost/", "", 1)
        } else if uri.starts_with("nmis-proxy://") {
            uri.replacen("nmis-proxy://", "", 1)
        } else if uri.starts_with("nmis-proxy:") {
            uri.replacen("nmis-proxy:", "", 1)
        } else {
            uri.clone()
        };
        let path = path.trim_start_matches('/');
        
        if path.starts_with("youtube-cookies/") {
            let cookie_data = path.trim_start_matches("youtube-cookies/");
            let decoded = urlencoding::decode(cookie_data).unwrap_or_default().to_string();
            let handle_inner = ctx.app_handle().clone();
            tauri::async_runtime::spawn(async move {
                let state = handle_inner.state::<ProviderManager>();
                if let Some(provider) = state.get_provider("youtube") {
                    let _ = provider.save_token(decoded).await;
                }
            });
            return tauri::http::Response::builder()
                .status(200)
                .header("Access-Control-Allow-Origin", "*")
                .body(Vec::new())
                .unwrap();
        }

        if path.starts_with("worker-callback/") {
            let callback_data = path.trim_start_matches("worker-callback/");
            let parts: Vec<&str> = callback_data.split('/').collect();
            if parts.len() >= 2 {
                let req_id = parts[0].to_string();
                let res_str = parts[1].to_string();
                
                tauri::async_runtime::spawn(async move {
                    let mut map = REQ_MAP.lock().await;
                    if let Some(tx) = map.remove(&req_id) {
                        let result = if res_str == "ok" { Ok(Value::Bool(true)) } else { Err(res_str) };
                        let _ = tx.send(result);
                    }
                });
            }
            return tauri::http::Response::builder()
                .status(200)
                .header("Access-Control-Allow-Origin", "*")
                .body(Vec::new())
                .unwrap();
        }

        let parts: Vec<&str> = path.splitn(2, '/').collect();
        if parts.len() < 2 {
            println!("[Proxy] Invalid URI format: {}", uri);
            return tauri::http::Response::builder().status(400).body(Vec::new()).unwrap();
        }
        let provider_id = parts[0].to_string();
        let target_url = urlencoding::decode(parts[1]).unwrap_or(std::borrow::Cow::Borrowed(parts[1])).to_string();
        
        println!("[Proxy] Request: provider={}, url={}", provider_id, target_url);
        let handle_inner = ctx.app_handle().clone();
        let range = request.headers().get("range").cloned();
        tauri::async_runtime::block_on(async move {
            let state = handle_inner.state::<ProviderManager>();
            let _config = handle_inner.state::<Arc<ConfigManager>>();
            
            let mut headers = reqwest::header::HeaderMap::new();
            if let Some(provider) = state.get_provider(&provider_id) {
                if let Some(auth_str) = provider.get_auth_header().await {
                    if let Ok(value) = reqwest::header::HeaderValue::from_str(&auth_str) {
                        headers.insert(reqwest::header::AUTHORIZATION, value);
                    }
                }
            }
            if let Some(r) = range {
                if let Ok(s) = r.to_str() {
                    if let Ok(v) = reqwest::header::HeaderValue::from_str(s) {
                        headers.insert(reqwest::header::RANGE, v);
                    }
                }
            }
            if provider_id == "youtube" {
                headers.insert(reqwest::header::USER_AGENT, reqwest::header::HeaderValue::from_static("Mozilla/5.0 (Android 12; VR; Mobile; rv:121.0) Gecko/121.0 Firefox/121.0"));
                headers.insert(reqwest::header::REFERER, reqwest::header::HeaderValue::from_static("https://music.youtube.com/"));
            } else if provider_id == "yandex" {
                headers.insert(reqwest::header::USER_AGENT, reqwest::header::HeaderValue::from_static("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36"));
                headers.insert(reqwest::header::REFERER, reqwest::header::HeaderValue::from_static("https://music.yandex.ru/"));
            } else {
                headers.insert(reqwest::header::USER_AGENT, reqwest::header::HeaderValue::from_static("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36"));
            }

            let client = reqwest::Client::new();
            if provider_id == "youtube" {
                println!("[NmisProxy] YouTube Request: {}", target_url);
            }
            match client.get(&target_url).headers(headers).send().await {
                Ok(resp) => {
                    let status = resp.status();
                    if provider_id == "youtube" {
                        println!("[NmisProxy] YouTube Response Status: {}", status);
                        if !status.is_success() {
                            println!("[NmisProxy] YouTube Headers: {:?}", resp.headers());
                        }
                    }
                    let content_type = resp.headers().get("content-type").cloned();
                    
                    let _ = std::fs::OpenOptions::new().create(true).append(true).open("nexus_debug.log").and_then(|mut f| {
                        use std::io::Write;
                        writeln!(f, "[Proxy] Provider {} Response: status={}, type={:?}", provider_id, status, content_type)
                    });
                    println!("[Proxy] Provider {} Response: status={}, type={:?}, len={:?}", 
                        provider_id,
                        resp.status(), 
                        resp.headers().get("content-type"),
                        resp.headers().get("content-length")
                    );
                    let mut res_builder = tauri::http::Response::builder()
                        .status(resp.status())
                        .header("Access-Control-Allow-Origin", "*");
                    
                    for (name, value) in resp.headers() {
                        let name_s = name.as_str().to_lowercase();
                        // Only forward essential media headers to avoid conflicts
                        if name_s == "content-type" || name_s == "content-length" || name_s == "content-range" || name_s == "accept-ranges" {
                            res_builder = res_builder.header(name, value);
                        }
                    }

                    let body = resp.bytes().await.unwrap_or_default();
                    res_builder.body(body.to_vec()).unwrap()
                },
                Err(_) => tauri::http::Response::builder().status(500).body(Vec::new()).unwrap()
            }
        })
    })
    .invoke_handler(tauri::generate_handler![
        get_settings,
        get_eq_state,
        save_eq_state,
        check_auth,
        get_auth_details,
        auth_provider,
        logout_provider,
        search,
        get_playlists,
        get_stream_url,
        play_track,
        get_providers,
        get_liked_tracks,
        add_track_to_playlist,
        get_track_radio,
        get_my_wave,
        get_lyrics,
        open_lyrics_window,
        create_playlist,
        get_playlist_tracks,
        like_track,
        get_achievements,
        unlock_achievement,
        stop_all_audio,
        set_token,
        update_setting,

        get_local_playlists,
        save_local_playlist,
        delete_local_playlist,
        add_to_local_playlist,
        select_avatar_file,
        get_spotify_token,
        play_spotify_uri,
        update_discord_presence
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
