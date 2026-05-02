import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import styles from './style.css?inline';

if (isFinnishPage()) {
  bootstrap();
}

function isFinnishPage(): boolean {
  const lang = (document.documentElement.getAttribute('lang') ?? '').toLowerCase();
  return lang === 'fi' || lang.startsWith('fi-');
}

function bootstrap() {
  const host = document.createElement('div');
  host.id = '__fi-dict-host';
  host.style.all = 'initial';
  document.documentElement.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });
  const styleEl = document.createElement('style');
  styleEl.textContent = styles;
  shadow.appendChild(styleEl);

  const mount = document.createElement('div');
  shadow.appendChild(mount);

  createRoot(mount).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
