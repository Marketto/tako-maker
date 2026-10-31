import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import '@fontsource/m-plus-rounded-1c/latin-500.css';
import '@fontsource/m-plus-rounded-1c/latin-800.css';
import './styles.css';
import { armMusicResume } from './ui/MusicButton';

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

armMusicResume();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
