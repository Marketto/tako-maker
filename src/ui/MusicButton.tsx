import { useEffect } from 'react';
import { store, useStore } from '../app/store';
import { music } from '../app/music';

/* Interruttore della musica. Se l'utente l'aveva lasciata accesa, riparte
   al primo tocco sulla pagina (i browser non permettono l'avvio automatico). */

let armed = false;
export function armMusicResume() {
  if (armed) return;
  armed = true;
  const { musicOn, musicVolume } = store.get().settings;
  if (!musicOn) return;
  const go = () => {
    window.removeEventListener('pointerdown', go);
    window.removeEventListener('keydown', go);
    if (store.get().settings.musicOn) {
      music.setVolume(musicVolume);
      void music.start();
    }
  };
  window.addEventListener('pointerdown', go);
  window.addEventListener('keydown', go);
}

export function MusicButton() {
  const { settings } = useStore();
  useEffect(() => music.setVolume(settings.musicVolume), [settings.musicVolume]);
  const on = settings.musicOn;
  return (
    <button
      className={`icon-btn music ${on ? 'on' : ''}`}
      aria-pressed={on}
      aria-label={on ? 'Spegni la musica' : 'Accendi la musica rilassante'}
      title={on ? 'Spegni la musica' : 'Musica rilassante'}
      onClick={() => {
        store.setSettings({ musicOn: !on });
        if (on) music.stop();
        else {
          music.setVolume(settings.musicVolume);
          void music.start();
        }
      }}
    >
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 18V5l11-2v13" />
        <circle cx="6" cy="18" r="3" />
        <circle cx="17" cy="16" r="3" />
        {!on && <path d="M3 3l18 18" />}
      </svg>
    </button>
  );
}
