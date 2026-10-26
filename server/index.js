import express from "express";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import {
  randomBytes,
  createHash,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { db, getMeta, setMeta, all, insert, update } from "./db.js";
import {
  id,
  now,
  fail,
  parse,
  requireRow,
  settingsSchema,
  productSchema,
  clientSchema,
  petSchema,
  supplierSchema,
  paymentSchema,
  saveProduct,
  saveInvoice,
  savePurchase,
  creditInvoice,
  recordPayment,
  getInvoice,
  paidFor,
  purchasePaid,
  addBatch,
  movement,
  buildState,
} from "./domain.js";
import { invoicePDF, thermalPDF } from "./pdf.js";
import { printPreferences, INVOICE_TEMPLATES } from "../printing.js";
import { today, paise, quantity, HSN_CODES } from "../shared.js";
// A portable production launcher: works on Windows, macOS, and Linux.
if (process.argv.includes("--production")) process.env.NODE_ENV = "production";
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const tokenHash = (t) => createHash("sha256").update(t).digest("hex");
const passwordHash = (p) => {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(p, salt, 64).toString("hex")}`;
};
const passwordMatches = (p, stored) => {
  try {
    const [salt, hash] = stored.split(":");
    return timingSafeEqual(scryptSync(p, salt, 64), Buffer.from(hash, "hex"));
  } catch {
    return false;
  }
};
const rawToken = (req) =>
  req.headers.authorization?.replace(/^Bearer /, "") ||
  req.headers.cookie
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith("shopdesk_session="))
    ?.slice(17) ||
  "";
const authenticated = (req) => {
  const t = rawToken(req);
  return (
    t &&
    db
      .prepare("SELECT token FROM sessions WHERE token=? AND expires>?")
      .get(tokenHash(t), Date.now())
  );
};
function session(req, res) {
  const token = randomBytes(32).toString("hex");
  db.prepare("DELETE FROM sessions WHERE expires<?").run(Date.now());
  insert("sessions", {
    token: tokenHash(token),
    expires: Date.now() + 12 * 60 * 60 * 1000,
  });
  res.cookie("shopdesk_session", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: req.secure,
    maxAge: 12 * 60 * 60 * 1000,
    path: "/",
  });
  return token;
}
function checkPassword(p) {
  if (typeof p !== "string" || p.length < 8 || p.length > 128)
    fail("Use an owner password of 8–128 characters");
}
const BACKUP_TABLES = [
  "products",
  "clients",
  "pets",
  "suppliers",
  "purchases",
  "batches",
  "invoices",
  "allocations",
  "credits",
  "payments",
  "movements",
  "counters",
];
const DELETE_ORDER = [
  "payments",
  "credits",
  "allocations",
  "movements",
  "batches",
  "invoices",
  "purchases",
  "pets",
  "clients",
  "products",
  "suppliers",
  "counters",
];
function csv(rows) {
  return (
    "\uFEFF" +
    rows
      .map((row) =>
        row
          .map((v) => {
            let s = String(v ?? "");
            if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
            return '"' + s.replaceAll('"', '""') + '"';
          })
          .join(","),
      )
      .join("\r\n")
  );
}
export async function createApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    if (req.path.startsWith("/api/"))
      res.setHeader("Cache-Control", "no-store");
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.headers["sec-fetch-site"] === "cross-site"
    )
      return res
        .status(403)
        .json({ error: "Cross-site requests are not permitted" });
    next();
  });
  app.use(express.json({ limit: "24mb" }));
  app.use((req, res, next) => {
    const p = decodeURIComponent(req.path);
    if (
      /^\/(data|server|tests|qa)(\/|$)/.test(p) ||
      /\.sqlite(?:-shm|-wal)?$/i.test(p)
    )
      return res.status(404).send("Not found");
    next();
  });
  app.get("/api/status", (req, res) =>
    res.json({
      ready: !!getMeta("auth"),
      authenticated: !!authenticated(req),
      clinic_name: getMeta("settings")?.name || null,
    }),
  );
  app.get("/api/hsn", (req, res) => res.json(HSN_CODES));
  app.post("/api/setup", (req, res, next) => {
    try {
      if (getMeta("auth"))
        fail("This clinic is already set up. Please sign in.", 409);
      const settings = parse(settingsSchema, req.body.settings);
      checkPassword(req.body.password);
      db.transaction(() => {
        setMeta("settings", settings);
        setMeta("auth", passwordHash(req.body.password));
      })();
      res.json({ token: session(req, res) });
    } catch (e) {
      next(e);
    }
  });
  const attempts = new Map();
  app.post("/api/login", (req, res, next) => {
    try {
      const ip = req.ip,
        old = attempts.get(ip),
        a =
          old && old.until > Date.now()
            ? old
            : { count: 0, until: Date.now() + 15 * 60 * 1000 };
      if (a.count >= 10)
        fail("Too many sign-in attempts. Please try again in 15 minutes.", 429);
      if (!getMeta("auth")) fail("Set up your clinic first", 409);
      if (
        typeof req.body.password !== "string" ||
        req.body.password.length > 128 ||
        !passwordMatches(req.body.password, getMeta("auth"))
      ) {
        a.count++;
        attempts.set(ip, a);
        fail("That password isn’t correct. Please try again.", 401);
      }
      attempts.delete(ip);
      res.json({ token: session(req, res) });
    } catch (e) {
      next(e);
    }
  });
  app.post("/api/logout", (req, res) => {
    db.prepare("DELETE FROM sessions WHERE token=?").run(
      tokenHash(rawToken(req)),
    );
    res.clearCookie("shopdesk_session", { path: "/" });
    res.json({ ok: true });
  });
  app.use("/api", (req, res, next) => {
    if (!getMeta("auth")) {
      if (req.path === "/state" && req.method === "GET")
        return res.json({ ...buildState(), backup_at: null });
      return res.status(409).json({
        error: "Set up your clinic to start using shop desk",
        setup_required: true,
      });
    }
    if (!authenticated(req))
      return res
        .status(401)
        .json({ error: "Please sign in to your clinic workspace" });
    next();
  });
  app.get("/api/state", (req, res) =>
    res.json({ ...buildState(), backup_at: getMeta("backup_at") }),
  );
  app.put("/api/settings", (req, res, next) => {
    try {
      const s = parse(settingsSchema, req.body);
      setMeta("settings", s);
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });
  app.put("/api/password", (req, res, next) => {
    try {
      if (!passwordMatches(req.body.current_password || "", getMeta("auth")))
        fail("The current password is incorrect", 401);
      checkPassword(req.body.password);
      db.transaction(() => {
        setMeta("auth", passwordHash(req.body.password));
        db.prepare("DELETE FROM sessions").run();
      })();
      res.json({ token: session(req, res) });
    } catch (e) {
      next(e);
    }
  });
  app.post("/api/products", (req, res, next) => {
    try {
      res.json({ id: db.transaction(() => saveProduct(req.body))() });
    } catch (e) {
      next(e);
    }
  });
  app.put("/api/products/:id", (req, res, next) => {
    try {
      const old = requireRow("products", req.params.id);
      if (
        old.type !== req.body.type &&
        db
          .prepare("SELECT id FROM batches WHERE product_id=? LIMIT 1")
          .get(old.id)
      )
        fail(
          "An item with stock history cannot change between product and service. Archive it and add a new item instead.",
        );
      res.json({
        id: db.transaction(() => saveProduct(req.body, req.params.id))(),
      });
    } catch (e) {
      next(e);
    }
  });
  app.post("/api/products/import", (req, res, next) => {
    try {
      if (
        !Array.isArray(req.body.rows) ||
        !req.body.rows.length ||
        req.body.rows.length > 2000
      )
        fail("Import between 1 and 2,000 rows at a time");
      const ids = db.transaction(() =>
        req.body.rows.map((r, index) => {
          try {
            return saveProduct(r);
          } catch (e) {
            e.message = `Row ${index + 2}: ${e.message}`;
            throw e;
          }
        }),
      )();
      res.json({ count: ids.length });
    } catch (e) {
      next(e);
    }
  });
  app.post("/api/products/:id/adjust", (req, res, next) => {
    try {
      db.transaction(() => {
        const p = requireRow("products", req.params.id),
          d = req.body;
        if (p.type !== "product") fail("Services do not carry stock");
        const q = quantity(d.qty);
        if (
          !Number.isFinite(Number(d.qty)) ||
          !q ||
          Math.abs(q) > 1000000 ||
          Math.abs(Number(d.qty) - q) > 0.0000001
        )
          fail("Enter a nonzero quantity, with at most 3 decimal places");
        const reason = String(d.reason || "").trim();
        if (!reason || reason.length > 500)
          fail(
            "A reason (up to 500 characters) is required for every adjustment",
          );
        if (d.batch_id) {
          const b = requireRow("batches", d.batch_id);
          if (b.product_id !== p.id)
            fail("This batch belongs to another product");
          if (quantity(b.qty + q) < 0)
            fail("The selected batch does not have enough stock");
          if (q > 0 && b.expiry && b.expiry < today())
            fail("Cannot add stock to an expired batch");
          update("batches", b.id, { qty: quantity(b.qty + q) });
          movement(p.id, b.id, "adjustment", q, "Stock adjustment", reason);
        } else {
          if (q < 0) fail("Select a batch when removing stock");
          const batch_no = String(d.batch_no || "")
              .trim()
              .slice(0, 100),
            expiry = d.expiry || "";
          if (
            ["Medicines", "Vaccines"].includes(p.category) &&
            (!batch_no || !expiry)
          )
            fail("Batch number and expiry are required");
          if (
            expiry &&
            (!/^\d{4}-\d{2}-\d{2}$/.test(expiry) ||
              new Date(expiry).toISOString().slice(0, 10) !== expiry ||
              expiry < today())
          )
            fail("Use a valid, non-expired date");
          const cost = Number(d.cost);
          if (!Number.isFinite(cost) || cost < 0 || cost > 100000000)
            fail("Enter a valid cost price");
          addBatch(
            p,
            q,
            batch_no,
            expiry,
            paise(cost),
            null,
            "adjustment",
            "Stock adjustment",
            reason,
          );
        }
      })();
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });
  for (const [route, table, schema] of [
    ["clients", "clients", clientSchema],
    ["suppliers", "suppliers", supplierSchema],
  ]) {
    app.post(`/api/${route}`, (req, res, next) => {
      try {
        const d = parse(schema, req.body),
          key = id();
        insert(table, { id: key, ...d, created_at: now() });
        res.json({ id: key });
      } catch (e) {
        next(e);
      }
    });
    app.put(`/api/${route}/:id`, (req, res, next) => {
      try {
        requireRow(table, req.params.id);
        update(table, req.params.id, parse(schema, req.body));
        res.json({ ok: true });
      } catch (e) {
        next(e);
      }
    });
  }
  app.post("/api/pets", (req, res, next) => {
    try {
      const d = parse(petSchema, req.body);
      requireRow("clients", d.client_id);
      const key = id();
      insert("pets", { id: key, ...d });
      res.json({ id: key });
    } catch (e) {
      next(e);
    }
  });
  app.put("/api/pets/:id", (req, res, next) => {
    try {
      requireRow("pets", req.params.id);
      const d = parse(petSchema, req.body);
      requireRow("clients", d.client_id);
      const old = requireRow("pets", req.params.id);
      if (old.client_id !== d.client_id)
        fail("A pet cannot be reassigned to another client");
      update("pets", req.params.id, d);
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });
  app.post("/api/invoices", (req, res, next) => {
    try {
      res.json({ id: db.transaction(() => saveInvoice(req.body))() });
    } catch (e) {
      next(e);
    }
  });
  app.put("/api/invoices/:id", (req, res, next) => {
    try {
      res.json({
        id: db.transaction(() => saveInvoice(req.body, req.params.id))(),
      });
    } catch (e) {
      next(e);
    }
  });
  app.delete("/api/invoices/:id", (req, res, next) => {
    try {
      const inv = getInvoice(req.params.id);
      if (inv.status !== "draft") fail("Only drafts can be deleted");
      db.prepare("DELETE FROM invoices WHERE id=?").run(inv.id);
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });
  app.post("/api/invoices/:id/payment", (req, res, next) => {
    try {
      db.transaction(() => {
        const inv = getInvoice(req.params.id),
          p = parse(paymentSchema, req.body);
        if (inv.status !== "issued")
          fail("Payments can only be recorded against issued invoices");
        if (p.date < inv.date)
          fail("Payment date cannot precede the invoice date");
        if (paise(p.amount) > inv.total - paidFor(inv.id))
          fail("Payment exceeds the outstanding balance");
        recordPayment(inv.id, null, p);
      })();
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });
  app.post("/api/invoices/:id/credit", (req, res, next) => {
    try {
      res.json(
        db.transaction(() =>
          creditInvoice(req.params.id, req.body.reason, req.body.date),
        )(),
      );
    } catch (e) {
      next(e);
    }
  });
  app.post("/api/invoices/:id/refund", (req, res, next) => {
    try {
      db.transaction(() => {
        const inv = getInvoice(req.params.id),
          p = parse(paymentSchema, req.body),
          credit = db
            .prepare("SELECT * FROM credits WHERE invoice_id=?")
            .get(inv.id);
        if (inv.status !== "credited")
          fail("Create a credit note before recording a refund");
        if (p.date < credit.date)
          fail("Refund date cannot precede the credit note date");
        if (paise(p.amount) > paidFor(inv.id))
          fail("Refund exceeds the refundable amount");
        recordPayment(inv.id, null, p, "refund");
      })();
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });
  app.get("/api/invoices/:id/pdf", async (req, res, next) => {
    try {
      const state = buildState(),
        inv = state.invoices.find((i) => i.id === req.params.id);
      if (!inv) fail("Invoice not found", 404);
      const credit = req.query.credit === "1" ? inv.credit : null;
      if (req.query.credit === "1" && !credit)
        fail("Credit note not found", 404);
      const preferences = printPreferences(state.settings);
      const format = req.query.format ?? "a4";
      const width = req.query.width ?? preferences.thermal_width;
      const template = req.query.template ?? preferences.invoice_template;
      if (!["a4", "thermal"].includes(format))
        fail("Choose A4 or thermal output");
      if (!["58", "80"].includes(width))
        fail("Thermal paper must be 58 or 80 mm");
      if (!INVOICE_TEMPLATES.some((choice) => choice.id === template))
        fail("Unknown invoice template");
      res.type("application/pdf");
      const suffix = format === "thermal" ? `-thermal-${width}mm` : "";
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${(credit?.number || inv.number || "draft").replaceAll("/", "-")}${suffix}.pdf"`,
      );
      const options = {
        settings: state.settings,
        template,
        width,
        payments: state.payments,
      };
      if (format === "thermal") await thermalPDF(res, inv, credit, options);
      else await invoicePDF(res, inv, credit, options);
    } catch (e) {
      if (!res.headersSent) next(e);
      else res.end();
    }
  });
  app.post("/api/purchases", (req, res, next) => {
    try {
      res.json({ id: db.transaction(() => savePurchase(req.body))() });
    } catch (e) {
      next(e);
    }
  });
  app.post("/api/purchases/:id/payment", (req, res, next) => {
    try {
      db.transaction(() => {
        const pur = requireRow("purchases", req.params.id),
          p = parse(paymentSchema, req.body);
        if (p.date < pur.date)
          fail("Payment date cannot precede the purchase date");
        if (paise(p.amount) > pur.total - purchasePaid(pur.id))
          fail("Payment exceeds the amount payable");
        recordPayment(null, pur.id, p, "supplier_payment");
      })();
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });
  app.get("/api/backup", (req, res) => {
    setMeta("backup_at", now());
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="shop-desk-backup-${today()}.json"`,
    );
    res.json({
      format: "shop-desk-backup",
      version: 1,
      exported_at: now(),
      settings: getMeta("settings"),
      tables: Object.fromEntries(BACKUP_TABLES.map((t) => [t, all(t)])),
    });
  });
  app.post("/api/restore", (req, res, next) => {
    try {
      if (!passwordMatches(req.body.password || "", getMeta("auth")))
        fail("Enter the current owner password to restore a backup", 401);
      const backup = req.body.backup;
      if (
        !backup ||
        backup.format !== "shop-desk-backup" ||
        backup.version !== 1 ||
        !backup.tables
      )
        fail("This is not a supported shop desk backup");
      const settings = parse(settingsSchema, backup.settings);
      for (const table of BACKUP_TABLES) {
        if (
          !Array.isArray(backup.tables[table]) ||
          backup.tables[table].length > 100000
        )
          fail(`Invalid backup table: ${table}`);
        const keys = db
          .prepare(`PRAGMA table_info(${table})`)
          .all()
          .map((c) => c.name);
        for (const row of backup.tables[table]) {
          if (
            !row ||
            Object.keys(row).length !== keys.length ||
            keys.some((k) => !Object.hasOwn(row, k))
          )
            fail(`Invalid record in ${table}`);
        }
      }
      for (const p of backup.tables.products)
        parse(productSchema, {
          ...p,
          active: !!p.active,
          sale_price: p.sale_price / 100,
          cost_price: p.cost_price / 100,
        });
      for (const c of backup.tables.clients) parse(clientSchema, c);
      for (const s of backup.tables.suppliers) parse(supplierSchema, s);
      for (const p of backup.tables.pets) parse(petSchema, p);
      for (const inv of backup.tables.invoices) {
        if (
          !Array.isArray(JSON.parse(inv.lines)) ||
          !["draft", "issued", "credited"].includes(inv.status) ||
          inv.total < 0
        )
          fail("Invalid invoice in backup");
        for (const f of ["clinic", "customer", "pet"]) {
          const obj = JSON.parse(inv[f]);
          if (!obj || typeof obj !== "object")
            fail("Invalid document snapshot");
        }
      }
      db.transaction(() => {
        for (const t of DELETE_ORDER) db.prepare(`DELETE FROM ${t}`).run();
        for (const t of BACKUP_TABLES)
          for (const row of backup.tables[t]) insert(t, row);
        setMeta("settings", settings);
        setMeta("backup_at", backup.exported_at || null);
        const check = db.pragma("foreign_key_check");
        if (check.length) fail("Backup contains broken record references");
      })();
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });
  app.get("/api/export/:type", (req, res, next) => {
    try {
      const state = buildState();
      let rows;
      if (req.params.type === "template")
        rows = [
          [
            "name",
            "type",
            "category",
            "hsn",
            "unit",
            "sale_price",
            "cost_price",
            "gst_rate",
            "tax_treatment",
            "sku",
            "barcode",
            "low_stock",
            "opening_stock",
            "batch_no",
            "expiry",
          ],
        ];
      else if (req.params.type === "inventory")
        rows = [
          [
            "Name",
            "Type",
            "SKU",
            "Barcode",
            "Category",
            "HSN/SAC",
            "Unit",
            "Selling price excl GST",
            "GST rate",
            "Tax treatment",
            "Stock",
            "Usable stock",
            "Stock value",
            "Active",
          ],
          ...state.products.map((p) => [
            p.name,
            p.type,
            p.sku,
            p.barcode,
            p.category,
            p.hsn,
            p.unit,
            p.sale_price / 100,
            p.gst_rate,
            p.tax_treatment,
            p.stock,
            p.available,
            p.stock_value / 100,
            p.active ? "Yes" : "No",
          ]),
        ];
      else if (req.params.type === "invoices")
        rows = [
          [
            "Invoice number",
            "Date",
            "Client",
            "Patient",
            "Status",
            "Document type",
            "Supply value",
            "CGST",
            "SGST/UTGST",
            "IGST",
            "Total",
            "Net received",
            "Outstanding",
            "Refund due",
            "Credit note",
          ],
          ...state.invoices.map((i) => [
            i.number || "Draft",
            i.date,
            i.customer.name || "Walk-in",
            i.pet.name,
            i.status,
            i.document_type,
            i.taxable / 100,
            i.cgst / 100,
            i.sgst / 100,
            i.igst / 100,
            i.total / 100,
            i.paid / 100,
            i.balance / 100,
            i.refund_due / 100,
            i.credit?.number,
          ]),
        ];
      else if (req.params.type === "clients")
        rows = [
          [
            "Client",
            "Phone",
            "Email",
            "Address",
            "State code",
            "GSTIN",
            "Pets",
          ],
          ...state.clients.map((c) => [
            c.name,
            c.phone,
            c.email,
            c.address,
            c.state,
            c.gstin,
            state.pets
              .filter((p) => p.client_id === c.id)
              .map((p) => p.name)
              .join("; "),
          ]),
        ];
      else if (req.params.type === "payments")
        rows = [
          [
            "Date",
            "Direction",
            "Invoice",
            "Purchase",
            "Amount",
            "Method",
            "Reference",
          ],
          ...state.payments.map((p) => [
            p.date,
            p.direction,
            state.invoices.find((i) => i.id === p.invoice_id)?.number,
            state.purchases.find((i) => i.id === p.purchase_id)?.invoice_no,
            p.amount / 100,
            p.method,
            p.reference,
          ]),
        ];
      else fail("Export not found", 404);
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="shop-desk-${req.params.type}-${today()}.csv"`,
      );
      res.type("text/csv").send(csv(rows));
    } catch (e) {
      next(e);
    }
  });
  app.use("/api", (req, res) =>
    res.status(404).json({ error: "Endpoint not found" }),
  );
  if (process.env.NODE_ENV === "production") {
    app.use(express.static(path.join(root, "dist")));
    app.get("/{*any}", (req, res) =>
      res.sendFile(path.join(root, "dist", "index.html")),
    );
  } else if (process.env.NODE_ENV !== "test") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      root,
      server: { middlewareMode: true, allowedHosts: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    let message = err.message || "Something went wrong";
    let status = err.status || 400;
    if (err.code?.startsWith("SQLITE_CONSTRAINT")) {
      message = err.code.includes("UNIQUE")
        ? "That SKU, barcode, invoice number or supplier bill already exists. Please use a unique value."
        : "This record conflicts with existing data. No changes were saved.";
    }
    if (err instanceof SyntaxError)
      message = "The submitted file or request is not valid JSON";
    if (!err.status && !err.code && !(err instanceof SyntaxError))
      console.error(err);
    res.status(status).json({ error: message });
  });
  return app;
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const app = await createApp();
  const port = Number(process.env.PORT || 3000);
  const server = createServer(app);
  server.listen(port, "0.0.0.0", () =>
    console.log(`shop desk is ready on http://0.0.0.0:${port}`),
  );
  const shutdown = () =>
    server.close(() => {
      db.close();
      process.exit(0);
    });
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}
