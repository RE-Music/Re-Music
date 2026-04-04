# Tasks - Audio Overlap Bug Fix

- [/] Investigate hidden audio sources [/]
    - [ ] Search for all `new Audio()` and `<audio>` tags `(In Progress)`
    - [ ] Analyze `YouTubeMusicProvider.ts` for CDP-based audio playback
    - [ ] Check for Rust-side audio playback in Tauri handlers
    - [ ] Review `useAudioEngine.ts` for multiple context creation
- [ ] Implement deeper fixes
    - [ ] Centralize audio management if necessary
    - [ ] Add global "stop all" command for transitions
- [ ] Verify fix
    - [ ] Test transitions between Spotify, Yandex, YouTube, SoundCloud
    - [ ] Verify no overlap during rapid switching
