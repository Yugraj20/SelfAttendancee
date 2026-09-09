import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// When built by the GitHub Actions workflow, assets are served from
// https://<user>.github.io/<repo>/ — adjust the repo name below if you
// rename the repository, or set it to '/' for a custom domain / user site.
const repoName = 'SelfAttendancee'; // <-- Updated this line to match your exact repo name

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? `/${repoName}/` : '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Self Attendance',
        short_name: 'Attendance',
        description: 'Your private, local-first attendance companion',
        theme_color: '#171629',
        background_color: '#10101a',
        display: 'standalone',
        start_url: '.',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: { navigateFallback: 'index.html' }
    })
  ]
});
