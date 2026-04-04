use std::collections::HashMap;
use std::sync::Arc;
use tauri::AppHandle;
use super::MusicProvider;
use super::yandex::YandexProvider;
use super::soundcloud::SoundCloudProvider;
use super::spotify::SpotifyProvider;
use super::youtube::YouTubeProvider;
use crate::auth::AuthManager;

#[derive(Clone)]
pub struct ProviderManager {
    providers: HashMap<String, Arc<dyn MusicProvider>>,
}

// Provider Manager handles registration and access to music services

impl ProviderManager {
    pub fn new(auth: Arc<AuthManager>) -> Self {
        let mut providers: HashMap<String, Arc<dyn MusicProvider>> = HashMap::new();
        
        // Register Yandex (Fully implemented)
        let yandex = Arc::new(YandexProvider::new(auth.clone()));
        providers.insert("yandex".to_string(), yandex);
        
        // Register SoundCloud (Ported)
        let soundcloud = Arc::new(SoundCloudProvider::new(auth.clone()));
        providers.insert("soundcloud".to_string(), soundcloud);

        // Register Spotify (Ported)
        let spotify = Arc::new(SpotifyProvider::new(auth.clone()));
        providers.insert("spotify".to_string(), spotify);
        
        // Register YouTube (Ported)
        let youtube = Arc::new(YouTubeProvider::new(auth.clone()));
        providers.insert("youtube".to_string(), youtube);
        
        Self { providers }
    }

    pub fn get_provider(&self, id: &str) -> Option<Arc<dyn MusicProvider>> {
        self.providers.get(id).cloned()
    }

    pub fn list_providers(&self) -> Vec<(String, String)> {
        self.providers.iter()
            .map(|(id, p): (&String, &Arc<dyn MusicProvider>)| (id.clone(), p.name().to_string()))
            .collect()
    }

    pub async fn stop_all(&self, handle: AppHandle) -> Result<(), String> {
        for provider in self.providers.values() {
            let _ = provider.stop(handle.clone()).await;
        }
        Ok(())
    }
}
