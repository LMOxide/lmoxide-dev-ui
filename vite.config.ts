import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// In development /api goes to lmoxide-api (tools/web-dev-backend.sh in the lmoxide repo), so no
// CORS setup is needed. LMOXIDE_API points it elsewhere.
const apiTarget = process.env.LMOXIDE_API ?? 'http://127.0.0.1:8090'

export default defineConfig({
  // relative asset paths: dist/ works from any directory or path on a static host
  base: './',
  plugins: [react()],
  // two pages: the debug browser and the survey page (survey.html)
  build: { rollupOptions: { input: { main: 'index.html', survey: 'survey.html' } } },
  server: {
    proxy: {
      '^/api/': { target: apiTarget, rewrite: (p) => p.replace(/^\/api/, '') },
    },
  },
})
