#!/usr/bin/env node
// shopdesk — browser-less smoke test.
// Bundles the SPA, renders it inside jsdom against a RUNNING shopdesk server,
// and asserts that key screens render real seeded data. No browser needed.
//
//   1. start MongoDB and set MONGODB_URI (Atlas string, or mongodb://127.0.0.1:27017/shopdesk)
//   2. create the demo workspace once:  npm run seed
//   3. start the app:                   npm run dev
//   4. in another terminal:             node tests/smoke.mjs [port]
//
// Exits non-zero if any route fails to render its marker.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.argv[2] || process.env.PORT || 8787);
const BASE = `http://127.0.0.1:${PORT}`;
const DEMO = { email: 'aarav@shopdesk.demo', password: 'demo1234' };

const ROUTES = [
  ['/', 'Shivam General Store'],
  ['/', 'INV-0'],                       // ticker / recent bills
  ['/billing', 'Kurkure'],
  ['/invoices', 'INV-0'],
  ['/products', 'Kurkure'],
  ['/purchases', 'PUR-'],
  ['/customers', 'Rohit'],
  ['/suppliers', 'Mahadev'],
  ['/expenses', 'Salary'],
  ['/reports', 'GST summary'],
  ['/settings', 'Business profile'],
  ['/login', 'shopdesk'],
];

// ---- 1. bundle the SPA -------------------------------------------------
const bundle = path.join(ROOT, 'tests', '.bundle.cjs');
console.log('· bundling SPA with esbuild…');
execSync(
  `npx esbuild "${path.join(ROOT, 'src/App.jsx')}" --bundle --platform=node --format=cjs --outfile="${bundle}" --loader:.css=empty --jsx=automatic --external:react --external:react-dom --external:react/jsx-runtime --external:react-dom/client --log-level=error`,
  { stdio: 'inherit' }
);

// ---- 2. log in to harvest the session cookie ----------------------------
const loginRes = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(DEMO),
});
if (!loginRes.ok) {
  console.error(`✗ could not log in to ${BASE} as ${DEMO.email} — is the server running? (npm run dev)`);
  process.exit(1);
}
const setCookie = (loginRes.headers.getSetCookie?.() || []).find((c) => c.startsWith('shopdesk_session='));
const session = setCookie ? setCookie.split(';')[0].split('=')[1] : null;
if (!session) { console.error('✗ login did not return a session cookie'); process.exit(1); }

// ---- 3. render each route inside jsdom ----------------------------------
const define = (name, value) => { try { Object.defineProperty(globalThis, name, { value, configurable: true, writable: true }); } catch { /* locked */ } };

async function renderRoute(route, marker) {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: `http://localhost${route}`, pretendToBeVisual: true,
  });
  const { window } = dom;
  for (const key of Object.getOwnPropertyNames(window)) {
    if (!Object.prototype.hasOwnProperty.call(globalThis, key)) define(key, window[key]);
  }
  define('window', window);
  define('document', window.document);
  define('navigator', window.navigator);
  define('location', window.location);
  define('history', window.history);
  define('localStorage', window.localStorage);
  define('self', window);
  window.matchMedia = window.matchMedia || ((q) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }));
  define('matchMedia', window.matchMedia);
  define('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  define('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } });
  define('getComputedStyle', window.getComputedStyle.bind(window));
  window.scrollTo = () => {};

  const nodeFetch = globalThis.fetch;
  define('fetch', (input, init = {}) => {
    const url = String(input).startsWith('http') ? String(input) : BASE + String(input);
    return nodeFetch(url, { ...init, headers: { ...(init.headers || {}), Cookie: `shopdesk_session=${session}` }, redirect: 'manual' });
  });

  const React = await import('react');
  const { createRoot } = await import('react-dom/client');
  const mod = await import(bundle + `?t=${Date.now()}`); // fresh evaluation per route
  const App = mod.default?.default ?? mod.default;
  createRoot(window.document.getElementById('root')).render(React.createElement(App));

  const deadline = Date.now() + 12000;
  let html = '';
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 150));
    html = window.document.body.innerHTML;
    if (html.includes(marker)) break;
  }
  window.close();
  return html;
}

let failures = 0;
for (const [route, marker] of ROUTES) {
  try {
    const html = await renderRoute(route, marker);
    const ok = html.includes(marker);
    if (ok) console.log(`✓ ${route.padEnd(12)} renders “${marker}” (${html.length} chars)`);
    else { console.error(`✗ ${route.padEnd(12)} missing marker “${marker}” (${html.length} chars)`); failures += 1; }
  } catch (err) {
    console.error(`✗ ${route.padEnd(12)} threw: ${err.message}`);
    failures += 1;
  }
}
console.log(failures ? `\n${failures} route(s) failed` : '\nAll routes render. shopdesk is alive.');
process.exit(failures ? 1 : 0);
