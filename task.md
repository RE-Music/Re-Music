# Tasks - Audio Overlap Bug Fix

- [/] Проверить работу системы обновлений (диагностика Rust)
- [x] Отладить формат манифеста (ошибка подписи)
    - [x] Устранить BOM в JSON
    - [x] Подобрать правильный формат подписи для Tauri v2 (универсальный манифест)
- [ ] Verify fix
    - [ ] Test transitions between Spotify, Yandex, YouTube, SoundCloud
    - [ ] Verify no overlap during rapid switching
