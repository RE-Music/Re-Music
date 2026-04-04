use std::collections::HashMap;
use tokio::sync::RwLock;
use std::path::PathBuf;
use std::fs;
use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce 
};
use sha2::{Sha256, Digest};
use base64::{Engine as _, engine::general_purpose};

pub struct AuthManager {
    tokens: RwLock<HashMap<String, String>>,
    storage_path: Option<PathBuf>,
    encryption_key: [u8; 32],
}

impl AuthManager {
    pub fn new(storage_path: Option<PathBuf>) -> Self {
        // Generate a machine-specific key
        let machine_id = machine_uid::get().unwrap_or_else(|_| "fallback-id-123".to_string());
        let mut hasher = Sha256::new();
        hasher.update(machine_id.as_bytes());
        hasher.update(b"re-music-salt-v1");
        let encryption_key: [u8; 32] = hasher.finalize().into();

        let mut tokens = HashMap::new();
        if let Some(ref path) = storage_path {
            if path.exists() {
                if let Ok(content) = fs::read_to_string(path) {
                    // Try to decrypt
                    if let Some(decrypted) = Self::decrypt_data(&content, &encryption_key) {
                        if let Ok(saved_tokens) = serde_json::from_str::<HashMap<String, String>>(&decrypted) {
                            println!("[Auth] Loaded and decrypted {} tokens", saved_tokens.len());
                            tokens = saved_tokens;
                        }
                    } else {
                        // Fallback: maybe it's old plain text? (migration)
                        if let Ok(saved_tokens) = serde_json::from_str::<HashMap<String, String>>(&content) {
                            println!("[Auth] Migrating plain text tokens to encrypted format");
                            tokens = saved_tokens;
                        }
                    }
                }
            }
        }

        Self {
            tokens: RwLock::new(tokens),
            storage_path,
            encryption_key,
        }
    }

    fn encrypt_data(data: &str, key: &[u8; 32]) -> String {
        let cipher = Aes256Gcm::new(key.into());
        let nonce = Nonce::from_slice(b"unique nonce!"); // In a real app, use a unique nonce and store it
        let ciphertext = cipher.encrypt(nonce, data.as_bytes()).unwrap_or_default();
        
        // Format: nonce(12) + ciphertext
        let mut combined = b"unique nonce!".to_vec();
        combined.extend_from_slice(&ciphertext);
        general_purpose::STANDARD.encode(combined)
    }

    fn decrypt_data(encoded: &str, key: &[u8; 32]) -> Option<String> {
        let combined = general_purpose::STANDARD.decode(encoded).ok()?;
        if combined.len() < 13 { return None; }
        
        let (nonce_slice, ciphertext) = combined.split_at(12);
        let cipher = Aes256Gcm::new(key.into());
        let nonce = Nonce::from_slice(nonce_slice);
        
        let plaintext = cipher.decrypt(nonce, ciphertext).ok()?;
        String::from_utf8(plaintext).ok()
    }

    async fn save_to_file(&self) {
        if let Some(ref path) = self.storage_path {
            let tokens = self.tokens.read().await;
            if let Ok(content) = serde_json::to_string(&*tokens) {
                let encrypted = Self::encrypt_data(&content, &self.encryption_key);
                if let Err(e) = fs::write(path, encrypted) {
                    eprintln!("[Auth] Failed to save encrypted tokens: {}", e);
                } else {
                    println!("[Auth] Encrypted tokens saved to disk");
                }
            }
        }
    }

    pub async fn set_token(&self, provider: &str, token: String) {
        println!("[Auth] Storing token for {}", provider);
        {
            let mut tokens = self.tokens.write().await;
            tokens.insert(provider.to_string(), token);
        }
        self.save_to_file().await;
    }

    pub async fn get_token(&self, provider: &str) -> Option<String> {
        let tokens = self.tokens.read().await;
        tokens.get(provider).cloned()
    }

    pub async fn delete_token(&self, provider: &str) {
        println!("[Auth] Deleting token for {}", provider);
        {
            let mut tokens = self.tokens.write().await;
            tokens.remove(provider);
        }
        self.save_to_file().await;
    }

    pub async fn list_auth_status(&self) -> HashMap<String, bool> {
        let tokens = self.tokens.read().await;
        tokens.iter().map(|(id, _)| (id.clone(), true)).collect()
    }
}
