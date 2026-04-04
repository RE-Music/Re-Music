use serde::{Deserialize, Serialize};
use async_trait::async_trait;
use tauri::AppHandle;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Track {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub provider: String,
    pub duration_ms: Option<u32>,
    pub cover_url: Option<String>,
    pub stream_url: Option<String>,
    pub liked_at: Option<u64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Playlist {
    pub id: String,
    pub title: String,
    pub provider: String,
    pub track_count: Option<u32>,
    pub cover_url: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UserInfo {
    pub username: String,
    pub avatar_url: Option<String>,
}

#[async_trait]
pub trait MusicProvider: Send + Sync {
    fn id(&self) -> &str;
    fn name(&self) -> &str;
    async fn search(&self, query: &str, page: u32) -> Result<Vec<Track>, String>;
    async fn get_playlists(&self, handle: AppHandle) -> Result<Vec<Playlist>, String>;
    async fn get_playlist_tracks(&self, playlist_id: &str, handle: AppHandle) -> Result<Vec<Track>, String>;
    async fn get_stream_url(&self, track_id: &str) -> Result<String, String>;
    async fn get_user_info(&self) -> Result<Option<UserInfo>, String>;
    async fn auth(&self, handle: AppHandle) -> Result<bool, String>;
    
    // Functional extensions
    async fn like_track(&self, track_id: &str, like: bool, handle: AppHandle) -> Result<bool, String>;
    async fn get_recommendations(&self, seed_track_id: Option<String>, handle: AppHandle) -> Result<Vec<Track>, String>;
    async fn create_playlist(&self, title: &str) -> Result<Playlist, String>;
    async fn add_track_to_playlist(&self, playlist_id: &str, track_id: &str) -> Result<bool, String>;
    async fn get_liked_tracks(&self, handle: AppHandle) -> Result<Vec<Track>, String>;
    async fn stop(&self, _handle: AppHandle) -> Result<(), String> {
        Ok(())
    }
    async fn get_auth_header(&self) -> Option<String> { None }
    async fn save_token(&self, _token: String) -> Result<(), String> { Ok(()) }
}

pub mod soundcloud;
pub mod yandex;
pub mod spotify;
pub mod youtube;
pub mod manager;
