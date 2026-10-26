import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createServer } from "node:http";
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "shop-desk-returns-"));
process.env.DB_PATH = path.join(temp, "test.sqlite");
process.env.NODE_ENV = "test";
const { createApp } = await import("../server/index.js");
const { db } = await import("../server/db.js");
const { today, fiscalYear } = await import("../shared.js");
const server = createServer(await createApp());
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = "http://127.0.0.1:" + server.address().port;
let token = "",
  product,
  service,
  client,
  paidInvoice,
  unpaidInvoice,
  serviceInvoice;
const settings = {
  name: "Returns test clinic",
  owner_name: "Test owner",
  address: "Test address",
  city: "Test city",
  state: "09",
  phone: "",
  email: "",
  gst_registered: true,
  gstin: "09ABCDE1234F1Z5",
  invoice_prefix: "SD",
  terms: "Test terms",
  upi_id: "",
  bank_name: "",
  account_name: "",
  account_number: "",
  ifsc: "",
  round_off: false,
  registration_no: "",
  drug_license: "",
};
const future = (days) => {
  const d = new Date(today() + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const past = (days) => future(-days);
const productData = {
  name: "Returnable medicine",
  type: "product",
  category: "Medicines",
  hsn: "30049085",
  unit: "bottle",
  sale_price: 100,
  cost_price: 60,
  gst_rate: 5,
  tax_treatment: "taxable",
  sku: "RETURN-MED",
  barcode: "",
  low_stock: 3,
  active: true,
  opening_stock: 20,
  batch_no: "RETURN-OPEN",
  expiry: future(365),
};
const serviceData = {
  name: "Returned consultation",
  type: "service",
  category: "Services",
  hsn: "998351",
  unit: "service",
  sale_price: 500,
  cost_price: 0,
  gst_rate: 0,
  tax_treatment: "exempt",
  sku: "",
  barcode: "",
  low_stock: 0,
  active: true,
  opening_stock: 0,
  batch_no: "",
  expiry: "",
};
const bill = (lines, extra = {}) => ({
  date: today(),
  due_date: today(),
  client_id: client || "",
  pet_id: "",
  place_of_supply: "09",
  inclusive: false,
  round_off: false,
  notes: "",
  terms: "Test terms",
  action: "issue",
  payment_amount: 0,
  payment_method: "Cash",
  payment_reference: "",
  lines,
  ...extra,
});
async function request(
  url,
  { method = "GET", body, auth = true, expected = 200 } = {},
) {
  const r = await fetch(base + "/api" + url, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(auth && token ? { Authorization: "Bearer " + token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  assert.equal(r.status, expected, JSON.stringify(data));
  return data;
}
const state = () => request("/state");
const stock = async (id) =>
  (await state()).products.find((p) => p.id === id).stock;
const returnBody = (invoice_id, lines, extra = {}) => ({
  invoice_id,
  date: today(),
  reason: "Customer returned unused items",
  notes: "",
  lines,
  ...extra,
});

await test("Customer returns keep stock, tax and refunds consistent", async (t) => {
  try {
    await t.test("setup, catalogue and an issued invoice", async () => {
      token = (
        await request("/setup", {
          method: "POST",
          body: { settings, password: "test-password" },
        })
      ).token;
      product = (
        await request("/products", { method: "POST", body: productData })
      ).id;
      service = (
        await request("/products", { method: "POST", body: serviceData })
      ).id;
      client = (
        await request("/clients", {
          method: "POST",
          body: {
            name: "Returns client",
            address: "Returns billing address",
            state: "09",
            gstin: "",
          },
        })
      ).id;
      paidInvoice = (
        await request("/invoices", {
          method: "POST",
          body: bill([{ product_id: product, qty: 3, rate: 100, discount: 0 }], {
            payment_amount: 315,
            payment_reference: "RETURN-SALE",
          }),
        })
      ).id;
      const inv = (await state()).invoices.find((i) => i.id === paidInvoice);
      assert.equal(inv.total, 31500);
      assert.equal(inv.paid, 31500);
      assert.equal(inv.balance, 0);
      assert.equal(inv.refund_due, 0);
      assert.equal(inv.returned_total, 0);
      assert.equal(inv.fully_returned, false);
      assert.equal(await stock(product), 17);
      await request("/returns", {
        method: "POST",
        body: returnBody(paidInvoice, []),
        expected: 400,
      });
      await request("/returns", { method: "POST", body: {}, auth: false, expected: 401 });
    });

    await t.test("return validation rejects bad dates, reasons and lines", async () => {
      await request("/returns", {
        method: "POST",
        body: returnBody(paidInvoice, [
          { line_index: 0, qty: 1, condition: "resellable" },
        ], { date: future(1) }),
        expected: 400,
      });
      await request("/returns", {
        method: "POST",
        body: returnBody(paidInvoice, [
          { line_index: 0, qty: 1, condition: "resellable" },
        ], { date: past(2) }),
        expected: 400,
      });
      await request("/returns", {
        method: "POST",
        body: returnBody(paidInvoice, [
          { line_index: 0, qty: 1, condition: "resellable" },
        ], { reason: "" }),
        expected: 400,
      });
      await request("/returns", {
        method: "POST",
        body: returnBody(paidInvoice, [
          { line_index: 0, qty: 1, condition: "melted" },
        ]),
        expected: 400,
      });
      await request("/returns", {
        method: "POST",
        body: returnBody(paidInvoice, [
          { line_index: 0, qty: 0, condition: "resellable" },
        ]),
        expected: 400,
      });
      await request("/returns", {
        method: "POST",
        body: returnBody(paidInvoice, [
          { line_index: 4, qty: 1, condition: "resellable" },
        ]),
        expected: 400,
      });
      await request("/returns", {
        method: "POST",
        body: returnBody(paidInvoice, [
          { line_index: 0, qty: 1, condition: "resellable" },
          { line_index: 0, qty: 1, condition: "resellable" },
        ]),
        expected: 400,
      });
    });

    await t.test("a partial resellable return restocks the original batch", async () => {
      const key = (
        await request("/returns", {
          method: "POST",
          body: returnBody(paidInvoice, [
            { line_index: 0, qty: 1, condition: "resellable" },
          ]),
        })
      ).id;
      const s = await state();
      const ret = s.returns.find((r) => r.id === key);
      const inv = s.invoices.find((i) => i.id === paidInvoice);
      assert.equal(ret.number, `RN/${fiscalYear(today())}/00001`);
      assert.equal(ret.total, 10500);
      assert.equal(ret.taxable, 10000);
      assert.equal(ret.cgst, 250);
      assert.equal(ret.sgst, 250);
      assert.equal(ret.tax, 500);
      assert.equal(ret.refund_due, 10500);
      assert.equal(ret.restocked_qty, 1);
      assert.equal(ret.lines.length, 1);
      assert.equal(ret.lines[0].condition, "resellable");
      assert.equal(ret.invoice_number, inv.number);
      assert.equal(inv.returned_total, 10500);
      assert.equal(inv.returned_qty, 1);
      assert.equal(inv.returned_count, 1);
      assert.equal(inv.refund_due, 10500);
      assert.equal(inv.balance, 0);
      assert.equal(inv.fully_returned, false);
      assert.equal(await stock(product), 18);
      const movement = s.movements.find(
        (m) => m.reference === ret.number && m.type === "return",
      );
      assert.ok(movement);
      assert.equal(movement.qty, 1);
      assert.equal(
        db
          .prepare("SELECT qty FROM batches WHERE batch_no='RETURN-OPEN'")
          .get().qty,
        18,
      );
    });

    await t.test("over-returning a line is rejected without partial writes", async () => {
      const before = await state();
      await request("/returns", {
        method: "POST",
        body: returnBody(paidInvoice, [
          { line_index: 0, qty: 3, condition: "resellable" },
        ]),
        expected: 400,
      });
      const after = await state();
      assert.equal(after.returns.length, before.returns.length);
      assert.equal(await stock(product), 18);
    });

    await t.test("damaged and expired returns are recorded but not restocked", async () => {
      const damaged = (
        await request("/returns", {
          method: "POST",
          body: returnBody(paidInvoice, [
            { line_index: 0, qty: 1, condition: "damaged" },
          ]),
        })
      ).id;
      let s = await state();
      let ret = s.returns.find((r) => r.id === damaged);
      assert.equal(ret.total, 10500);
      assert.equal(ret.restocked_qty, 0);
      assert.equal(ret.lines[0].condition, "damaged");
      assert.equal(await stock(product), 18);
      const expired = (
        await request("/returns", {
          method: "POST",
          body: returnBody(paidInvoice, [
            { line_index: 0, qty: 1, condition: "expired" },
          ]),
        })
      ).id;
      s = await state();
      ret = s.returns.find((r) => r.id === expired);
      assert.equal(ret.restocked_qty, 0);
      assert.equal(ret.lines[0].condition, "expired");
      assert.equal(await stock(product), 18);
      const inv = s.invoices.find((i) => i.id === paidInvoice);
      assert.equal(inv.returned_total, 31500);
      assert.equal(inv.fully_returned, true);
      assert.equal(inv.refund_due, 31500);
      assert.equal(inv.balance, 0);
      await request("/returns", {
        method: "POST",
        body: returnBody(paidInvoice, [
          { line_index: 0, qty: 1, condition: "resellable" },
        ]),
        expected: 400,
      });
      await request("/invoices/" + paidInvoice + "/credit", {
        method: "POST",
        body: { reason: "Should be blocked", date: today() },
        expected: 400,
      });
    });

    await t.test("refunds are recorded separately and cannot exceed the amount due", async () => {
      await request("/invoices/" + paidInvoice + "/refund", {
        method: "POST",
        body: { amount: 316, method: "UPI", reference: "", date: today() },
        expected: 400,
      });
      await request("/invoices/" + paidInvoice + "/refund", {
        method: "POST",
        body: {
          amount: 315,
          method: "UPI",
          reference: "RETURN-REFUND",
          date: today(),
        },
      });
      let s = await state();
      let inv = s.invoices.find((i) => i.id === paidInvoice);
      assert.equal(inv.refund_due, 0);
      assert.equal(inv.paid, 0);
      assert.equal(s.payments.filter((p) => p.direction === "refund").length, 1);
      await request("/invoices/" + paidInvoice + "/refund", {
        method: "POST",
        body: { amount: 1, method: "Cash", reference: "", date: today() },
        expected: 400,
      });
    });

    await t.test("return notes download as real PDFs and export as CSV", async () => {
      const ret = (await state()).returns[0];
      const pdf = await fetch(base + "/api/returns/" + ret.id + "/pdf", {
        headers: { Authorization: "Bearer " + token },
      });
      assert.equal(pdf.status, 200);
      assert.equal(pdf.headers.get("Content-Type"), "application/pdf");
      const buffer = Buffer.from(await pdf.arrayBuffer());
      assert.equal(buffer.subarray(0, 4).toString(), "%PDF");
      assert.ok(buffer.length > 4000);
      await request("/returns/missing/pdf", { expected: 404 });
      const csv = await fetch(base + "/api/export/returns", {
        headers: { Authorization: "Bearer " + token },
      });
      assert.equal(csv.status, 200);
      const text = await csv.text();
      assert.match(text, /Return number/);
      assert.match(text, new RegExp(ret.number.replaceAll("/", "\\/")));
      assert.match(text, /RETURN-REFUND|Customer returned unused items/);
    });

    await t.test("unpaid returns reduce the balance before creating any refund", async () => {
      unpaidInvoice = (
        await request("/invoices", {
          method: "POST",
          body: bill([{ product_id: product, qty: 2, rate: 100, discount: 0 }]),
        })
      ).id;
      let inv = (await state()).invoices.find((i) => i.id === unpaidInvoice);
      assert.equal(inv.total, 21000);
      assert.equal(inv.balance, 21000);
      await request("/invoices/" + unpaidInvoice + "/refund", {
        method: "POST",
        body: { amount: 1, method: "Cash", reference: "", date: today() },
        expected: 400,
      });
      await request("/returns", {
        method: "POST",
        body: returnBody(unpaidInvoice, [
          { line_index: 0, qty: 1, condition: "resellable" },
        ]),
      });
      inv = (await state()).invoices.find((i) => i.id === unpaidInvoice);
      assert.equal(inv.returned_total, 10500);
      assert.equal(inv.balance, 10500);
      assert.equal(inv.refund_due, 0);
      await request("/invoices/" + unpaidInvoice + "/payment", {
        method: "POST",
        body: { amount: 106, method: "Cash", reference: "", date: today() },
        expected: 400,
      });
      await request("/invoices/" + unpaidInvoice + "/payment", {
        method: "POST",
        body: { amount: 105, method: "Cash", reference: "", date: today() },
      });
      inv = (await state()).invoices.find((i) => i.id === unpaidInvoice);
      assert.equal(inv.balance, 0);
      await request("/returns", {
        method: "POST",
        body: returnBody(unpaidInvoice, [
          { line_index: 0, qty: 1, condition: "resellable" },
        ]),
      });
      inv = (await state()).invoices.find((i) => i.id === unpaidInvoice);
      assert.equal(inv.fully_returned, true);
      assert.equal(inv.balance, 0);
      assert.equal(inv.refund_due, 10500);
      await request("/invoices/" + unpaidInvoice + "/payment", {
        method: "POST",
        body: { amount: 1, method: "Cash", reference: "", date: today() },
        expected: 400,
      });
    });

    await t.test("services can be returned without touching stock", async () => {
      serviceInvoice = (
        await request("/invoices", {
          method: "POST",
          body: bill([{ product_id: service, qty: 1, rate: 500, discount: 0 }], {
            payment_amount: 500,
          }),
        })
      ).id;
      const before = await stock(product);
      const key = (
        await request("/returns", {
          method: "POST",
          body: returnBody(serviceInvoice, [
            { line_index: 0, qty: 1, condition: "resellable" },
          ]),
        })
      ).id;
      const s = await state();
      const ret = s.returns.find((r) => r.id === key);
      assert.equal(ret.total, 50000);
      assert.equal(ret.restocked_qty, 0);
      assert.equal(ret.lines[0].condition, "service");
      assert.equal(await stock(product), before);
      const inv = s.invoices.find((i) => i.id === serviceInvoice);
      assert.equal(inv.fully_returned, true);
      assert.equal(inv.refund_due, 50000);
    });

    await t.test("split returns add back to exactly the billed line amount", async () => {
      const key = (
        await request("/invoices", {
          method: "POST",
          body: bill([{ product_id: product, qty: 3, rate: 1499, discount: 0 }], {
            payment_amount: 4721.86,
          }),
        })
      ).id;
      const inv = (await state()).invoices.find((i) => i.id === key);
      assert.equal(inv.total, 472186);
      await request("/returns", {
        method: "POST",
        body: returnBody(key, [
          { line_index: 0, qty: 1, condition: "resellable" },
        ]),
      });
      await request("/returns", {
        method: "POST",
        body: returnBody(key, [
          { line_index: 0, qty: 2, condition: "resellable" },
        ]),
      });
      const s = await state();
      const invoiceReturns = s.returns.filter((r) => r.invoice_id === key);
      assert.equal(invoiceReturns.length, 2);
      assert.equal(
        invoiceReturns.reduce((n, r) => n + r.total, 0),
        inv.lines[0].total,
      );
      assert.equal(
        invoiceReturns.reduce((n, r) => n + r.cgst, 0),
        inv.lines[0].cgst,
      );
      assert.equal(
        invoiceReturns.reduce((n, r) => n + r.sgst, 0),
        inv.lines[0].sgst,
      );
      const updated = s.invoices.find((i) => i.id === key);
      assert.equal(updated.fully_returned, true);
      assert.equal(updated.refund_due, 472186);
    });

    await t.test("fractional quantities return exact portions", async () => {
      const key = (
        await request("/invoices", {
          method: "POST",
          body: bill(
            [{ product_id: product, qty: 1.5, rate: 100, discount: 0 }],
            { payment_amount: 157.5 },
          ),
        })
      ).id;
      const inv = (await state()).invoices.find((i) => i.id === key);
      assert.equal(inv.total, 15750);
      await request("/returns", {
        method: "POST",
        body: returnBody(key, [
          { line_index: 0, qty: 0.5, condition: "resellable" },
        ]),
      });
      await request("/returns", {
        method: "POST",
        body: returnBody(key, [
          { line_index: 0, qty: 1, condition: "damaged" },
        ]),
      });
      const s = await state();
      const rets = s.returns.filter((r) => r.invoice_id === key);
      assert.equal(rets.reduce((n, r) => n + r.taxable, 0), inv.lines[0].taxable);
      assert.equal(rets.reduce((n, r) => n + r.cgst, 0), inv.lines[0].cgst);
      assert.equal(rets.reduce((n, r) => n + r.total, 0), inv.total);
      const updated = s.invoices.find((i) => i.id === key);
      assert.equal(updated.fully_returned, true);
      assert.equal(updated.refund_due, inv.total);
    });

    await t.test("a full return reverses invoice round-off exactly", async () => {
      const key = (
        await request("/invoices", {
          method: "POST",
          body: bill(
            [{ product_id: product, qty: 1, rate: 1499, discount: 0 }],
            { round_off: true, payment_amount: 1574 },
          ),
        })
      ).id;
      const inv = (await state()).invoices.find((i) => i.id === key);
      assert.equal(inv.total, 157400);
      assert.equal(inv.rounding, 4);
      const retId = (
        await request("/returns", {
          method: "POST",
          body: returnBody(key, [
            { line_index: 0, qty: 1, condition: "resellable" },
          ]),
        })
      ).id;
      let ret = (await state()).returns.find((r) => r.id === retId);
      assert.equal(ret.rounding, 4);
      assert.equal(ret.total, 157400);
      assert.equal(ret.refund_due, 157400);
      await request("/invoices/" + key + "/refund", {
        method: "POST",
        body: {
          amount: 1574,
          method: "Cash",
          reference: "ROUND-OFF-REFUND",
          date: today(),
        },
      });
      const refunded = (await state()).invoices.find((i) => i.id === key);
      assert.equal(refunded.refund_due, 0);
      assert.equal(refunded.paid, 0);
      assert.equal(refunded.fully_returned, true);
    });

    await t.test("backup contains returns, restores atomically and accepts version 1", async () => {
      const stockBefore = await stock(product);
      const returnedBefore = (await state()).returns.length;
      assert.ok(returnedBefore >= 8);
      const backup = await request("/backup");
      assert.equal(backup.version, 2);
      assert.ok(Array.isArray(backup.tables.returns));
      assert.equal(backup.tables.returns.length, returnedBefore);
      const legacy = structuredClone(backup);
      legacy.version = 1;
      delete legacy.tables.returns;
      delete legacy.tables.return_lines;
      delete legacy.tables.return_allocations;
      await request("/restore", {
        method: "POST",
        body: { backup: legacy, password: "test-password" },
      });
      let s = await state();
      assert.equal(s.returns.length, 0);
      assert.equal(
        s.invoices.find((i) => i.id === paidInvoice).returned_total,
        0,
      );
      await request("/restore", {
        method: "POST",
        body: { backup, password: "test-password" },
      });
      s = await state();
      assert.equal(s.returns.length, returnedBefore);
      assert.equal(await stock(product), stockBefore);
      assert.equal(
        s.invoices.find((i) => i.id === paidInvoice).fully_returned,
        true,
      );
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    db.close();
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
