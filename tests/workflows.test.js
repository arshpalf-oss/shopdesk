import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createServer } from "node:http";
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "shop-desk-tests-"));
process.env.DB_PATH = path.join(temp, "test.sqlite");
process.env.NODE_ENV = "test";
const { createApp } = await import("../server/index.js");
const { db } = await import("../server/db.js");
const { today, calculateTotals, fiscalYear, amountWords } = await import(
  "../shared.js"
);
const server = createServer(await createApp());
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = "http://127.0.0.1:" + server.address().port;
let token = "",
  product,
  service,
  client,
  pet,
  supplier,
  draft,
  issued,
  purchase;
const settings = {
  name: "Integration test clinic",
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
const productData = {
  name: "Integration medicine",
  type: "product",
  category: "Medicines",
  hsn: "30049085",
  unit: "bottle",
  sale_price: 100,
  cost_price: 60,
  gst_rate: 5,
  tax_treatment: "taxable",
  sku: "TEST-MED",
  barcode: "",
  low_stock: 3,
  active: true,
  opening_stock: 10,
  batch_no: "TEST-OPEN",
  expiry: future(365),
};
const serviceData = {
  name: "Integration healthcare service",
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
  pet_id: pet || "",
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
await test("Real workflows, isolated from the user workspace", async (t) => {
  try {
    await t.test(
      "fresh installation is empty, with reference codes only",
      async () => {
        const s = await state();
        assert.equal(s.settings, null);
        for (const key of [
          "products",
          "clients",
          "pets",
          "invoices",
          "batches",
          "purchases",
          "payments",
          "suppliers",
          "movements",
        ])
          assert.equal(s[key].length, 0, key);
        assert.ok((await request("/hsn")).some((c) => c.code === "998351"));
        await request("/products", {
          method: "POST",
          body: productData,
          expected: 409,
        });
      },
    );
    await t.test(
      "first-run setup validates GST state and protects access",
      async () => {
        await request("/setup", {
          method: "POST",
          body: {
            settings: { ...settings, state: "07" },
            password: "test-password",
          },
          expected: 400,
        });
        token = (
          await request("/setup", {
            method: "POST",
            body: { settings, password: "test-password" },
          })
        ).token;
        assert.ok(token.length > 40);
        await request("/state", { auth: false, expected: 401 });
        await request("/setup", {
          method: "POST",
          body: { settings, password: "other-password" },
          expected: 409,
        });
      },
    );
    await t.test(
      "catalogue validation, batches and unique codes are atomic",
      async () => {
        await request("/products", {
          method: "POST",
          body: { ...productData, expiry: "" },
          expected: 400,
        });
        product = (
          await request("/products", { method: "POST", body: productData })
        ).id;
        service = (
          await request("/products", { method: "POST", body: serviceData })
        ).id;
        await request("/products", {
          method: "POST",
          body: productData,
          expected: 400,
        });
        const s = await state();
        assert.equal(s.products.length, 2);
        assert.equal(s.batches.length, 1);
        assert.equal(s.products.find((p) => p.id === product).stock, 10);
      },
    );
    await t.test(
      "client, patient and supplier records are persisted",
      async () => {
        client = (
          await request("/clients", {
            method: "POST",
            body: {
              name: "Integration client",
              phone: "",
              email: "",
              address: "Integration billing address",
              state: "09",
              gstin: "",
              notes: "",
            },
          })
        ).id;
        pet = (
          await request("/pets", {
            method: "POST",
            body: {
              client_id: client,
              name: "Integration patient",
              species: "Dog",
              breed: "",
              sex: "",
              dob: "",
              notes: "",
            },
          })
        ).id;
        supplier = (
          await request("/suppliers", {
            method: "POST",
            body: {
              name: "Integration supplier",
              phone: "",
              email: "",
              address: "",
              gstin: "",
            },
          })
        ).id;
        const s = await state();
        assert.equal(s.clients.length, 1);
        assert.equal(s.pets[0].client_id, client);
        assert.equal(s.suppliers.length, 1);
      },
    );
    await t.test(
      "a draft reserves neither stock nor invoice number",
      async () => {
        draft = (
          await request("/invoices", {
            method: "POST",
            body: bill(
              [{ product_id: product, qty: 2, rate: 100, discount: 0 }],
              { action: "draft" },
            ),
          })
        ).id;
        const s = await state();
        assert.equal(s.invoices[0].number, null);
        assert.equal(s.invoices[0].status, "draft");
        assert.equal(s.products.find((p) => p.id === product).stock, 10);
      },
    );
    await t.test(
      "issuing a draft deducts stock and calculates split GST in paise",
      async () => {
        issued = (
          await request("/invoices/" + draft, {
            method: "PUT",
            body: bill(
              [{ product_id: product, qty: 2, rate: 100, discount: 0 }],
              { payment_amount: 50 },
            ),
          })
        ).id;
        const s = await state(),
          inv = s.invoices.find((i) => i.id === issued);
        assert.equal(inv.number, `SD/${fiscalYear(today())}/00001`);
        assert.equal(inv.total, 21000);
        assert.equal(inv.cgst, 500);
        assert.equal(inv.sgst, 500);
        assert.equal(inv.igst, 0);
        assert.equal(inv.paid, 5000);
        assert.equal(inv.balance, 16000);
        assert.equal(s.products.find((p) => p.id === product).stock, 8);
        assert.equal(inv.lines[0].batches[0].batch_no, "TEST-OPEN");
        await request("/invoices/" + issued, {
          method: "PUT",
          body: bill([{ product_id: product, qty: 1, rate: 1, discount: 0 }]),
          expected: 400,
        });
      },
    );
    await t.test(
      "concurrent billing cannot oversell; failed issue does not consume a number",
      async () => {
        const make = () =>
          fetch(base + "/api/invoices", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: "Bearer " + token,
            },
            body: JSON.stringify(
              bill([{ product_id: product, qty: 6, rate: 100, discount: 0 }]),
            ),
          });
        const rs = await Promise.all([make(), make()]);
        assert.deepEqual(rs.map((r) => r.status).sort(), [200, 400]);
        const s = await state();
        assert.equal(s.products.find((p) => p.id === product).stock, 2);
        assert.equal(s.invoices.filter((i) => i.status === "issued").length, 2);
        assert.equal(
          db
            .prepare("SELECT value FROM counters WHERE key=?")
            .get("invoice:" + fiscalYear(today())).value,
          2,
        );
      },
    );
    await t.test(
      "payment limits and receipt records update balances",
      async () => {
        await request("/invoices/" + issued + "/payment", {
          method: "POST",
          body: { amount: 161, method: "UPI", reference: "", date: today() },
          expected: 400,
        });
        await request("/invoices/" + issued + "/payment", {
          method: "POST",
          body: {
            amount: 160,
            method: "UPI",
            reference: "TEST-RECEIPT",
            date: today(),
          },
        });
        assert.equal(
          (await state()).invoices.find((i) => i.id === issued).balance,
          0,
        );
        await request("/invoices/" + issued + "/payment", {
          method: "POST",
          body: { amount: 1, method: "Cash", reference: "", date: today() },
          expected: 400,
        });
      },
    );
    await t.test(
      "full credit notes restore stock without falsely recording a refund",
      async () => {
        await request("/invoices/" + issued + "/credit", {
          method: "POST",
          body: { reason: "Integration reversal", date: today() },
        });
        let s = await state(),
          inv = s.invoices.find((i) => i.id === issued);
        assert.equal(inv.status, "credited");
        assert.equal(inv.refund_due, 21000);
        assert.equal(inv.balance, 0);
        assert.equal(s.products.find((p) => p.id === product).stock, 4);
        assert.equal(
          s.payments.filter((p) => p.direction === "refund").length,
          0,
        );
        await request("/invoices/" + issued + "/credit", {
          method: "POST",
          body: { reason: "Duplicate", date: today() },
          expected: 400,
        });
        await request("/invoices/" + issued + "/refund", {
          method: "POST",
          body: {
            amount: 100,
            method: "UPI",
            reference: "TEST-REFUND",
            date: today(),
          },
        });
        assert.equal(
          (await state()).invoices.find((i) => i.id === issued).refund_due,
          11000,
        );
        await request("/invoices/" + issued + "/refund", {
          method: "POST",
          body: {
            amount: 110,
            method: "UPI",
            reference: "TEST-REFUND-2",
            date: today(),
          },
        });
        assert.equal(
          (await state()).invoices.find((i) => i.id === issued).refund_due,
          0,
        );
      },
    );
    await t.test(
      "purchases receive batches, supplier payments and duplicate protection",
      async () => {
        const data = {
          supplier_id: supplier,
          invoice_no: "TEST-BILL",
          date: today(),
          notes: "Integration receipt",
          lines: [
            {
              product_id: product,
              qty: 15,
              cost: 80,
              gst_rate: 5,
              batch_no: "TEST-NEW",
              expiry: future(20),
            },
          ],
          payment_amount: 200,
          payment_method: "Bank transfer",
          payment_reference: "",
        };
        purchase = (await request("/purchases", { method: "POST", body: data }))
          .id;
        let s = await state();
        assert.equal(s.products.find((p) => p.id === product).stock, 19);
        assert.equal(s.purchases[0].total, 126000);
        assert.equal(s.purchases[0].paid, 20000);
        await request("/purchases", {
          method: "POST",
          body: data,
          expected: 400,
        });
        assert.equal(
          (await state()).products.find((p) => p.id === product).stock,
          19,
        );
        await request("/purchases/" + purchase + "/payment", {
          method: "POST",
          body: {
            amount: 1060,
            method: "Bank transfer",
            reference: "",
            date: today(),
          },
        });
        s = await state();
        assert.equal(s.purchases[0].paid, s.purchases[0].total);
      },
    );
    await t.test(
      "FEFO picks the earliest-expiring usable batch and stores it on the invoice",
      async () => {
        const key = (
          await request("/invoices", {
            method: "POST",
            body: bill([
              { product_id: product, qty: 1, rate: 100, discount: 0 },
            ]),
          })
        ).id;
        const inv = (await state()).invoices.find((i) => i.id === key);
        assert.equal(inv.number, `SD/${fiscalYear(today())}/00003`);
        assert.equal(inv.lines[0].batches[0].batch_no, "TEST-NEW");
        assert.equal(inv.lines[0].batches[0].qty, 1);
      },
    );
    await t.test(
      "expired inventory is excluded from billing but can be written off",
      async () => {
        const batch = db
          .prepare("SELECT * FROM batches WHERE batch_no='TEST-NEW'")
          .get();
        db.prepare("UPDATE batches SET expiry=? WHERE id=?").run(
          future(-1),
          batch.id,
        );
        const s = await state();
        assert.equal(s.products.find((p) => p.id === product).available, 4);
        await request("/invoices", {
          method: "POST",
          body: bill([{ product_id: product, qty: 5, rate: 100, discount: 0 }]),
          expected: 400,
        });
        await request("/products/" + product + "/adjust", {
          method: "POST",
          body: {
            qty: -14,
            batch_id: batch.id,
            reason: "Integration expired-stock write-off",
          },
        });
        assert.equal(
          (await state()).products.find((p) => p.id === product).stock,
          4,
        );
      },
    );
    await t.test(
      "interstate, exempt and mixed documents receive correct tax treatment",
      async () => {
        let key = (
          await request("/invoices", {
            method: "POST",
            body: bill([
              { product_id: service, qty: 1, rate: 500, discount: 0 },
            ]),
          })
        ).id;
        assert.equal(
          (await state()).invoices.find((i) => i.id === key).document_type,
          "Bill of Supply",
        );
        key = (
          await request("/invoices", {
            method: "POST",
            body: bill(
              [{ product_id: product, qty: 1, rate: 100, discount: 0 }],
              { place_of_supply: "07" },
            ),
          })
        ).id;
        let inv = (await state()).invoices.find((i) => i.id === key);
        assert.equal(inv.igst, 500);
        assert.equal(inv.cgst, 0);
        key = (
          await request("/invoices", {
            method: "POST",
            body: bill([
              { product_id: product, qty: 1, rate: 100, discount: 0 },
              { product_id: service, qty: 1, rate: 500, discount: 0 },
            ]),
          })
        ).id;
        inv = (await state()).invoices.find((i) => i.id === key);
        assert.equal(inv.document_type, "Invoice-cum-Bill of Supply");
        assert.equal(inv.tax, 500);
        const b2b = (
          await request("/clients", {
            method: "POST",
            body: {
              name: "Integration B2B",
              address: "Integration address",
              state: "09",
              gstin: "09ABCDE1234F1Z5",
            },
          })
        ).id;
        await request("/invoices", {
          method: "POST",
          body: bill(
            [
              { product_id: product, qty: 1, rate: 100, discount: 0 },
              { product_id: service, qty: 1, rate: 500, discount: 0 },
            ],
            { client_id: b2b, pet_id: "" },
          ),
          expected: 400,
        });
      },
    );
    await t.test(
      "issued invoices preserve clinic and price snapshots after edits",
      async () => {
        await request("/settings", {
          method: "PUT",
          body: { ...settings, name: "Updated integration clinic" },
        });
        const s = await state();
        assert.equal(s.settings.name, "Updated integration clinic");
        assert.equal(
          s.invoices.find((i) => i.id === issued).clinic.name,
          settings.name,
        );
      },
    );
    await t.test(
      "invoice and credit PDF downloads are actual PDFs",
      async () => {
        for (const suffix of ["", "?credit=1"]) {
          const r = await fetch(
            base + "/api/invoices/" + issued + "/pdf" + suffix,
            { headers: { Authorization: "Bearer " + token } },
          );
          assert.equal(r.status, 200);
          assert.equal(r.headers.get("Content-Type"), "application/pdf");
          const buf = Buffer.from(await r.arrayBuffer());
          assert.equal(buf.subarray(0, 4).toString(), "%PDF");
          assert.ok(buf.length > 12000);
        }
      },
    );
    await t.test(
      "printing preferences persist, invalid formats are rejected and reprints create no transactions",
      async () => {
        const before = await state();
        const updated = {
          ...before.settings,
          invoice_template: "compact",
          thermal_width: "58",
          default_print_format: "thermal",
          receipt_footer: "Clinic footer",
          receipt_show_terms: true,
        };
        await request("/settings", { method: "PUT", body: updated });
        const saved = await state();
        for (const key of [
          "invoice_template",
          "thermal_width",
          "default_print_format",
          "receipt_footer",
          "receipt_show_terms",
        ])
          assert.equal(saved.settings[key], updated[key]);
        await request("/settings", {
          method: "PUT",
          body: { ...updated, thermal_width: "76" },
          expected: 400,
        });
        await request("/settings", {
          method: "PUT",
          body: { ...updated, invoice_template: "invalid" },
          expected: 400,
        });
        for (const format of ["a4", "thermal"]) {
          for (const width of ["58", "80"]) {
            const response = await fetch(
              base +
                `/api/invoices/${issued}/pdf?format=${format}&width=${width}&template=classic`,
              { headers: { Authorization: "Bearer " + token } },
            );
            assert.equal(response.status, 200);
            const buffer = Buffer.from(await response.arrayBuffer());
            assert.equal(buffer.subarray(0, 4).toString(), "%PDF");
            if (format === "thermal")
              assert.ok(
                response.headers
                  .get("Content-Disposition")
                  .includes(`thermal-${width}mm.pdf`),
              );
          }
        }
        for (const query of ["format=other", "width=76", "template=other"])
          await request(`/invoices/${issued}/pdf?${query}`, { expected: 400 });
        await request(`/invoices/${issued}/pdf?format=thermal`, {
          auth: false,
          expected: 401,
        });
        const after = await state();
        for (const key of [
          "invoices",
          "payments",
          "batches",
          "movements",
          "credits",
        ])
          assert.deepEqual(
            after[key],
            before[key],
            `Reprinting must not change ${key}`,
          );
        await request("/settings", { method: "PUT", body: before.settings });
      },
    );
    await t.test(
      "CSV import validates every row atomically and template contains no sample rows",
      async () => {
        const r = await fetch(base + "/api/export/template", {
          headers: { Authorization: "Bearer " + token },
        });
        const text = await r.text();
        assert.equal(text.trim().split(/\r?\n/).length, 1);
        const n = (await state()).products.length;
        await request("/products/import", {
          method: "POST",
          body: {
            rows: [
              { ...serviceData, name: "Should roll back" },
              { ...serviceData, hsn: "INVALID" },
            ],
          },
          expected: 400,
        });
        assert.equal((await state()).products.length, n);
      },
    );
    await t.test(
      "backup excludes credentials and failed restore rolls back every record",
      async () => {
        const backup = await request("/backup");
        assert.equal(backup.format, "shop-desk-backup");
        assert.ok(!backup.tables.sessions && !backup.tables.meta);
        assert.ok(!JSON.stringify(backup).includes("test-password"));
        const old = (await state()).invoices.length;
        const bad = structuredClone(backup);
        bad.tables.pets[0].client_id = "missing-parent";
        await request("/restore", {
          method: "POST",
          body: { backup: bad, password: "test-password" },
          expected: 400,
        });
        assert.equal((await state()).invoices.length, old);
        await request("/clients", {
          method: "POST",
          body: { name: "Remove through restore", state: "09" },
        });
        await request("/restore", {
          method: "POST",
          body: { backup, password: "test-password" },
        });
        assert.ok(
          !(await state()).clients.some(
            (c) => c.name === "Remove through restore",
          ),
        );
        assert.equal((await state()).invoices.length, old);
      },
    );
    await t.test(
      "issued bills persist equal CGST/SGST and correct payments for the reported odd-paise case",
      async () => {
        for (const roundOff of [false, true]) {
          const total = roundOff ? 157400 : 157396;
          const key = (
            await request("/invoices", {
              method: "POST",
              body: bill(
                [{ product_id: product, qty: 1, rate: 1499, discount: 0 }],
                { round_off: roundOff, payment_amount: total / 100 },
              ),
            })
          ).id;
          const current = await state();
          const invoice = current.invoices.find((entry) => entry.id === key);
          assert.equal(invoice.cgst, 3748);
          assert.equal(invoice.sgst, 3748);
          assert.equal(invoice.lines[0].cgst, invoice.lines[0].sgst);
          assert.equal(invoice.tax, 7496);
          assert.equal(invoice.rounding, roundOff ? 4 : 0);
          assert.equal(invoice.total, total);
          assert.equal(invoice.paid, total);
          assert.equal(invoice.balance, 0);
          assert.equal(
            current.payments.filter((entry) => entry.invoice_id === key).length,
            1,
          );
        }
      },
    );
    await t.test(
      "inclusive bills preserve the entered gross with equal persisted components",
      async () => {
        const inclusiveProduct = (
          await request("/products", {
            method: "POST",
            body: {
              ...productData,
              name: "Inclusive rounding test item",
              sku: "INCLUSIVE-ROUNDING",
              opening_stock: 1,
            },
          })
        ).id;
        const key = (
          await request("/invoices", {
            method: "POST",
            body: bill(
              [{ product_id: inclusiveProduct, qty: 1, rate: 1, discount: 0 }],
              { inclusive: true, payment_amount: 1 },
            ),
          })
        ).id;
        const invoice = (await state()).invoices.find(
          (entry) => entry.id === key,
        );
        assert.equal(invoice.cgst, 2);
        assert.equal(invoice.sgst, 2);
        assert.equal(invoice.taxable, 96);
        assert.equal(invoice.total, 100);
        assert.equal(invoice.paid, 100);
        assert.equal(invoice.balance, 0);
      },
    );
    await t.test(
      "legacy issued tax snapshots and payments survive reads, reprints and settings changes unchanged",
      async () => {
        // Seed a PRE-UPDATE invoice in the disposable test DB only, never the clinic DB.
        const row = db
          .prepare("SELECT * FROM invoices WHERE total=157400 LIMIT 1")
          .get();
        const lines = JSON.parse(row.lines);
        Object.assign(lines[0], {
          cgst: 3748,
          sgst: 3747,
          tax: 7495,
          total: 157395,
        });
        db.prepare(
          "UPDATE invoices SET cgst=3748,sgst=3747,tax=7495,rounding=5,lines=? WHERE id=?",
        ).run(JSON.stringify(lines), row.id);
        const saved = db
          .prepare("SELECT * FROM invoices WHERE id=?")
          .get(row.id);
        const payments = db
          .prepare("SELECT * FROM payments WHERE invoice_id=?")
          .all(row.id);
        const current = await state();
        const legacy = current.invoices.find((entry) => entry.id === row.id);
        assert.equal(legacy.cgst, 3748);
        assert.equal(legacy.sgst, 3747);
        assert.equal(legacy.rounding, 5);
        assert.equal(legacy.total, 157400);
        assert.equal(legacy.paid, 157400);
        await request("/settings", {
          method: "PUT",
          body: { ...current.settings, invoice_template: "corporate" },
        });
        const pdf = await fetch(
          base + "/api/invoices/" + row.id + "/pdf?format=thermal&width=58",
          { headers: { Authorization: "Bearer " + token } },
        );
        assert.equal(pdf.status, 200);
        assert.equal((await pdf.arrayBuffer()).byteLength > 1000, true);
        assert.deepEqual(
          db.prepare("SELECT * FROM invoices WHERE id=?").get(row.id),
          saved,
        );
        assert.deepEqual(
          db.prepare("SELECT * FROM payments WHERE invoice_id=?").all(row.id),
          payments,
        );
      },
    );
    await t.test(
      "changing password revokes old sessions and logout revokes the new session",
      async () => {
        await request("/password", {
          method: "PUT",
          body: { current_password: "wrong", password: "next-test-password" },
          expected: 401,
        });
        const r = await request("/password", {
          method: "PUT",
          body: {
            current_password: "test-password",
            password: "next-test-password",
          },
        });
        await request("/state", { expected: 401 });
        token = r.token;
        assert.ok((await state()).settings);
        await request("/logout", { method: "POST" });
        await request("/state", { expected: 401 });
        await request("/login", {
          method: "POST",
          body: { password: "test-password" },
          expected: 401,
        });
        token = (
          await request("/login", {
            method: "POST",
            body: { password: "next-test-password" },
          })
        ).token;
        assert.ok((await state()).products.length);
      },
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
    db.close();
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
test("tax arithmetic uses paise, supports inclusive pricing and preserves total components", () => {
  for (let i = 1; i <= 300; i++) {
    const result = calculateTotals(
      [
        {
          rate: i / 100,
          qty: 1.375,
          discount: 7.5,
          gst_rate: 5,
          tax_treatment: "taxable",
        },
      ],
      { registered: true, inclusive: i % 2 === 0, roundOff: i % 3 === 0 },
    );
    assert.equal(result.cgst, result.sgst);
    assert.equal(result.cgst + result.sgst + result.igst, result.tax);
    assert.equal(result.taxable + result.tax + result.rounding, result.total);
    assert.ok(Number.isInteger(result.total));
  }
  const inclusive = calculateTotals(
    [{ rate: 105, qty: 1, discount: 0, gst_rate: 5, tax_treatment: "taxable" }],
    { registered: true, inclusive: true },
  );
  assert.equal(inclusive.taxable, 10000);
  assert.equal(inclusive.tax, 500);
  assert.equal(inclusive.total, 10500);
  const unregistered = calculateTotals(
    [
      {
        rate: 100,
        qty: 1,
        discount: 0,
        gst_rate: 18,
        tax_treatment: "taxable",
      },
    ],
    { registered: false },
  );
  assert.equal(unregistered.tax, 0);
  assert.equal(unregistered.total, 10000);
  assert.equal(fiscalYear("2026-03-31"), "25-26");
  assert.equal(fiscalYear("2026-04-01"), "26-27");
  assert.equal(amountWords(0), "Rupees Zero Only");
});
