import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { ToastProvider } from './components/Toast.jsx';
import { BabyProvider } from './context/BabyContext.jsx';
import { SettingsProvider } from './context/SettingsContext.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <SettingsProvider>
          <BabyProvider>
            <App />
          </BabyProvider>
        </SettingsProvider>
      </ToastProvider>
    </BrowserRouter>
  </React.StrictMode>
);

// Register the service worker in the built app. `navigator.serviceWorker` only
// exists in a secure context (HTTPS or localhost), so this is a no-op over plain
// LAN HTTP — iOS still installs from the manifest without it.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
