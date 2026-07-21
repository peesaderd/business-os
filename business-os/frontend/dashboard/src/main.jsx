import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Register PWA service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/dashboard/sw.js', {
      scope: '/dashboard/',
    }).then((reg) => {
      console.log('PWA Service Worker registered with scope:', reg.scope);

      // Check for updates
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            console.log('PWA update available — refresh to apply');
            // Optional: show a toast/banner to user
          }
        });
      });
    }).catch((err) => {
      console.warn('PWA Service Worker registration failed:', err);
    });
  });
}
