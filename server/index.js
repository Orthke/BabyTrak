import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import routes from './routes.js';
import db from './db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());

// API
app.use('/api', routes);
app.get('/api/health', (req, res) => res.json({ ok: true }));

// Serve the built client in production (single process on the Linux box).
const clientDist = join(__dirname, '..', 'client', 'dist');
if (existsSync(clientDist)) {
  app.use(
    express.static(clientDist, {
      setHeaders: (res, filePath) => {
        // Correct MIME for the manifest, and keep the service worker fresh so
        // app updates are picked up rather than served from a stale cache.
        if (filePath.endsWith('.webmanifest')) res.setHeader('Content-Type', 'application/manifest+json');
        if (filePath.endsWith('sw.js')) res.setHeader('Cache-Control', 'no-cache');
      },
    })
  );
  app.get('*', (req, res) => res.sendFile(join(clientDist, 'index.html')));
}

// Listen on all interfaces so the phone / iPad can reach it over the LAN.
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`BabyTrak server running on http://0.0.0.0:${PORT}`);
});

// On shutdown, fold the WAL back into the main .sqlite file and close cleanly.
// Keeps the database in a single self-contained file between runs.
let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  try {
    db.pragma('wal_checkpoint(TRUNCATE)');
    db.close();
  } catch {
    /* nothing useful to do if checkpoint fails on the way out */
  }
  server.close(() => process.exit(0));
  // Don't hang forever if connections are open.
  setTimeout(() => process.exit(0), 1000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
