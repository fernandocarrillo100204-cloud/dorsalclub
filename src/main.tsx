import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ThemeProvider } from './context/ThemeContext.tsx';
import { WorkspaceProvider } from './context/WorkspaceContext.tsx';
import './index.css';

// Manejo resiliente de eventos de precarga y desincronización de chunks dinámicos en Vite
window.addEventListener('vite:preloadError', (event) => {
  // A deployment may replace a lazy chunk; a network failure must not loop reloads.
  try {
    const key = 'antiorder_preload_retry';
    const previous = Number(sessionStorage.getItem(key) || 0);
    if (!navigator.onLine || Date.now() - previous < 60_000) return;
    sessionStorage.setItem(key, String(Date.now()));
    event.preventDefault();
    window.location.reload();
  } catch {
    // When session storage is unavailable, let the module error boundary handle it.
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <WorkspaceProvider><App /></WorkspaceProvider>
    </ThemeProvider>
  </StrictMode>,
);
