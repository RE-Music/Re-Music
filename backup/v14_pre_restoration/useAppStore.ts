import { create } from 'zustand';

export type ViewType = 'home' | 'search' | 'settings' | 'provider' | 'liked' | 'wave' | 'focus' | 'eq' | 'profile';
export type Theme = 'dark' | 'light' | 'system' | 'tech-dark' | 'ghibli' | 'old-dark';
export type Language = 'ru' | 'en';

interface AppState {
  activeView: ViewType;
  activeProviderId: string | null;
  providers: { id: string; name: string }[];
  isSidebarOpen: boolean;
  likedTracks: Set<string>;
  theme: Theme;
  language: Language;
  authStatus: Record<string, boolean>;
  navNonce: number;
  
  // Actions
  setActiveView: (view: ViewType, providerId?: string | null) => void;
  setProviders: (providers: { id: string; name: string }[]) => void;
  setAuthStatus: (status: Record<string, boolean>) => void;
  toggleSidebar: () => void;
  toggleLike: (trackId: string) => void;
  setLikedTracks: (trackIds: string[]) => void;
  setTheme: (theme: Theme) => void;
  setLanguage: (lang: Language) => void;
}

export const useAppStore = create<AppState>((set) => ({
  activeView: 'home',
  activeProviderId: null,
  providers: [],
  isSidebarOpen: true,
  likedTracks: new Set(),
  theme: 'tech-dark',
  language: 'ru',
  authStatus: {},
  navNonce: 0,

  setActiveView: (view: ViewType, providerId: string | null = null) => 
    set((state) => ({ 
      activeView: view, 
      activeProviderId: providerId,
      navNonce: state.navNonce + 1,
    })),
    
  setProviders: (providers) => 
    set({ providers }),

  setAuthStatus: (authStatus) =>
    set({ authStatus }),

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
}));
