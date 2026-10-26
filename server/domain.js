import { z } from "zod";
import { randomUUID } from "node:crypto";
import { db, getMeta, insert, update } from "./db.js";
import { PRINT_DEFAULTS } from "../printing.js";
import {
  STATES,
  CATEGORIES,
  UNITS,
  PAYMENT_METHODS,
  paise,
  today,
  fiscalYear,
  calculateTotals,
  quantity,
  returnLineAmounts,
} from "../shared.js";
export const id = () => randomUUID();
export const now = () => new Date().toISOString();
export const fail = (message, status = 400) => {
  const e = new Error(message);
  e.status = status;
  throw e;
};
const text = (max = 200) => z.string().trim().max(max).default("");
const required = (max = 200) =>
  z.string().trim().min(1, "This field is required").max(max);
const amount = z.coerce
  .number()
  .finite()
  .min(0)
  .max(100000000)
  .refine(
    (v) => Math.abs(v * 100 - Math.round(v * 100)) < 0.00001,
    "Use at most 2 decimal places for money",
  );
const qty = z.coerce
  .number()
  .finite()
  .min(0)
  .max(10000000)
  .refine(
    (v) => Math.abs(v * 1000 - Math.round(v * 1000)) < 0.000001,
    "Use at most 3 decimal places",
  );
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .refine(
    (v) =>
      !isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v,
    "Invalid date",
  );
