import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('bos_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('bos_token');
      localStorage.removeItem('bos_user');
      if (window.location.pathname !== '/') {
        window.location.href = '/';
      }
    }
    return Promise.reject(err);
  }
);

export default api;

// ========== Auth ==========
export const authAPI = {
  login: (email, password) => api.post('/auth/login', { email, password }),
  register: (data) => api.post('/auth/register', data),
  profile: () => api.get('/auth/profile'),
};

// ========== AI Chat ==========
export const chatAPI = {
  send: (message, model = 'opencode-go/deepseek-v4-flash') =>
    api.post('/chat/send', { message, model }),
  history: () => api.get('/chat/history'),
};

// ========== Image Gen ==========
export const imageAPI = {
  generate: (prompt, model = 'default') =>
    api.post('/image/generate', { prompt, model }),
  gallery: () => api.get('/image/gallery'),
};

// ========== Video Gen ==========
export const videoAPI = {
  generate: (prompt, model = 'default') =>
    api.post('/video/generate', { prompt, model }),
};

// ========== Social Post ==========
export const socialAPI = {
  create: (data) => api.post('/social/post', data),
  list: () => api.get('/social/posts'),
  platforms: () => api.get('/social/platforms'),
};

// ========== Booking ==========
export const bookingAPI = {
  list: () => api.get('/booking/list'),
  create: (data) => api.post('/booking/create', data),
  update: (id, data) => api.put(`/booking/${id}`, data),
};

// ========== POS ==========
export const posAPI = {
  createOrder: (data) => api.post('/pos/order', data),
  orders: () => api.get('/pos/orders'),
  products: () => api.get('/pos/products'),
};

// ========== Queue ==========
export const queueAPI = {
  list: () => api.get('/queue/list'),
  add: (data) => api.post('/queue/add', data),
  call: (id) => api.post(`/queue/${id}/call`),
};

// ========== Payment ==========
export const paymentAPI = {
  createQR: (amount, currency = 'thb') =>
    api.post('/payment/qr', { amount, currency }),
  history: () => api.get('/payment/history'),
};

// ========== Website Builder ==========
export const websiteAPI = {
  templates: () => api.get('/website/templates'),
  create: (data) => api.post('/website/create', data),
};

// ========== WordPress ==========
export const wordpressAPI = {
  posts: () => api.get('/wordpress/posts'),
  createPost: (data) => api.post('/wordpress/post', data),
};
