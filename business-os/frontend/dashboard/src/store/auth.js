import { create } from 'zustand';
import api from '../lib/api';

const useAuthStore = create((set, get) => ({
  user: JSON.parse(localStorage.getItem('bos_user') || 'null'),
  token: localStorage.getItem('bos_token') || null,
  loading: false,
  error: null,

  login: async (email, password) => {
    set({ loading: true, error: null });
    try {
      const res = await api.post('/gateway/auth/login', { email, password });
      const { token, user } = res.data;
      localStorage.setItem('bos_token', token);
      localStorage.setItem('bos_user', JSON.stringify(user));
      set({ user, token, loading: false, error: null });
      return true;
    } catch (err) {
      const msg = err.response?.data?.error || 'เข้าสู่ระบบไม่สำเร็จ';
      set({ loading: false, error: msg });
      return false;
    }
  },

  register: async (data) => {
    set({ loading: true, error: null });
    try {
      const res = await api.post('/gateway/auth/register', data);
      const { token, user } = res.data;
      localStorage.setItem('bos_token', token);
      localStorage.setItem('bos_user', JSON.stringify(user));
      set({ user, token, loading: false, error: null });
      return true;
    } catch (err) {
      const msg = err.response?.data?.error || 'สมัครสมาชิกไม่สำเร็จ';
      set({ loading: false, error: msg });
      return false;
    }
  },

  logout: () => {
    localStorage.removeItem('bos_token');
    localStorage.removeItem('bos_user');
    set({ user: null, token: null, error: null });
  },

  clearError: () => set({ error: null }),
}));

export default useAuthStore;
