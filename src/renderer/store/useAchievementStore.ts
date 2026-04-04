import { create } from 'zustand';

interface AchievementState {
  unlockedIds: Set<string>;
  init: () => Promise<void>;
  unlock: (id: string) => Promise<boolean>;
  isUnlocked: (id: string) => boolean;
  toastAchievement: string | null;
  setToastAchievement: (id: string | null) => void;
}

export const useAchievementStore = create<AchievementState>((set, get) => ({
  unlockedIds: new Set(),
  toastAchievement: null,

  init: async () => {
    try {
      const ids = await (window as any).electronAPI.invoke('get-achievements');
      if (Array.isArray(ids)) {
        set({ unlockedIds: new Set(ids) });
      }
    } catch (e) {
      console.error('[AchievementStore] Failed to fetch:', e);
    }
  },

  unlock: async (id: string) => {
    if (get().unlockedIds.has(id)) return false;
    
    try {
      const success = await (window as any).electronAPI.invoke('unlock-achievement', id);
      if (success) {
        set(state => {
          const next = new Set(state.unlockedIds);
          next.add(id);
          return { 
            unlockedIds: next,
            toastAchievement: id // ТРИГГЕР ДЛЯ УВЕДОМЛЕНИЯ
          };
        });
        
        // Автоматически очищаем уведомление через 5 секунд
        setTimeout(() => get().setToastAchievement(null), 5000);
        
        return true;
      }
    } catch (e) {
      console.error('[AchievementStore] Failed to unlock:', e);
    }
    return false;
  },

  isUnlocked: (id: string) => get().unlockedIds.has(id),
  setToastAchievement: (id: string | null) => set({ toastAchievement: id })
}));
