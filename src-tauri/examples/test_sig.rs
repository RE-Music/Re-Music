use std::str::FromStr;

fn main() {
    let pubkey_str = "RWS9jTw3/6YRZvGPdgKvt6obZkgvPZPoQLzqAFwVgSAEkhYWQ+crSK0A";
    let sig_base64 = "dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZSBmcm9tIHRhdXJpIHNlY3JldCBrZXkKUlVUUWNxWmNaTnlNdHMrd1lDYXgzRXVaZGVwQk9qRnJsQmVFdnpRZld6TmczaHJxRVFMVUN3YjR3c3UxbUMwMDRuTUVnUUNUNVBNZnJqUmFZRGtFbk10bTVxMy9OWmJNR2dvPQp0cnVzdGVkIGNvbW1lbnQ6IHRpbWVzdGFtcDoxNzc1MzI1NTYzCWZpbGU6UkUtTXVzaWNfMS4xLjFfeDY0X2VuLVVTLm1zaQo0Y3JvZDRlVjVDMVFabW1tREUxcjhUcStDOUVkOWt2WE1xby9wUnM4dEMvanNkaHVUb3pVVytWdmpGSjdkTkFKUHZVNmpsWHZyWFFCSWxLcTJyZDBCZz09Cg==";

    println!("Testing Public Key: {}", pubkey_str);
    match minisign::PublicKey::from_str(pubkey_str) {
        Ok(_) => println!("✅ Public Key decoded successfully!"),
        Err(e) => println!("❌ Public Key decoding failed: {:?}", e),
    }

    println!("\nTesting Signature (from Base64):");
    let sig_bytes = match base64::Engine::decode(&base64::engine::general_purpose::STANDARD, sig_base64) {
        Ok(b) => b,
        Err(e) => {
            println!("❌ Base64 decoding of signature failed: {:?}", e);
            return;
        }
    };

    let sig_str = String::from_utf8_lossy(&sig_bytes);
    println!("Signature Block:\n{}", sig_str);

    match minisign::Signature::from_str(&sig_str) {
        Ok(_) => println!("✅ Signature decoded successfully!"),
        Err(e) => println!("❌ Signature decoding failed: {:?}", e),
    }
}
