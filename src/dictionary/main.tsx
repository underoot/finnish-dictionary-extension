import React from 'react';
import { createRoot } from 'react-dom/client';
import Dictionary from './Dictionary';

const root = document.getElementById('root')!;
createRoot(root).render(
  <React.StrictMode>
    <Dictionary />
  </React.StrictMode>,
);
