import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { SignIn } from './SignIn'
import './styles.css'

// survey.html (the world editor's old address): on to /editor/
if (window.location.pathname.endsWith('/survey.html')) window.location.replace(`./editor/${window.location.search}`)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SignIn />
  </StrictMode>,
)
