import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { installChunkReloadHandler } from '@/lib/chunk-reload';

import '@/styles/globals.css';

// A page chunk renamed by a newer build reloads the tab once (see chunk-reload).
installChunkReloadHandler();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
