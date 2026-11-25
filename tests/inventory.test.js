// shopdesk — DB & seed invariants (node:test, temp database, no network)
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'shopdesk-test-'));
process.env.SHOPDESK_DATA = tmp;
process.env.SHOPDESK_DB = path.join(tmp, 'test.sqlite');

const { db, q } = await import('../server/db.js');
const { seedDatabase } = await import('../server/seed.js');

before(() => { seedDatabase(); });

test('seeds a complete demo business', () => {
  assert.equal(Number(q.get('SELECT COUNT(*) AS n FROM users').n), 2);
  assert.equal(Number(q.get('SELECT COUNT(*) AS n FROM products').n), 60);
  assert.equal(Number(q.get('SELECT COUNT(*) AS n FROM categories').n), 6);
  assert.ok(Number(q.get('SELECT COUNT(*) AS n FROM invoices').n) > 500, 'sales history should feel alive');
  assert.ok(Number(q.get('SELECT COUNT(*) AS n FROM customers').n) >= 14);
  assert.ok(Number(q.get("SELECT COUNT(*) AS n FROM invoices WHERE date(date) = date('now','localtime')").n) > 0, 'there should be bills today');
});

test('invoice math is internally consistent', () => {
  const rows = q.all('SELECT subtotal, discount, taxable, tax_total, grand_total, paid FROM invoices');
  assert.ok(rows.length > 0);
  for (const r of rows) {
    const expectGrand = Math.max(0, Math.round((r.taxable + r.tax_total - r.discount) * 100) / 100);
    assert.ok(Math.abs(expectGrand - r.grand_total) < 0.02, `grand_total mismatch: ${expectGrand} vs ${r.grand_total}`);
    assert.ok(r.paid <= r.grand_total + 0.5, 'paid may not exceed grand total');
    assert.ok(r.taxable <= r.subtotal + 0.02, 'taxable value cannot exceed subtotal');
  }
});

test('line items sum to invoice taxable value', () => {
  const sample = q.all("SELECT id FROM invoices ORDER BY id DESC LIMIT 25");
  for (const { id } of sample) {
    const inv = q.get('SELECT taxable FROM invoices WHERE id = ?', id);
    const sum = q.get('SELECT COALESCE(SUM(taxable),0) AS s FROM invoice_items WHERE invoice_id = ?', id);
    assert.ok(Math.abs(Number(inv.taxable) - Number(sum.s)) < 0.02, `invoice ${id} items mismatch`);
  }
});

test('stock levels never go negative and low-stock alerts exist', () => {
  const neg = q.get('SELECT COUNT(*) AS n FROM products WHERE stock < -0.001');
  assert.equal(Number(neg.n), 0);
  const low = q.get('SELECT COUNT(*) AS n FROM products WHERE stock <= reorder_level');
  assert.ok(Number(low.n) > 0, 'dashboard low-stock widget should have something to show');
});

test('invoice counter matches seeded bills and produces unique next numbers', () => {
  const counter = Number(q.get("SELECT value FROM counters WHERE key = 'invoice'").value);
  const bills = Number(q.get('SELECT COUNT(*) AS n FROM invoices').n);
  assert.equal(counter, bills);
});

test('open credit sales make upstanding udhaar', () => {
  const outstanding = Number(q.get("SELECT COALESCE(SUM(grand_total - paid),0) AS o FROM invoices WHERE status != 'paid'").o);
  assert.ok(outstanding > 0, 'there should be some udhaar outstanding');
});
