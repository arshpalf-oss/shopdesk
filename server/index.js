// shopdesk — local / self-hosted entry point.
// Serves the API and (if built) the SPA from one port. On Vercel, api/[...slug].js is used instead.
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connectMongo, ROOT } from './db.js';
import { app } from './app.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(ROOT, 'dist');
const PORT = Number(process.env.PORT || 8787);

await connectMongo();

// serve the built SPA in production (Vercel does this via static output instead)
if (fs.existsSync(DIST)) {
  app.use(express.static(DIST, { maxAge: '1h', index: false }));
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api')) return res.sendFile(path.join(DIST, 'index.html'));
    next();
  });
}

// final 404 for unknown API routes
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`shopdesk listening on http://0.0.0.0:${PORT} (MongoDB via MONGODB_URI${process.env.MONGODB_URI ? '' : ' — defaulting to mongodb://127.0.0.1:27017/shopdesk'})`);
});
