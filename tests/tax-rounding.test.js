import test from "node:test";
import assert from "node:assert/strict";
import { calculateTotals } from "../shared.js";
import { taxSummary, renderDocumentHTML } from "../printing.js";
import { documentFixture } from "./document-fixture.js";

const line = (rate, extra = {}) => ({
  rate,
  qty: 1,
  discount: 0,
  gst_rate: 5,
  tax_treatment: "taxable",
  hsn: "30049085",
  unit: "bottle",
  name: "Rounding test item",
  ...extra,
});
const checkTotals = (result) => {
  assert.equal(result.cgst, result.sgst);
  assert.equal(result.cgst + result.sgst + result.igst, result.tax);
  assert.equal(result.taxable + result.tax + result.rounding, result.total);
  assert.equal(
    result.lines.reduce((sum, entry) => sum + entry.total, 0) + result.rounding,
    result.total,
  );
  for (const entry of result.lines) {
    assert.equal(entry.cgst, entry.sgst);
    assert.equal(entry.tax, entry.cgst + entry.sgst + entry.igst);
    assert.equal(entry.total, entry.taxable + entry.tax);
    for (const key of ["cgst", "sgst", "igst", "taxable", "tax", "total"])
      assert.ok(Number.isSafeInteger(entry[key]), key);
  }
};

test("the reported ₹1,499 at 5% case has equal ₹37.48 components and a ₹0.04 round-off", () => {
  const result = calculateTotals([line(1499)], {
    registered: true,
    roundOff: true,
  });
  checkTotals(result);
  assert.equal(result.taxable, 149900);
  assert.equal(result.cgst, 3748);
  assert.equal(result.sgst, 3748);
  assert.equal(result.tax, 7496);
  assert.equal(result.rounding, 4);
  assert.equal(result.total, 157400);
  const exact = calculateTotals([line(1499)], { registered: true });
  assert.equal(exact.total, 157396);
  assert.equal(exact.rounding, 0);
});
test("inclusive pricing preserves the entered total even when tax has an odd-paise split", () => {
  const result = calculateTotals([line(151.24, { gst_rate: 18 })], {
    registered: true,
    inclusive: true,
  });
  checkTotals(result);
  assert.equal(result.total, 15124);
  assert.equal(result.cgst, 1154);
  assert.equal(result.sgst, 1154);
  assert.equal(result.taxable, 12816);
});
test("all lines, HSN groups and invoice totals retain equal splits across rates, discounts and fractional quantities", () => {
  for (const rate of [0, 0.1, 0.25, 1, 1.5, 3, 5, 18, 28, 40]) {
    for (const inclusive of [false, true]) {
      for (const roundOff of [false, true]) {
        const inputs = Array.from({ length: 45 }, (_, index) =>
          line((index + 1) * 7.37, {
            qty: ((index % 4) + 1) * 0.375,
            discount: index % 3 === 0 ? 7.5 : 0,
            gst_rate: rate,
            hsn: index % 2 ? "30049085" : "30024200",
          }),
        );
        const result = calculateTotals(inputs, {
          registered: true,
          inclusive,
          roundOff,
        });
        checkTotals(result);
        for (const group of taxSummary(result))
          assert.equal(group.cgst, group.sgst);
        if (inclusive) {
          const agreed = result.lines.reduce(
            (sum, entry) => sum + entry.gross - entry.discount_amount,
            0,
          );
          assert.equal(result.total, agreed + result.rounding);
        }
      }
    }
  }
});
test("interstate IGST keeps the single-tax calculation; unregistered and exempt lines collect no tax", () => {
  const interstate = calculateTotals([line(1499)], {
    registered: true,
    interstate: true,
  });
  assert.equal(interstate.cgst, 0);
  assert.equal(interstate.sgst, 0);
  assert.equal(interstate.igst, 7495);
  assert.equal(interstate.total, 157395);
  for (const options of [{ registered: false }, { registered: true }]) {
    for (const treatment of ["exempt", "nil", "non_gst"]) {
      const result = calculateTotals(
        [line(1499, { tax_treatment: treatment })],
        options,
      );
      checkTotals(result);
      assert.equal(result.tax, 0);
      assert.equal(result.total, 149900);
    }
  }
});
test("printing a historical odd-split invoice never silently changes its saved taxes or balance", () => {
  const legacy = documentFixture(1);
  Object.assign(legacy, {
    subtotal: 149900,
    discount: 0,
    taxable: 149900,
    tax: 7495,
    cgst: 3748,
    sgst: 3747,
    igst: 0,
    total: 157400,
    rounding: 5,
    paid: 157400,
    balance: 0,
  });
  Object.assign(legacy.lines[0], {
    rate: 149900,
    qty: 1,
    discount: 0,
    discount_amount: 0,
    gross: 149900,
    taxable: 149900,
    tax: 7495,
    cgst: 3748,
    sgst: 3747,
    igst: 0,
    total: 157395,
  });
  const original = structuredClone(legacy);
  for (const format of ["a4", "thermal"]) {
    const html = renderDocumentHTML(legacy, { format });
    assert.ok(
      html.includes("37.48") && html.includes("37.47"),
      "A reprint is not a financial correction",
    );
  }
  assert.deepEqual(legacy, original);
});
