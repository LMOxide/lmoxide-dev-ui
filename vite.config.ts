import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

// In development /api goes to the play server's lmoxide-api (tools/web-dev-backend.sh or
// tools/lan-server.sh in the lmoxide repo) and /editor-api to a survey server's (tools/survey-server.sh),
// so no CORS setup is needed. LMOXIDE_API and LMOXIDE_EDITOR_API point them elsewhere.
const apiTarget = process.env.LMOXIDE_API ?? 'http://127.0.0.1:8090'
const editorApiTarget = process.env.LMOXIDE_EDITOR_API ?? process.env.LMOXIDE_SURVEY_API ?? 'http://127.0.0.1:8091'

export default defineConfig({
  // relative asset paths: dist/ works from any directory or path on a static host
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  // the sign-in page (/), the debugger (/debugger/), the world editor (/editor/), and
  // survey.html, the editor's old address (forwards to /editor/)
  build: {
    rollupOptions: {
      input: { main: 'index.html', debugger: 'debugger/index.html', editor: 'editor/index.html', survey: 'survey.html' },
    },
  },
  server: {
    proxy: {
      '^/api/': { target: apiTarget, rewrite: (p) => p.replace(/^\/api/, '') },
      '^/editor-api/': { target: editorApiTarget, rewrite: (p) => p.replace(/^\/editor-api/, '') },
    },
  },
})
