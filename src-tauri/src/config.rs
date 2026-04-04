use std::sync::Arc;
use tokio::sync::RwLock;
use serde::{Deserialize, Serialize};
use crate::providers::Track;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EqState {
    pub gains: Vec<f32>,
    pub presets: serde_json::Value,
    pub active_preset: String,
    pub is_enabled: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LocalPlaylist {
    pub id: String,
    pub title: String,
    pub tracks: Vec<Track>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppSettings {
    pub theme: String,
    pub language: String,
    pub vibe_gif_mode: String,
    pub volume: f64,
    pub profile_name: String,
    pub avatar_url: String,
    pub eq_state: Option<EqState>,
    pub unlocked_achievements: Vec<String>,
    #[serde(default)]
    pub local_playlists: Vec<LocalPlaylist>,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            theme: "tech-dark".to_string(),
            language: "ru".to_string(),
            vibe_gif_mode: "cats".to_string(),
            volume: 0.5,
            profile_name: String::new(),
            avatar_url: String::new(),
            eq_state: None,
            unlocked_achievements: Vec::new(),
            local_playlists: Vec::new(),
        }
    }
}

pub struct ConfigManager {
    pub settings: Arc<RwLock<AppSettings>>,
    storage_path: Option<std::path::PathBuf>,
}

impl ConfigManager {
    pub fn new(storage_path: Option<std::path::PathBuf>) -> Self {
        let mut settings = AppSettings::default();
        if let Some(ref path) = storage_path {
            if path.exists() {
                if let Ok(content) = std::fs::read_to_string(path) {
                    if let Ok(saved) = serde_json::from_str::<AppSettings>(&content) {
                        println!("[Config] Loaded settings from disk");
                        settings = saved;
                    }
                }
            }
        }

        Self {
            settings: Arc::new(RwLock::new(settings)),
            storage_path,
        }
    }

    pub async fn save(&self) {
        if let Some(ref path) = self.storage_path {
            let settings = self.settings.read().await;
            if let Ok(content) = serde_json::to_string_pretty(&*settings) {
                if let Err(e) = std::fs::write(path, content) {
                    eprintln!("[Config] Failed to save settings: {}", e);
                }
            }
        }
    }



    pub async fn save_local_playlist(&self, playlist: LocalPlaylist) {
        {
            let mut s = self.settings.write().await;
            if let Some(pos) = s.local_playlists.iter().position(|p| p.id == playlist.id) {
                s.local_playlists[pos] = playlist;
            } else {
                s.local_playlists.push(playlist);
            }
        }
        self.save().await;
    }

    pub async fn delete_local_playlist(&self, id: String) {
        {
            let mut s = self.settings.write().await;
            s.local_playlists.retain(|p| p.id != id);
        }
        self.save().await;
    }
}
