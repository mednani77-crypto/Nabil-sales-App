import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

// Ask the browser to keep IndexedDB even under storage pressure (important for offline data).
if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
