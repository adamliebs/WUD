import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initNative, hideSplash, isNative, handleWebEntryLink } from './native'
import { initFirebaseWeb } from './firebase-web'

// Web build: initialize the Firebase JS SDK (enables browser email/Google
// login) and parse any invite/plan deep link in the URL. Both are no-ops on
// native, where the Capacitor plugins handle these instead.
if (!isNative) {
  initFirebaseWeb()
  handleWebEntryLink()
}

// Wire up the native shell (no-op on web) before React mounts.
initNative()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Dismiss the native splash screen once React has painted the first frame.
requestAnimationFrame(() => requestAnimationFrame(hideSplash))
