// shopdesk — unit tests for billing math & shared helpers (no database needed)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeLine, invoiceStatus, gstSplit, round2 } from '../server/billing.js';

test('computeLine: gross, discount, tax and line total are consistent', () => {
  const line = computeLine({ qty: 2, price: 100, discount: 10, tax_rate: 18 });
  assert.equal(line.gross, 200);
  assert.equal(line.taxable, 180);          // 10% off
  assert.equal(line.tax, 32.4);             // 18% of 180
  assert.equal(line.lineTotal, 212.4);
});

test('computeLine: zero discount / zero tax edge cases', () => {
  const line = computeLine({ qty: 5, price: 20, discount: 0, tax_rate: 0 });
  assert.deepEqual(line, { gross: 100, taxable: 100, tax: 0, lineTotal: 100 });
});

test('computeLine: fractional quantities round sanely', () => {
  const line = computeLine({ qty: 1.5, price: 33.33, discount: 0, tax_rate: 5 });
  assert.equal(line.gross, 50);      // 1.5 × 33.33 = 49.995 → rounds to 50
  assert.equal(line.taxable, 50);
  assert.equal(line.tax, 2.5);
  assert.equal(line.lineTotal, 52.5);
});

test('gstSplit: intrastate splits into equal CGST/SGST', () => {
  assert.deepEqual(gstSplit(18, false), { cgst: 9, sgst: 9, igst: 0 });
  assert.deepEqual(gstSplit(18.01, false), { cgst: 9.01, sgst: 9, igst: 0 });
});

test('gstSplit: interstate puts everything into IGST', () => {
  assert.deepEqual(gstSplit(28, true), { cgst: 0, sgst: 0, igst: 28 });
});

test('invoiceStatus: paid / partial / unpaid thresholds', () => {
  assert.equal(invoiceStatus(100, 100), 'paid');
  assert.equal(invoiceStatus(100, 100.4), 'paid');   // rounding tolerance
  assert.equal(invoiceStatus(50, 100), 'partial');
  assert.equal(invoiceStatus(0, 100), 'unpaid');
});

test('round2: half-cent rounding', () => {
  assert.equal(round2(2.675), 2.68);
  assert.equal(round2(0.1 + 0.2), 0.3);
});
