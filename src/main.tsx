import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
// Fonts are bundled (not loaded from Google) so the app looks right fully offline and inside the APK.
import '@fontsource/ibm-plex-sans-arabic/400.css';
import '@fontsource/ibm-plex-sans-arabic/500.css';
import '@fontsource/ibm-plex-sans-arabic/600.css';
import '@fontsource/ibm-plex-sans-arabic/700.css';
import '@fontsource/alexandria/400.css';
import '@fontsource/alexandria/600.css';
import '@fontsource/alexandria/700.css';
import '@fontsource/noto-sans-ethiopic/400.css';
import '@fontsource/noto-sans-ethiopic/700.css';
import './styles.css';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { createBackController, installBackButton } from './ui/back';

// Ask the browser to keep IndexedDB even under storage pressure (important for offline data).
if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});

// Phone back button: close sheet → previous screen → on home, press twice to exit.
// Must be installed before the first render so screens can register with it.
if (Capacitor.isNativePlatform()) {
  const back = createBackController({
    exit: () => void CapApp.exitApp(),
    hint: () => window.dispatchEvent(new Event('back-exit-hint')),
    now: () => Date.now(),
  });
  installBackButton(back);
  void CapApp.addListener('backButton', () => back.press());
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
