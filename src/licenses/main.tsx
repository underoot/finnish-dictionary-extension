import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import Licenses from './Licenses';
import './style.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Licenses />
  </StrictMode>,
);
