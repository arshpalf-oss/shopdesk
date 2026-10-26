import test from "node:test";
import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { documentFixture } from "./document-fixture.js";
import { invoicePDF, thermalPDF } from "../server/pdf.js";
import {
  PRINT_DEFAULTS,
  printPreferences,
  renderDocumentHTML,
  receiptBlocks,
  taxSummary,
  paymentURI,
} from "../printing.js";

async function pdfBuffer(renderer, invoice, credit = null, options = {}) {
  const stream = new PassThrough();
  const chunks = [];
  const result = new Promise((resolve, reject) => {
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
  await renderer(stream, invoice, credit, options);
  return result;
}
const mediaBoxes = (buffer) =>
  [
    ...buffer
      .toString("latin1")
      .matchAll(/\/MediaBox\s*\[0 0 ([\d.]+) ([\d.]+)\]/g),
  ].map((match) => ({ width: Number(match[1]), height: Number(match[2]) }));

test("old clinics get safe print defaults without requiring a migration or new records", () => {
  const settings = { name: "Original clinic" };
  const preferences = printPreferences(settings);
  for (const [key, value] of Object.entries(PRINT_DEFAULTS))
    assert.equal(preferences[key], value);
  assert.deepEqual(settings, { name: "Original clinic" });
});
test("all A4 layouts use the same saved amounts, batches and tax summary", () => {
  const invoice = documentFixture();
  const before = structuredClone(invoice);
  for (const template of ["corporate", "compact", "classic"]) {
    const html = renderDocumentHTML(invoice, { template });
    assert.ok(html.includes(`data-template="${template}"`));
    for (const text of [
      invoice.number,
      invoice.clinic.name,
      "TEST-BATCH",
      "30049085",
      "998351",
      "SGST / UTGST",
      "HSN / SAC TAX SUMMARY",
      "Grand total",
    ])
      assert.ok(html.includes(text), text);
    assert.ok(html.includes("#111"));
    assert.ok(!html.includes("Generated with shop desk"));
  }
  const groups = taxSummary(invoice);
  assert.equal(
    groups.reduce((sum, group) => sum + group.taxable, 0),
    invoice.taxable,
  );
  assert.equal(
    groups.reduce(
      (sum, group) => sum + group.cgst + group.sgst + group.igst,
      0,
    ),
    invoice.tax,
  );
  assert.deepEqual(invoice, before, "Formatting must not change the bill");
});
test("thermal bills retain item, GST, batch, customer and actual payment facts", () => {
  const invoice = documentFixture();
  const payment = {
    invoice_id: invoice.id,
    date: invoice.date,
    method: "Cash",
    direction: "receipt",
    amount: 20000,
    reference: "PAYMENT-TEST",
  };
  for (const width of ["80", "58"]) {
    const options = {
      format: "thermal",
      width,
      payments: [payment],
      settings: { receipt_footer: "Clinic's own footer" },
    };
    const html = renderDocumentHTML(invoice, options);
    assert.ok(html.includes(`data-width="${width}"`));
    assert.ok(html.includes(`size:${width}mm`));
    for (const text of [
      "TEST-BATCH",
      "CGST",
      "SGST / UTGST",
      "PAYMENTS RECORDED",
      "PAYMENT-TEST",
      "Place of supply",
      "Balance due",
      "Clinic&#39;s own footer",
    ])
      assert.ok(html.includes(text), text);
    assert.ok(
      !html.includes(invoice.terms),
      "Thermal terms are optional and off by default",
    );
    assert.ok(
      renderDocumentHTML(invoice, {
        ...options,
        settings: { receipt_show_terms: true },
      }).includes(invoice.terms),
    );
  }
});
test("all printable user text is escaped; no external assets or injected scripts", () => {
  const invoice = documentFixture();
  invoice.clinic.name = '<script>alert("clinic")</script>';
  invoice.customer.name = "<img src=x onerror=alert(1)>";
  invoice.notes = '</p><iframe src="https://evil.invalid"></iframe>';
  invoice.lines[0].name = "<svg onload=alert(2)>";
  for (const format of ["a4", "thermal"]) {
    const html = renderDocumentHTML(invoice, {
      format,
      qrData: '" onerror="alert(3)',
    });
    assert.ok(!html.includes("<script"));
    assert.ok(!html.includes("<iframe"));
    assert.ok(!html.includes("<svg"));
    assert.ok(!html.includes("<img src=x"));
    assert.ok(html.includes("&lt;script&gt;"));
    assert.ok(!/src="https?:/.test(html));
  }
});
test("drafts, credited originals, credit notes and UPI QR eligibility remain explicit", () => {
  const invoice = documentFixture();
  assert.ok(paymentURI(invoice).includes("am=489.00"));
  assert.equal(paymentURI({ ...invoice, balance: 0 }), "");
  assert.equal(paymentURI({ ...invoice, status: "draft" }), "");
  assert.equal(paymentURI(invoice, { settings: { print_show_qr: false } }), "");
  const credit = {
    number: "CN/26-27/00001",
    date: invoice.date,
    reason: "Test return",
  };
  assert.equal(paymentURI(invoice, { credit }), "");
  const html = renderDocumentHTML(
    { ...invoice, status: "draft", number: null },
    { format: "thermal" },
  );
  assert.ok(html.includes("DRAFT — NOT VALID FOR PAYMENT OR TAX"));
  const credited = {
    ...invoice,
    status: "credited",
    credit,
    refund_due: 20000,
  };
  assert.ok(
    renderDocumentHTML(credited, { format: "thermal" }).includes(
      "CREDITED IN FULL",
    ),
  );
  const creditText = receiptBlocks(credited, { credit })
    .map((block) =>
      [block.text, block.label, block.value].filter(Boolean).join(" "),
    )
    .join("\n");
  assert.ok(creditText.includes("CREDIT NOTE"));
  assert.ok(creditText.includes(credit.number));
  assert.ok(creditText.includes("Original bill"));
  assert.ok(creditText.includes("Test return"));
  assert.ok(!creditText.includes("Net payment received"));
});
test("corporate, compact and classic PDFs are A4 and fit an ordinary two-item invoice on one page", async () => {
  for (const template of ["corporate", "compact", "classic"]) {
    const buffer = await pdfBuffer(invoicePDF, documentFixture(), null, {
      template,
    });
    assert.equal(buffer.subarray(0, 4).toString(), "%PDF");
    const pages = mediaBoxes(buffer);
    assert.equal(
      pages.length,
      1,
      `${template}: unnecessary blank or overflow page`,
    );
    assert.ok(Math.abs(pages[0].width - 595.28) < 0.1);
    assert.ok(Math.abs(pages[0].height - 841.89) < 0.1);
  }
});
test("thermal PDFs use true 58/80 mm paper widths and content-sized roll lengths", async () => {
  const invoice = documentFixture();
  for (const width of ["58", "80"]) {
    const buffer = await pdfBuffer(thermalPDF, invoice, null, { width });
    const pages = mediaBoxes(buffer);
    assert.equal(pages.length, 1);
    assert.ok(Math.abs(pages[0].width - (Number(width) * 72) / 25.4) < 0.01);
    assert.ok(pages[0].height > 150 && pages[0].height < 2835);
    const credit = {
      number: "CN/26-27/00001",
      date: invoice.date,
      reason: "Test return",
    };
    const creditPDF = await pdfBuffer(thermalPDF, invoice, credit, { width });
    assert.ok(
      Math.abs(mediaBoxes(creditPDF)[0].width - (Number(width) * 72) / 25.4) <
        0.01,
    );
  }
});
test("long invoices and very long batch lists paginate without changing the paper width", async () => {
  const invoice = documentFixture(100);
  invoice.lines[0].batches = Array.from({ length: 85 }, (_, index) => ({
    batch_no: `TEST-LONG-BATCH-${index}`,
    expiry: "2030-12-31",
    qty: 1,
  }));
  const original = structuredClone(invoice);
  for (const template of ["corporate", "compact", "classic"]) {
    const pages = mediaBoxes(
      await pdfBuffer(invoicePDF, invoice, null, { template }),
    );
    assert.ok(pages.length > 1);
    assert.ok(pages.every((page) => Math.abs(page.width - 595.28) < 0.1));
  }
  for (const width of ["58", "80"]) {
    const pages = mediaBoxes(
      await pdfBuffer(thermalPDF, invoice, null, { width }),
    );
    assert.ok(pages.length > 1);
    assert.ok(
      pages.every(
        (page) =>
          Math.abs(page.width - (Number(width) * 72) / 25.4) < 0.01 &&
          page.height <= 2835,
      ),
    );
  }
  assert.deepEqual(invoice, original);
});
