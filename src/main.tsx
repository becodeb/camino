import { createRoot } from 'react-dom/client';
import './ui/fonts.css';
import './ui/notebook.css';
import './ui/camino.css';
import './ui/primer.css';
import './ui/workshop.css';
import './ui/motivation.css';
import { App } from './App';
import { registerServiceWorker } from './playtest/registerServiceWorker';

createRoot(document.getElementById('root')!).render(<App />);
registerServiceWorker();
