import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/line-seed-jp/400.css';
import './styles.css';
import './board.css';
import './operations.css';
import './experience.css';
import './app-theme.css';
import './timetable.css';
import './hero.css';
import './header.css';
import './toei-board.css';
import './journey.css';
import App from './App';
import { clearLegacyTransitData } from './lib/storage';

clearLegacyTransitData();

if (
  window.matchMedia('(display-mode: standalone)').matches ||
  ('standalone' in navigator && navigator.standalone === true)
) {
  document.documentElement.classList.add('standalone');
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
