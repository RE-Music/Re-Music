import { create } from 'zustand';
import type { Track } from '../../shared/interfaces/IMusicProvider';

export type ViewType = 'home' | 'search' | 'settings' | 'provider' | 'liked' | 'wave' | 'focus' | 'eq' | 'profile' | 'local_playlists' | 'import_preview';
export type Theme = 'dark' | 'light' | 'system' | 'tech-dark' | 'ghibli' | 'old-dark';
export type Language = 'ru' | 'en';

export interface LocalPlaylist {
  id: string;
  title: string;
  tracks: Track[];
}

export interface PromptConfig {
  title: string;
  placeholder?: string;
  initialValue?: string;
  onConfirm: (value: string) => void;
  confirmText?: string;
  cancelText?: string;
}

interface AppState {
  activeView: ViewType;
  activeProviderId: string | null;
  providers: { id: string; name: string }[];
  isSidebarOpen: boolean;
  likedTracks: Set<string>;
  theme: Theme;
  language: Language;
  vibeGifMode: string;
  vibeTracks: Track[];
  isVibeLoading: boolean;
  authStatus: Record<string, boolean>;
  profileName: string;
  avatarUrl: string;
  localPlaylists: LocalPlaylist[];
  navNonce: number;
  promptConfig: PromptConfig | null;
  isImportModalOpen: boolean;
  toast: { message: string, visible: boolean } | null;
  previousView: ViewType | null;
  previousProviderId: string | null;
  visitedViews: Set<string>;
  isPosterModalOpen: boolean;
  posterTrack: Track | null;
  
  // Actions
  showToast: (message: string) => void;
  hideToast: () => void;
  setActiveView: (view: ViewType, providerId?: string | null) => void;
  setProviders: (providers: { id: string; name: string }[]) => void;
  setAuthStatus: (status: Record<string, boolean>) => void;
  setVibeTracks: (tracks: Track[]) => void;
  setVibeLoading: (isLoading: boolean) => void;
  toggleSidebar: () => void;
  toggleLike: (trackId: string) => void;
  setLikedTracks: (trackIds: string[]) => void;
  setTheme: (theme: Theme) => void;
  setLanguage: (lang: Language) => void;
  setVibeGifMode: (mode: string) => void;
  setProfileName: (name: string) => void;
  setAvatarUrl: (url: string) => void;
  setLocalPlaylists: (playlists: LocalPlaylist[]) => void;
  loadLocalPlaylists: () => Promise<void>;
  showPrompt: (config: PromptConfig) => void;
  closePrompt: () => void;
  setImportModalOpen: (open: boolean) => void;
  setPosterModalOpen: (open: boolean, track?: Track | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  activeView: 'home',
  activeProviderId: null,
  providers: [],
  isSidebarOpen: true,
  likedTracks: new Set(),
  theme: 'tech-dark',
  language: 'ru',
  vibeGifMode: 'cats',
  vibeTracks: [],
  isVibeLoading: false,
  authStatus: {},
  profileName: '',
  avatarUrl: '',
  localPlaylists: [],
  navNonce: 0,
  promptConfig: null,
  isImportModalOpen: false,
  previousView: null,
  previousProviderId: null,
  visitedViews: new Set(),
  isPosterModalOpen: false,
  posterTrack: null,

  setActiveView: (view: ViewType, providerId: string | null = null) => 
    set((state) => {
      const isEnteringFocus = view === 'focus' && state.activeView !== 'focus';
      const newVisited = new Set(state.visitedViews);
      newVisited.add(view);

      // Проверка ачивки Cosmic Pathfinder
      if (newVisited.has('home') && newVisited.has('search') && newVisited.has('liked') && newVisited.has('wave')) {
        import('./useAchievementStore').then(m => {
          m.useAchievementStore.getState().unlock('cosmic-pathfinder');
        });
      }

      return { 
        activeView: view, 
        activeProviderId: providerId,
        navNonce: state.navNonce + 1,
        visitedViews: newVisited,
        // Save history ONLY when entering focus mode
        ...(isEnteringFocus ? { 
          previousView: state.activeView,
          previousProviderId: state.activeProviderId
        } : {})
      };
    }),
    
  setProviders: (providers) => 
    set({ providers }),

  setAuthStatus: (authStatus) =>
    set({ authStatus }),

  setVibeTracks: (vibeTracks) =>
    set({ vibeTracks }),

  setVibeLoading: (isVibeLoading) =>
    set({ isVibeLoading }),

  setLikedTracks: (trackIds) =>
    set({ likedTracks: new Set(trackIds) }),
    
  toggleSidebar: () => 
    set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),

  toggleLike: (trackId) => 
    set((state) => {
      const newLiked = new Set(state.likedTracks);
      if (newLiked.has(trackId)) {
        newLiked.delete(trackId);
      } else {
        newLiked.add(trackId);
      }
      return { likedTracks: newLiked };
    }),

  setTheme: (theme) => set({ theme }),
  setLanguage: (language) => set({ language }),
  setVibeGifMode: (vibeGifMode) => {
    set({ vibeGifMode });
    // Trigger Achievement
    try {
      import('./useAchievementStore').then(m => {
        m.useAchievementStore.getState().unlock('vibe-master');
      });
    } catch (e) {
      console.error('Failed to trigger vibe-master achievement', e);
    }
  },
  setProfileName: (profileName) => set({ profileName }),
  setAvatarUrl: (avatarUrl) => set({ avatarUrl }),
  setLocalPlaylists: (localPlaylists) => set({ localPlaylists }),
  loadLocalPlaylists: async () => {
    try {
      const lists = await (window as any).electronAPI.invoke('get-local-playlists');
      set({ localPlaylists: lists });
    } catch (e) {
      console.error('Failed to load local playlists:', e);
    }
  },
  showPrompt: (config) => set({ promptConfig: config }),
  closePrompt: () => set({ promptConfig: null }),
  setImportModalOpen: (open) => set({ isImportModalOpen: open }),
  toast: null,
  showToast: (message: string) => {
    set({ toast: { message, visible: true } });
    setTimeout(() => {
      set((state) => (state.toast?.message === message ? { toast: null } : {}));
    }, 3000);
  },
  hideToast: () => set({ toast: null }),
  setPosterModalOpen: (open: boolean, track: Track | null = null) => set({ isPosterModalOpen: open, posterTrack: track }),
}));
