import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
// KaTeX CSS — imported from the npm package so Vite resolves and serves
// the bundled WOFF2 fonts (KaTeX_Size1/2, KaTeX_AMS, etc.). The previous
// CDN <link> failed to deliver the size fonts which left √ and other
// large symbols invisible at runtime.
import 'katex/dist/katex.min.css';
import './src/styles/globals.css';
import { installWizardSync } from './src/services/api';

// Phase B: wizardStore → Supabase background sync 설치. idempotent (installed
// flag) — HMR / StrictMode 재호출 안전. SUPABASE_ENABLED=false 면 subscribe
// 콜백이 testId 가드로 no-op.
installWizardSync();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);