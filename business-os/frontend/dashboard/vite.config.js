import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'icons/*.png'],
      manifest: {
        name: 'Business OS Dashboard',
        short_name: 'BizOS',
        description: 'Business Operating System — Manage your business apps, orders, and analytics',
        theme_color: '#0a0818',
        background_color: '#0a0818',
        display: 'standalone',
        display_override: ['window-controls-overlay', 'standalone'],
        orientation: 'any',
        scope: '/dashboard/',
        start_url: '/dashboard/',
        id: '/dashboard/',
        icons: [
          { src: '/dashboard/icons/icon-96x96.png', sizes: '96x96', type: 'image/png' },
          { src: '/dashboard/icons/icon-144x144.png', sizes: '144x144', type: 'image/png' },
          { src: '/dashboard/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/dashboard/icons/icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/dashboard/icons/icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        categories: ['business', 'productivity', 'utilities'],
        shortcuts: [
          {
            name: 'Dashboard',
            url: '/dashboard/',
            icons: [{ src: '/dashboard/icons/icon-96x96.png', sizes: '96x96', type: 'image/png' }],
          },
          {
            name: 'POS',
            url: '/dashboard/pos',
            icons: [{ src: '/dashboard/icons/icon-96x96.png', sizes: '96x96', type: 'image/png' }],
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https?:\/\/.*\/api\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
    }),
  ],
  base: '/dashboard/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
