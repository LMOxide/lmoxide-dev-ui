import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { renewSessions } from './tools'
import './styles.css'

// a remembered session past half its life is renewed before anything uses its token
renewSessions().finally(() =>
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  ),
)