const optionalDate = z.union([z.literal(""), date]).default("");
const state = z.enum(STATES.map((s) => s[0]));
const gstin = text(15).refine(
  (v) => !v || /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(v),
  "Enter a valid 15-character GSTIN in uppercase",
);
export const settingsSchema = z
  .object({
    name: required(150),
    owner_name: required(100),
    address: required(500),
    city: required(100),
    state,
    phone: text(30),
    email: text(200).refine(
      (v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
      "Enter a valid email",
    ),
    gst_registered: z.boolean().default(false),
    gstin,
    registration_no: text(100),
    drug_license: text(100),
    invoice_prefix: z
      .string()
      .trim()
      .regex(/^[A-Z0-9]{1,4}$/, "Prefix: 1–4 uppercase letters or numbers")
      .default("SD"),
    round_off: z.boolean().default(false),
    invoice_template: z
      .enum(["corporate", "compact", "classic"])
      .default("corporate"),
    default_print_format: z.enum(["a4", "thermal"]).default("a4"),
    thermal_width: z.enum(["58", "80"]).default("80"),
    receipt_footer: text(300),
    receipt_show_terms: z.boolean().default(false),
    print_show_qr: z.boolean().default(true),
    terms: text(1200),
    upi_id: text(150),
    bank_name: text(150),
    account_name: text(150),
    account_number: text(40),
    ifsc: text(20),
  })
  .superRefine((s, ctx) => {
    if (s.gst_registered && (!s.gstin || s.gstin.slice(0, 2) !== s.state))
      ctx.addIssue({
        code: "custom",
        path: ["gstin"],
        message: "GSTIN is required and must match the clinic state",
      });
  });
export const productSchema = z
  .object({
    name: required(),
    type: z.enum(["product", "service"]),
    category: z.enum(CATEGORIES),
    hsn: z
      .string()
      .trim()
      .regex(/^\d{4}$|^\d{6}$|^\d{8}$/, "Use a 4, 6 or 8 digit HSN/SAC code"),
    unit: z.enum(UNITS),
    sale_price: amount,
    cost_price: amount.default(0),
    gst_rate: z.coerce.number().finite().min(0).max(40),
    tax_treatment: z.enum(["taxable", "exempt", "nil", "non_gst"]),
    sku: text(80),
    barcode: text(100),
    low_stock: qty.default(5),
    active: z.boolean().default(true),
    opening_stock: qty.default(0),
    batch_no: text(100),
    expiry: optionalDate,
  })
  .superRefine((s, ctx) => {
    if (s.type === "service" && s.hsn.length !== 6)
      ctx.addIssue({
        code: "custom",
        path: ["hsn"],
        message: "Services require a 6-digit SAC code",
      });
    if (s.type === "service" && s.opening_stock > 0)
      ctx.addIssue({
        code: "custom",
        path: ["opening_stock"],
        message: "Services cannot have stock",
      });
    if (s.tax_treatment === "taxable" && s.gst_rate <= 0)
      ctx.addIssue({
        code: "custom",
        path: ["gst_rate"],
        message: "Choose a positive GST rate, or select nil/exempt treatment",
      });
    if (
      s.type === "product" &&
      s.opening_stock > 0 &&
      ["Medicines", "Vaccines"].includes(s.category) &&
      (!s.batch_no || !s.expiry)
    )
      ctx.addIssue({
        code: "custom",
        path: ["batch_no"],
        message:
          "Medicines and vaccines with stock require a batch number and expiry date",
      });
    if (s.opening_stock > 0 && s.expiry && s.expiry < today())
      ctx.addIssue({
        code: "custom",
        path: ["expiry"],
        message: "Opening stock cannot be expired",
      });
  });
export const clientSchema = z
  .object({
    name: required(150),
    phone: text(30),
    email: text(200).refine(
      (v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
      "Enter a valid email",
    ),
    address: text(600),
    state,
    gstin,
    notes: text(1500),
  })
  .superRefine((s, ctx) => {
    if (s.gstin && s.gstin.slice(0, 2) !== s.state)
      ctx.addIssue({
        code: "custom",
        path: ["gstin"],
        message: "GSTIN must match the client state",
      });
  });
export const petSchema = z
  .object({
    client_id: required(50),
    name: required(100),
    species: required(70),
    breed: text(100),
    sex: text(30),
    dob: optionalDate,
    notes: text(1200),
  })
  .refine(
    (s) => !s.dob || s.dob <= today(),
    "Date of birth cannot be in the future",
  );
export const supplierSchema = z.object({
  name: required(150),
  phone: text(30),
  email: text(200).refine(
    (v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
    "Enter a valid email",
  ),
  address: text(600),
  gstin,
});
export const lineSchema = z.object({
  product_id: required(50),
  qty: qty.refine((v) => v > 0, "Quantity must be greater than zero"),
  rate: amount,
  discount: z.coerce.number().finite().min(0).max(100).default(0),
});
export const invoiceSchema = z
  .object({
    date,
    due_date: date,
    client_id: text(50),
    pet_id: text(50),
    place_of_supply: state,
    inclusive: z.boolean().default(false),
    round_off: z.boolean().default(false),
    lines: z.array(lineSchema).min(1, "Add at least one item").max(100),
    notes: text(2000),
    terms: text(1200),
    action: z.enum(["draft", "issue"]).default("draft"),
    payment_amount: amount.default(0),
    payment_method: z.enum(PAYMENT_METHODS).default("Cash"),
    payment_reference: text(200),
  })
  .refine(
    (s) => s.due_date >= s.date,
    "Due date cannot be before the invoice date",
  );
export const paymentSchema = z
  .object({
    amount: amount.refine((v) => v > 0, "Amount must be greater than zero"),
    method: z.enum(PAYMENT_METHODS),
    reference: text(200),
    date,
  })
  .refine((s) => s.date <= today(), "Payment date cannot be in the future");
const returnLineSchema = z.object({
  line_index: z.coerce
    .number()
    .int("Select an invoice line")
    .min(0)
    .max(999),
  qty: qty.refine((v) => v > 0, "Quantity must be greater than zero"),
  condition: z
    .enum(["resellable", "damaged", "expired", "service"])
    .default("resellable"),
});
export const returnSchema = z.object({
  invoice_id: required(50),
  date,
  reason: z
    .string()
    .trim()
    .min(1, "A reason is required")
    .max(1000, "Use up to 1,000 characters"),
  notes: text(1000),
  lines: z
    .array(returnLineSchema)
    .min(1, "Select at least one item to return")
    .max(100),
});
const purchaseLine = z.object({
  product_id: required(50),
  qty: qty.refine((v) => v > 0, "Quantity must be greater than zero"),
  cost: amount,
  gst_rate: z.coerce.number().min(0).max(40),
  batch_no: text(100),
  expiry: optionalDate,
});
export const purchaseSchema = z.object({
  supplier_id: required(50),
  invoice_no: required(100),
  date,
  notes: text(1500),
  lines: z.array(purchaseLine).min(1).max(100),
  payment_amount: amount.default(0),
  payment_method: z.enum(PAYMENT_METHODS).default("Bank transfer"),
  payment_reference: text(200),
});
export function parse(schema, input) {
  const r = schema.safeParse(input);
  if (!r.success)
    fail(
      r.error.issues
        .map((e) => `${e.path.join(".") || "Details"}: ${e.message}`)
        .join("; "),
    );
  return r.data;
}
export function requireRow(table, key) {
  const row = db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(key);
  if (!row) fail("Record not found", 404);
  return row;
}
export const decodeInvoice = (row) => ({
  ...row,
  lines: JSON.parse(row.lines),
  clinic: JSON.parse(row.clinic),
  customer: JSON.parse(row.customer),
  pet: JSON.parse(row.pet),
});
export const getInvoice = (key) => decodeInvoice(requireRow("invoices", key));
export function paidFor(invoiceId) {
  return db
    .prepare(
      "SELECT COALESCE(SUM(CASE WHEN direction='receipt' THEN amount ELSE -amount END),0) AS n FROM payments WHERE invoice_id=?",
    )
    .get(invoiceId).n;
}
export function purchasePaid(key) {
  return db
    .prepare(
      "SELECT COALESCE(SUM(amount),0) AS n FROM payments WHERE purchase_id=?",
    )
    .get(key).n;
}
export function returnedQtyFor(invoiceId, lineIndex) {
  return quantity(
    db
      .prepare(
        "SELECT COALESCE(SUM(qty),0) AS n FROM return_lines WHERE invoice_id=? AND line_index=?",
      )
      .get(invoiceId, lineIndex).n,
  );
}
export function returnedTotalFor(invoiceId) {
  return db
    .prepare(
      "SELECT COALESCE(SUM(total),0) AS n FROM returns WHERE invoice_id=?",
    )
    .get(invoiceId).n;
}
// Refunds are recorded at invoice level. A return only creates a refundable
// amount once the customer has actually paid more than the net value of the
// goods they kept.
export function refundDueFor(inv) {
  const paid = paidFor(inv.id);
  if (inv.status === "credited") return Math.max(0, paid);
  if (inv.status !== "issued") return 0;
  const net = inv.total - returnedTotalFor(inv.id);
  return Math.min(Math.max(0, paid), Math.max(0, paid - net));
}
export function movement(
  product_id,
  batch_id,
  type,
  qty,
  reference,
  note = "",
) {
  insert("movements", {
    id: id(),
    product_id,
    batch_id,
    type,
    qty,
    reference,
    note,
    created_at: now(),
  });
}
export function addBatch(
  product,
  qty,
  batch_no,
  expiry,
  cost,
  purchase_id = null,
  type = "opening",
  reference = "Opening stock",
  note = "",
) {
  const batch = {
    id: id(),
    product_id: product.id,
    batch_no,
    expiry,
    qty,
    cost_price: cost,
    purchase_id,
    created_at: now(),
  };
  insert("batches", batch);
  movement(product.id, batch.id, type, qty, reference, note);
  return batch;
}
export function saveProduct(raw, key) {
  const p = parse(productSchema, raw);
  const { opening_stock, batch_no, expiry, ...details } = p;
  details.sale_price = paise(p.sale_price);
  details.cost_price = paise(p.cost_price);
  details.active = p.active ? 1 : 0;
  if (key) {
    requireRow("products", key);
    update("products", key, details);
  } else {
    key = id();
    insert("products", { id: key, ...details, created_at: now() });
    if (opening_stock > 0)
      addBatch(
        { id: key },
        opening_stock,
        batch_no,
        expiry,
        details.cost_price,
      );
  }
  return key;
}
export function nextNumber(date, kind = "invoice") {
  const fy = fiscalYear(date),
    key = `${kind}:${fy}`,
    prefix =
      kind === "invoice"
        ? getMeta("settings").invoice_prefix
        : kind === "return"
          ? "RN"
          : "CN";
  db.prepare(
    "INSERT INTO counters(key,value) VALUES (?,1) ON CONFLICT(key) DO UPDATE SET value=value+1",
  ).run(key);
  const seq = db
    .prepare("SELECT value FROM counters WHERE key=?")
    .get(key).value;
  if (seq > 99999)
    fail("Invoice sequence limit reached for this financial year");
  return `${prefix}/${fy}/${String(seq).padStart(5, "0")}`;
}
export function recordPayment(
  invoice_id,
  purchase_id,
  p,
  direction = "receipt",
) {
  insert("payments", {
    id: id(),
    invoice_id,
    purchase_id,
    direction,
    amount: paise(p.amount),
    method: p.method,
    reference: p.reference || "",
    date: p.date,
    created_at: now(),
  });
}
export function saveInvoice(raw, key) {
  const data = parse(invoiceSchema, raw),
    clinic = getMeta("settings");
  let existing = null;
  if (key) {
    existing = getInvoice(key);
    if (existing.status !== "draft")
      fail(
        "Issued invoices are locked. Use a credit note to reverse an invoice.",
      );
  }
  if (data.action === "issue" && data.date > today())
    fail("An issued invoice cannot be future-dated");
  const customer = data.client_id ? requireRow("clients", data.client_id) : {};
  const pet = data.pet_id ? requireRow("pets", data.pet_id) : {};
  if (data.pet_id && pet.client_id !== data.client_id)
    fail("The selected pet does not belong to this client");
  if (customer.gstin && data.place_of_supply !== customer.state)
    fail(
      "For registered clients, place of supply must match their state for this billing workflow",
    );
  const sourceLines = data.lines.map((line) => {
    const p = requireRow("products", line.product_id);
    if (!p.active) fail(`${p.name} is archived`);
    return {
      ...line,
      name: p.name,
      hsn: p.hsn,
      unit: p.unit,
      type: p.type,
      tax_treatment: p.tax_treatment,
      gst_rate: p.gst_rate,
    };
  });
  const interstate = clinic.state !== data.place_of_supply;
  const totals = calculateTotals(sourceLines, {
    registered: clinic.gst_registered,
    interstate,
    inclusive: data.inclusive,
    roundOff: data.round_off,
  });
  if (
    !Number.isSafeInteger(totals.total) ||
    totals.total > 999999999999 ||
    totals.lines.some((l) => !Number.isSafeInteger(l.total))
  )
    fail("This invoice exceeds the supported monetary limit");
  const hasTaxable = sourceLines.some((l) => l.tax_treatment === "taxable"),
    hasExempt = sourceLines.some((l) => l.tax_treatment !== "taxable");
  if (clinic.gst_registered && customer.gstin && hasTaxable && hasExempt)
    fail(
      "For a GST-registered client, bill taxable items and exempt/nil/non-GST supplies separately.",
    );
  if (
    data.action === "issue" &&
    totals.total >= 5000000 &&
    (!customer.name || !customer.address)
  )
    fail(
      "Invoices of ₹50,000 or more require a named client and billing address",
    );
  if (
    data.action === "issue" &&
    clinic.gst_registered &&
    customer.gstin &&
    !customer.address
  )
    fail("A billing address is required for a GST-registered client");
  if (data.action === "issue" && paise(data.payment_amount) > totals.total)
    fail("Payment cannot exceed the invoice total");
  const document_type = !clinic.gst_registered
    ? "Invoice"
    : hasTaxable && hasExempt
      ? "Invoice-cum-Bill of Supply"
      : hasTaxable
        ? "Tax Invoice"
        : "Bill of Supply";
  const inv = {
    number: data.action === "issue" ? nextNumber(data.date) : null,
    date: data.date,
    due_date: data.due_date,
    client_id: data.client_id || null,
    pet_id: data.pet_id || null,
    status: data.action === "issue" ? "issued" : "draft",
    place_of_supply: data.place_of_supply,
    inclusive: data.inclusive ? 1 : 0,
    round_off: data.round_off ? 1 : 0,
    ...Object.fromEntries(
      Object.entries(totals).filter(([k]) => k !== "lines"),
    ),
    lines: JSON.stringify(totals.lines),
    notes: data.notes,
    terms: data.terms,
    clinic: JSON.stringify(clinic),
    customer: JSON.stringify(customer),
    pet: JSON.stringify(pet),
    document_type,
  };
  if (key) update("invoices", key, inv);
  else {
    key = id();
    insert("invoices", { id: key, ...inv, created_at: now() });
  }
  if (data.action === "issue") {
    totals.lines.forEach((line, index) => {
      if (line.type === "service") return;
      let left = line.qty;
      line.batches = [];
      const batches = db
        .prepare(
          "SELECT * FROM batches WHERE product_id=? AND qty>0 AND (expiry='' OR expiry>=?) ORDER BY CASE WHEN expiry='' THEN 1 ELSE 0 END,expiry,created_at,id",
        )
        .all(line.product_id, today());
      const available = quantity(batches.reduce((n, b) => n + b.qty, 0));
      if (available < left)
        fail(
          `Not enough usable stock for ${line.name}. Available: ${available} ${line.unit}. Expired batches cannot be sold.`,
        );
      for (const b of batches) {
        if (left <= 0) break;
        const used = Math.min(b.qty, left);
        update("batches", b.id, { qty: quantity(b.qty - used) });
        insert("allocations", {
          id: id(),
          invoice_id: key,
          product_id: line.product_id,
          batch_id: b.id,
          line_index: index,
          qty: used,
        });
        movement(line.product_id, b.id, "sale", -used, inv.number);
        line.batches.push({
          batch_no: b.batch_no,
          expiry: b.expiry,
          qty: used,
        });
        left = quantity(left - used);
      }
    });
    update("invoices", key, { lines: JSON.stringify(totals.lines) });
    if (data.payment_amount > 0)
      recordPayment(key, null, {
        amount: data.payment_amount,
        method: data.payment_method,
        reference: data.payment_reference,
        date: data.date,
      });
  }
  return key;
}
export function saveReturn(raw) {
  const data = parse(returnSchema, raw),
    inv = getInvoice(data.invoice_id);
  if (inv.status === "draft")
    fail("Only an issued invoice can have items returned");
  if (inv.status === "credited")
    fail("This invoice has already been credited in full");
  if (data.date < inv.date)
    fail("Return date cannot precede the invoice date");
  if (data.date > today()) fail("Return date cannot be in the future");
  const seen = new Set();
  const prepared = data.lines.map((entry) => {
    if (seen.has(entry.line_index))
      fail("Each invoice line can appear only once in a return");
    seen.add(entry.line_index);
    const line = inv.lines[entry.line_index];
    if (!line) fail("The selected invoice line no longer exists");
    const returned = returnedQtyFor(inv.id, entry.line_index);
    const remaining = quantity(line.qty - returned);
    if (remaining <= 0) fail(`${line.name} has already been fully returned`);
    if (entry.qty > remaining + 0.0000001)
      fail(
        `Only ${remaining} ${line.unit} of ${line.name} can still be returned`,
      );
    return {
      line_index: entry.line_index,
      condition: line.type === "service" ? "service" : entry.condition,
      line,
      name: line.name,
      hsn: line.hsn,
      unit: line.unit,
      type: line.type,
      tax_treatment: line.tax_treatment,
      gst_rate: line.gst_rate,
      rate: line.rate,
      discount: line.discount || 0,
      ...returnLineAmounts(line, returned, entry.qty),
    };
  });
  const totals = {
    subtotal: 0,
    discount: 0,
    taxable: 0,
    cgst: 0,
    sgst: 0,
    igst: 0,
    tax: 0,
    total: 0,
  };
  for (const line of prepared) {
    totals.subtotal += line.gross;
    totals.discount += line.discount_amount;
    totals.taxable += line.taxable;
    totals.cgst += line.cgst;
    totals.sgst += line.sgst;
    totals.igst += line.igst;
    totals.tax += line.tax;
    totals.total += line.total;
  }
  // If this return completes every remaining line, reverse the invoice's
  // rupee round-off too. Otherwise the invoice's rounding stays outside the
  // returned value until the final return.
  const completesInvoice = inv.lines.every((line, index) => {
    const already = returnedQtyFor(inv.id, index);
    const inThisReturn = prepared
      .filter((entry) => entry.line_index === index)
      .reduce((n, entry) => n + entry.qty, 0);
    return quantity(already + inThisReturn) >= quantity(line.qty) - 0.0000001;
  });
  const previousRounding = db
    .prepare(
      "SELECT COALESCE(SUM(rounding),0) AS n FROM returns WHERE invoice_id=?",
    )
    .get(inv.id).n;
  const rounding = completesInvoice ? inv.rounding - previousRounding : 0;
  const total = totals.total + rounding;
  if (!Number.isSafeInteger(total) || total < 0 || total > 999999999999)
    fail("This return value exceeds the supported monetary limit");
  const netAfter = inv.total - returnedTotalFor(inv.id) - total;
  const paidNow = paidFor(inv.id);
  const ret = {
    id: id(),
    number: nextNumber(data.date, "return"),
    invoice_id: inv.id,
    date: data.date,
    reason: data.reason,
    notes: data.notes,
    ...totals,
    rounding,
    total,
    refund_due: Math.min(Math.max(0, paidNow), Math.max(0, paidNow - netAfter)),
    created_at: now(),
  };
  insert("returns", ret);
  for (const line of prepared) {
    insert("return_lines", {
      id: id(),
      return_id: ret.id,
      invoice_id: inv.id,
      line_index: line.line_index,
      product_id: line.line.product_id,
      name: line.name,
      hsn: line.hsn,
      unit: line.unit,
      type: line.type,
      tax_treatment: line.tax_treatment,
      gst_rate: line.gst_rate,
      qty: line.qty,
      rate: line.rate,
      discount: line.discount,
      gross: line.gross,
      discount_amount: line.discount_amount,
      taxable: line.taxable,
      cgst: line.cgst,
      sgst: line.sgst,
      igst: line.igst,
      tax: line.tax,
      total: line.total,
      condition: line.condition,
      created_at: now(),
    });
    if (line.type === "service" || line.condition !== "resellable") continue;
    // Goods that can be resold go back to the exact batches they were sold
    // from. Damaged/expired goods are recorded but never re-enter stock.
    let left = line.qty;
    const allocations = db
      .prepare(
        "SELECT * FROM allocations WHERE invoice_id=? AND line_index=? ORDER BY rowid",
      )
      .all(inv.id, line.line_index);
    for (const allocation of allocations) {
      if (left <= 0) break;
      const restored = quantity(
        db
          .prepare(
            "SELECT COALESCE(SUM(qty),0) AS n FROM return_allocations WHERE allocation_id=?",
          )
          .get(allocation.id).n,
      );
      const available = quantity(allocation.qty - restored);
      if (available <= 0) continue;
      const used = Math.min(available, left);
      const batch = requireRow("batches", allocation.batch_id);
      update("batches", batch.id, { qty: quantity(batch.qty + used) });
      insert("return_allocations", {
        id: id(),
        return_id: ret.id,
        allocation_id: allocation.id,
        product_id: allocation.product_id,
        batch_id: allocation.batch_id,
        qty: used,
      });
      movement(
        allocation.product_id,
        allocation.batch_id,
        "return",
        used,
        ret.number,
        data.reason,
      );
      left = quantity(left - used);
    }
    if (left > 0)
      fail(
        `Stock could not be restored for ${line.name}. Its original batch allocation is incomplete.`,
      );
  }
  return ret.id;
}
export function creditInvoice(key, reason, date) {
  const inv = getInvoice(key);
  if (inv.status !== "issued")
    fail("Only an issued, uncredited invoice can be credited");
  if (
    db.prepare("SELECT id FROM returns WHERE invoice_id=? LIMIT 1").get(key)
  )
    fail(
      "This invoice has recorded returns. Return any remaining items instead of issuing a full credit note.",
    );
  if (!reason?.trim() || reason.trim().length > 1000)
    fail("A reason (up to 1,000 characters) is required");
  if (
    typeof date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    Number.isNaN(Date.parse(date)) ||
    new Date(date).toISOString().slice(0, 10) !== date ||
    date < inv.date ||
    date > today()
  )
    fail("Credit note date must be between the invoice date and today");
  const credit = {
    id: id(),
    number: nextNumber(date, "credit"),
    invoice_id: key,
    date,
    reason: reason.trim(),
    total: inv.total,
    created_at: now(),
  };
  insert("credits", credit);
  for (const a of db
    .prepare("SELECT * FROM allocations WHERE invoice_id=?")
    .all(key)) {
    const b = requireRow("batches", a.batch_id);
    update("batches", b.id, { qty: quantity(b.qty + a.qty) });
    movement(a.product_id, b.id, "return", a.qty, credit.number, reason);
  }
  update("invoices", key, { status: "credited" });
  return credit;
}
export function savePurchase(raw) {
  const data = parse(purchaseSchema, raw);
  requireRow("suppliers", data.supplier_id);
  if (data.date > today()) fail("Purchase date cannot be in the future");
  if (
    db
      .prepare("SELECT id FROM purchases WHERE supplier_id=? AND invoice_no=?")
      .get(data.supplier_id, data.invoice_no)
  )
    fail("This supplier invoice has already been recorded");
  let subtotal = 0,
    tax = 0;
  const lines = data.lines.map((line) => {
    const p = requireRow("products", line.product_id);
    if (p.type === "service" || !p.active)
      fail("Only active inventory products can be received");
    if (
      ["Medicines", "Vaccines"].includes(p.category) &&
      (!line.batch_no || !line.expiry)
    )
      fail(`${p.name}: batch and expiry are required`);
    if (line.expiry && line.expiry < today())
      fail(`${p.name}: expired stock cannot be received`);
    const cost = paise(line.cost),
      base = Math.round(cost * line.qty),
      gst = Math.round((base * line.gst_rate) / 100);
    subtotal += base;
    tax += gst;
    return {
      ...line,
      name: p.name,
      hsn: p.hsn,
      cost,
      subtotal: base,
      tax: gst,
      total: base + gst,
    };
  });
  const total = subtotal + tax;
  if (!Number.isSafeInteger(total) || total > 999999999999)
    fail("This purchase exceeds the supported monetary limit");
  if (paise(data.payment_amount) > total)
    fail("Payment cannot exceed the purchase total");
  const key = id();
  insert("purchases", {
    id: key,
    supplier_id: data.supplier_id,
    invoice_no: data.invoice_no,
    date: data.date,
    notes: data.notes,
    lines: JSON.stringify(lines),
    subtotal,
    tax,
    total,
    created_at: now(),
  });
  for (const l of lines) {
    addBatch(
      { id: l.product_id },
      l.qty,
      l.batch_no,
      l.expiry,
      l.cost,
      key,
      "purchase",
      data.invoice_no,
    );
    update("products", l.product_id, { cost_price: l.cost });
  }
  if (data.payment_amount > 0)
    recordPayment(
      null,
      key,
      {
        amount: data.payment_amount,
        method: data.payment_method,
        reference: data.payment_reference,
        date: data.date,
      },
      "supplier_payment",
    );
  return key;
}
export function buildState() {
  const storedSettings = getMeta("settings");
  const settings = storedSettings
    ? { ...PRINT_DEFAULTS, ...storedSettings }
    : null;
  const batches = db
    .prepare("SELECT * FROM batches ORDER BY expiry,created_at")
    .all();
  const products = db
    .prepare("SELECT * FROM products ORDER BY created_at DESC")
    .all()
    .map((p) => {
      const bs = batches.filter((b) => b.product_id === p.id);
      return {
        ...p,
        active: !!p.active,
        stock: quantity(bs.reduce((n, b) => n + b.qty, 0)),
        available: quantity(
          bs
            .filter((b) => !b.expiry || b.expiry >= today())
            .reduce((n, b) => n + b.qty, 0),
        ),
        stock_value: Math.round(
          bs.reduce((n, b) => n + b.qty * b.cost_price, 0),
        ),
      };
    });
  const payments = db
    .prepare("SELECT * FROM payments ORDER BY date DESC,created_at DESC")
    .all();
  const credits = db
    .prepare("SELECT * FROM credits ORDER BY created_at DESC")
    .all();
  const returnLines = db
    .prepare("SELECT * FROM return_lines ORDER BY rowid")
    .all();
  const returnAllocations = db.prepare("SELECT * FROM return_allocations").all();
  const returns = db
    .prepare("SELECT * FROM returns ORDER BY created_at DESC,rowid DESC")
    .all()
    .map((ret) => ({
      ...ret,
      lines: returnLines.filter((line) => line.return_id === ret.id),
      restocked_qty: quantity(
        returnAllocations
          .filter((allocation) => allocation.return_id === ret.id)
          .reduce((n, allocation) => n + allocation.qty, 0),
      ),
    }));
  const invoices = db
    .prepare("SELECT * FROM invoices ORDER BY created_at DESC")
    .all()
    .map(decodeInvoice)
    .map((inv) => {
      const paid = payments
        .filter((p) => p.invoice_id === inv.id)
        .reduce(
          (n, p) => n + (p.direction === "receipt" ? p.amount : -p.amount),
          0,
        );
      const invoiceReturns = returns.filter(
        (ret) => ret.invoice_id === inv.id,
      );
      const returnedByLine = {};
      for (const line of returnLines)
        if (line.invoice_id === inv.id)
          returnedByLine[line.line_index] = quantity(
            (returnedByLine[line.line_index] || 0) + line.qty,
          );
      const returnedTotal = invoiceReturns.reduce(
          (n, ret) => n + ret.total,
          0,
        ),
        returnedQty = quantity(
          invoiceReturns.reduce(
            (n, ret) =>
              n +
              ret.lines.reduce((sum, line) => sum + Number(line.qty || 0), 0),
            0,
          ),
        ),
        fullyReturned =
          inv.status !== "draft" &&
          inv.lines.every(
            (line, index) =>
              quantity(returnedByLine[index] || 0) >=
              quantity(line.qty) - 0.0005,
          );
      const netTotal = inv.total - returnedTotal;
      return {
        ...inv,
        paid,
        balance:
          inv.status === "issued" ? Math.max(0, netTotal - paid) : 0,
        refund_due:
          inv.status === "credited"
            ? Math.max(0, paid)
            : inv.status === "issued"
              ? Math.min(Math.max(0, paid), Math.max(0, paid - netTotal))
              : 0,
        credit: credits.find((c) => c.invoice_id === inv.id) || null,
        returned_total: returnedTotal,
        returned_qty: returnedQty,
        returned_count: invoiceReturns.length,
        fully_returned: fullyReturned,
        returned_by_line: returnedByLine,
        returns: invoiceReturns.map((ret) => ({
          id: ret.id,
          number: ret.number,
          date: ret.date,
          total: ret.total,
          reason: ret.reason,
          restocked_qty: ret.restocked_qty,
        })),
      };
    });
  const invoiceById = new Map(invoices.map((inv) => [inv.id, inv]));
  for (const ret of returns) {
    const inv = invoiceById.get(ret.invoice_id);
    ret.invoice_number = inv?.number || "";
    ret.invoice_date = inv?.date || "";
    ret.invoice_total = inv?.total || 0;
    ret.client_name = inv?.customer.name || "";
    ret.pet_name = inv?.pet.name || "";
    ret.invoice_refund_due = inv?.refund_due || 0;
    ret.fully_returned = inv?.fully_returned || false;
  }
  const purchases = db
    .prepare("SELECT * FROM purchases ORDER BY created_at DESC")
    .all()
    .map((p) => ({
      ...p,
      lines: JSON.parse(p.lines),
      paid: payments
        .filter((x) => x.purchase_id === p.id)
        .reduce((n, x) => n + x.amount, 0),
    }));
  return {
    settings,
    products,
    batches,
    clients: db.prepare("SELECT * FROM clients ORDER BY created_at DESC").all(),
    pets: db.prepare("SELECT * FROM pets ORDER BY name").all(),
    suppliers: db.prepare("SELECT * FROM suppliers ORDER BY name").all(),
    invoices,
    purchases,
    payments,
    credits,
    returns,
    movements: db
      .prepare(
        "SELECT * FROM movements ORDER BY created_at DESC,rowid DESC LIMIT 500",
      )
      .all(),
    server_date: today(),
  };
}
