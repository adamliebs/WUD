import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initNative, hideSplash } from './native'

// Wire up the native shell (no-op on web) before React mounts.
initNative()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Dismiss the native splash screen once React has painted the first frame.
requestAnimationFrame(() => requestAnimationFrame(hideSplash))
