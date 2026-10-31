import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import './styles.css';

const updateSW = registerSW({
  onNeedRefresh() {
    const bar = document.createElement('div');
    bar.className = 'update-bar';
    bar.innerHTML = '<span>È disponibile una nuova versione.</span>';
    const btn = document.createElement('button');
    btn.textContent = 'Aggiorna';
    btn.onclick = () => void updateSW(true);
    bar.appendChild(btn);
    document.body.appendChild(bar);
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
