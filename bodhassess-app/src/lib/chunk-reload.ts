// Recovery for "a page's JS file is gone".
//
// Every page is a lazily loaded chunk with a hashed filename. A new build
// (deploy, or the Vite dev server re-optimising its dependencies) renames
// them, and a tab opened before that still asks for the OLD names. The server
// answers those with index.html, so the browser refuses it ("'text/html' is
// not a valid JavaScript MIME type" in Safari, "Failed to fetch dynamically
// imported module" in Chrome). A full reload fetches the new index.html and
// the new names, which is the whole fix.
//
// Reloads at most once per RELOAD_WINDOW_MS: if the chunk is still missing
// after a fresh load, something else is wrong (a bad deploy, the wrong base
// path) and looping would hide it — the route's error screen shows instead.

const STORAGE_KEY = 'bodh:chunk-reload-at';
const RELOAD_WINDOW_MS = 10_000;

const CHUNK_ERROR = new RegExp(
  [
    'not a valid JavaScript MIME type',
    'Failed to fetch dynamically imported module',
    'error loading dynamically imported module',
    'Importing a module script failed',
    'Unable to preload CSS',
  ].join('|'),
  'i',
);

export function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String((error as any)?.message ?? error ?? '');
  return CHUNK_ERROR.test(message);
}

/** Reloads the page unless it already did so moments ago. True if a reload was started. */
export function reloadForNewChunks(): boolean {
  try {
    const last = Number(sessionStorage.getItem(STORAGE_KEY) || 0);
    if (Date.now() - last < RELOAD_WINDOW_MS) return false;
    sessionStorage.setItem(STORAGE_KEY, String(Date.now()));
  } catch {
    // Storage blocked: still reload — a single loop guard is not worth a dead page.
  }
  window.location.reload();
  return true;
}

/**
 * Vite fires `vite:preloadError` when it cannot preload a chunk's
 * dependencies — usually before React even sees the failure.
 */
export function installChunkReloadHandler() {
  window.addEventListener('vite:preloadError', (event) => {
    if (reloadForNewChunks()) event.preventDefault();
  });
}
