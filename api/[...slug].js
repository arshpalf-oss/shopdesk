// shopdesk — Vercel Serverless Function handling every /api/* request.
// The Express app is identical to local dev; serverless reuses a cached MongoDB connection.
import { app } from '../server/app.js';
import { connectMongo } from '../server/db.js';

export default async function handler(req, res) {
  try {
    await connectMongo();
  } catch (err) {
    console.error('MongoDB connection failed:', err);
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Database unreachable — check MONGODB_URI and that your Atlas cluster allows Vercel.' }));
    return;
  }
  return app(req, res);
}
