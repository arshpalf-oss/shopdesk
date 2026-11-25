// shopdesk — API surface tests that run without a database connection:
// the Express app must build, route table must be complete, auth must gate everything.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { app } from '../server/app.js';

function registeredPaths() {
  const paths = new Set();
  for (const layer of app.router?.stack || app._router?.stack || []) {
    const route = layer.route;
    if (route?.path) {
      const methods = Object.keys(route.methods).map((m) => m.toUpperCase());
      paths.add(`${methods.join(',')} ${route.path}`);
    }
  }
  return paths;
}

test('app builds and exposes the expected route table', () => {
  const paths = registeredPaths();
  const required = [
    'POST /api/auth/login', 'POST /api/auth/signup', 'POST /api/auth/logout', 'GET /api/auth/me',
    'GET /api/dashboard', 'GET /api/health',
    'GET /api/products', 'POST /api/products', 'PUT /api/products/:id', 'DELETE /api/products/:id',
    'POST /api/products/:id/adjust-stock', 'GET /api/products/:id/movements',
    'GET /api/categories', 'POST /api/categories',
    'GET /api/customers', 'POST /api/customers', 'GET /api/customers/:id',
    'GET /api/suppliers', 'POST /api/suppliers',
    'GET /api/invoices', 'GET /api/invoices/:id', 'POST /api/invoices',
    'POST /api/invoices/:id/payments', 'DELETE /api/invoices/:id',
    'GET /api/purchases', 'POST /api/purchases', 'DELETE /api/purchases/:id',
    'GET /api/expenses', 'POST /api/expenses',
    'GET /api/reports/summary', 'GET /api/reports/export',
    'GET /api/settings', 'PUT /api/settings', 'GET /api/backup', 'POST /api/restore',
    'POST /api/settings/load-sample', 'POST /api/settings/clear-data',
    'GET /api/search', 'GET /api/pay-qr',
  ];
  const missing = required.filter((r) => !paths.has(r));
  assert.deepEqual(missing, [], `missing routes: ${missing.join(' | ')}`);
});

test('every API route except health/login/signup requires authentication', async () => {
  const { createServer } = await import('node:http');
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const gated = ['/api/dashboard', '/api/products', '/api/invoices', '/api/customers', '/api/expenses', '/api/settings', '/api/reports/summary', '/api/search?q=milk'];
  try {
    for (const path of gated) {
      const res = await fetch(`http://127.0.0.1:${port}${path}`);
      assert.equal(res.status, 401, `${path} should require auth`);
    }
    const health = await fetch(`http://127.0.0.1:${port}/api/health`);
    assert.equal(health.status, 200);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('signup validation rejects bad payloads before touching the database', async () => {
  const { createServer } = await import('node:http');
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ businessName: 'x', email: 'not-an-email', password: 'short' }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.error);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('login validation rejects bad payloads before touching the database', async () => {
  const { createServer } = await import('node:http');
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'nope', password: '' }),
    });
    assert.equal(res.status, 400);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
