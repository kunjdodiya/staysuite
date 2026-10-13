import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource-variable/inter';
import './styles/index.css';
import { App } from './App';
import { registerSW } from 'virtual:pwa-register';
import { useStore } from './data/store';

// Dev-only handle for debugging in the console
if (import.meta.env.DEV) (window as unknown as { __ss: typeof useStore }).__ss = useStore;

if ('serviceWorker' in navigator && import.meta.env.PROD) registerSW({ immediate: true });

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
