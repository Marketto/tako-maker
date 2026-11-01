import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { LocaleRoot } from './App';
import '@fontsource/m-plus-rounded-1c/latin-500.css';
import '@fontsource/m-plus-rounded-1c/latin-800.css';
// Sottoinsiemi caricati solo se la pagina usa quei caratteri (unicode-range).
import '@fontsource/m-plus-rounded-1c/latin-ext-500.css';
import '@fontsource/m-plus-rounded-1c/latin-ext-800.css';
import '@fontsource/m-plus-rounded-1c/cyrillic-500.css';
import '@fontsource/m-plus-rounded-1c/cyrillic-800.css';
import '@fontsource/m-plus-rounded-1c/greek-500.css';
import '@fontsource/m-plus-rounded-1c/greek-800.css';
import './styles.css';
import { armMusicResume } from './ui/MusicButton';
import { detectLocale, setLocale, t } from './i18n';
import { store } from './app/store';

const updateSW = registerSW({
  onNeedRefresh() {
    const bar = document.createElement('div');
    bar.className = 'update-bar';
    const label = document.createElement('span');
    label.textContent = t('È disponibile una nuova versione.');
    bar.appendChild(label);
    const btn = document.createElement('button');
    btn.textContent = t('Aggiorna');
    btn.onclick = () => void updateSW(true);
    bar.appendChild(btn);
    document.body.appendChild(bar);
  },
});

armMusicResume();

// La lingua va caricata prima del primo disegno, per non mostrare testi misti.
void setLocale(store.get().settings.language ?? detectLocale()).finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <LocaleRoot />
    </StrictMode>,
  );
});
