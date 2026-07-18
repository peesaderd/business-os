import { create } from 'zustand';
import api from '../lib/api';

const useAppStore = create((set, get) => ({
  theme: localStorage.getItem('bos_theme') || 'light',
  serviceStatuses: {},
  activeWindow: null,
  notifications: [],
  
  setTheme: (t) => {
    localStorage.setItem('bos_theme', t);
    document.documentElement.classList.toggle('dark', t === 'dark');
    set({ theme: t });
  },

  toggleTheme: () => {
    const next = get().theme === 'light' ? 'dark' : 'light';
    get().setTheme(next);
  },

  checkHealth: async () => {
    try {
      const res = await api.get('/gateway/health');
      const routes = res.data.routes || [];
      const statuses = {};
      for (const r of routes) {
        const slug = r.split('/')[2]?.split(' ')[0];
        if (slug) statuses[slug] = 'online';
      }
      set({ serviceStatuses: statuses });
    } catch {
      // ignore
    }
  },

  openWindow: (name) => set({ activeWindow: name }),
  closeWindow: () => set({ activeWindow: null }),
}));

export default useAppStore;
