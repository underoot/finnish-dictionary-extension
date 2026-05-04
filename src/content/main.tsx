import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import styles from './style.css?inline';

injectNavigationDetector();
bootstrap();

function injectNavigationDetector() {
  const fire = () => document.dispatchEvent(new CustomEvent('fi-dict:navigate'));
  const origPush = history.pushState.bind(history);
  const origReplace = history.replaceState.bind(history);
  history.pushState = (...args: Parameters<typeof history.pushState>) => {
    origPush(...args);
    fire();
  };
  history.replaceState = (...args: Parameters<typeof history.replaceState>) => {
    origReplace(...args);
    fire();
  };
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

  // Stop tooltip interactions from reaching the page's own event listeners
  // (e.g. Areena's document-level play/pause handler).
  // React's e.stopPropagation() only halts synthetic events; native events still
  // cross the shadow boundary, so we intercept them on the host in the light DOM.
  const stopProp = (e: Event) => e.stopPropagation();
  host.addEventListener('click', stopProp);
  host.addEventListener('mousedown', stopProp);
  host.addEventListener('pointerdown', stopProp);

  const mount = document.createElement('div');
  shadow.appendChild(mount);

  createRoot(mount).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
