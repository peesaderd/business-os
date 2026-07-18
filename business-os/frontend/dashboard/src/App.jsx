import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import useAuthStore from './store/auth';
import useAppStore from './store/app';

import AppLayout from './layouts/AppLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Chat from './pages/Chat';
import Design from './pages/Design';
import ImageGen from './pages/ImageGen';
import VideoGen from './pages/VideoGen';
import SocialPost from './pages/SocialPost';
import POS from './pages/POS';
import Booking from './pages/Booking';
import Queue from './pages/Queue';
import Website from './pages/Website';
import WordPress from './pages/WordPress';
import Payment from './pages/Payment';
import Settings from './pages/Settings';

function ProtectedRoute({ children }) {
  const { token } = useAuthStore();
  if (!token) return <Navigate to="/" replace />;
  return children;
}

function PublicRoute({ children }) {
  const { token } = useAuthStore();
  if (token) return <Navigate to="/app" replace />;
  return children;
}

function AppInit() {
  const { theme } = useAppStore();
  React.useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);
  return null;
}

export default function App() {
  return (
    <BrowserRouter basename="/">
      <AppInit />
      <Routes>
        {/* Public */}
        <Route path="/" element={<PublicRoute><Login /></PublicRoute>} />
        <Route path="/register" element={<PublicRoute><div>Register page</div></PublicRoute>} />

        {/* Protected */}
        <Route path="/app" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
          <Route index element={<Dashboard />} />
          <Route path="chat" element={<Chat />} />
          <Route path="design" element={<Design />} />
          <Route path="image" element={<ImageGen />} />
          <Route path="video" element={<VideoGen />} />
          <Route path="social" element={<SocialPost />} />
          <Route path="pos" element={<POS />} />
          <Route path="booking" element={<Booking />} />
          <Route path="queue" element={<Queue />} />
          <Route path="website" element={<Website />} />
          <Route path="wordpress" element={<WordPress />} />
          <Route path="payment" element={<Payment />} />
          <Route path="settings" element={<Settings />} />
        </Route>

        {/* 404 */}
        <Route path="*" element={
          <div className="min-h-screen flex items-center justify-center bg-background">
            <div className="text-center">
              <h1 className="text-4xl font-bold mb-2">404</h1>
              <p className="text-muted-foreground">ไม่พบหน้าที่คุณหา</p>
              <a href="/app" className="text-primary hover:underline mt-4 inline-block">กลับหน้าหลัก</a>
            </div>
          </div>
        } />
      </Routes>
    </BrowserRouter>
  );
}
