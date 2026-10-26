import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const dbPath =
  process.env.DB_PATH || path.join(root, "data", "shop-desk.sqlite");
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
export const db = new Database(dbPath);
// The database contains client information and credential hashes.
if (process.platform !== "win32") fs.chmodSync(dbPath, 0o600);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.pragma("busy_timeout = 5000");
db.exec(`
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS products (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, category TEXT NOT NULL, hsn TEXT NOT NULL,
 unit TEXT NOT NULL, sale_price INTEGER NOT NULL, cost_price INTEGER NOT NULL, gst_rate REAL NOT NULL,
 tax_treatment TEXT NOT NULL, sku TEXT NOT NULL DEFAULT '', barcode TEXT NOT NULL DEFAULT '',
 low_stock REAL NOT NULL DEFAULT 5, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS unique_product_sku ON products(sku) WHERE sku != '';
CREATE UNIQUE INDEX IF NOT EXISTS unique_product_barcode ON products(barcode) WHERE barcode != '';
CREATE TABLE IF NOT EXISTS clients (id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '', address TEXT NOT NULL DEFAULT '', state TEXT NOT NULL, gstin TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS pets (id TEXT PRIMARY KEY, client_id TEXT NOT NULL REFERENCES clients(id), name TEXT NOT NULL, species TEXT NOT NULL, breed TEXT NOT NULL DEFAULT '', sex TEXT NOT NULL DEFAULT '', dob TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS suppliers (id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '', address TEXT NOT NULL DEFAULT '', gstin TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS purchases (id TEXT PRIMARY KEY, supplier_id TEXT NOT NULL REFERENCES suppliers(id), invoice_no TEXT NOT NULL, date TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '', lines TEXT NOT NULL, subtotal INTEGER NOT NULL, tax INTEGER NOT NULL, total INTEGER NOT NULL, created_at TEXT NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS unique_supplier_bill ON purchases(supplier_id,invoice_no);
CREATE TABLE IF NOT EXISTS batches (id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products(id), batch_no TEXT NOT NULL DEFAULT '', expiry TEXT NOT NULL DEFAULT '', qty REAL NOT NULL, cost_price INTEGER NOT NULL, purchase_id TEXT REFERENCES purchases(id), created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS invoices (
 id TEXT PRIMARY KEY, number TEXT UNIQUE, date TEXT NOT NULL, due_date TEXT NOT NULL, client_id TEXT REFERENCES clients(id), pet_id TEXT REFERENCES pets(id),
 status TEXT NOT NULL, place_of_supply TEXT NOT NULL, inclusive INTEGER NOT NULL, round_off INTEGER NOT NULL,
 lines TEXT NOT NULL, subtotal INTEGER NOT NULL, discount INTEGER NOT NULL, taxable INTEGER NOT NULL,
 cgst INTEGER NOT NULL, sgst INTEGER NOT NULL, igst INTEGER NOT NULL, tax INTEGER NOT NULL, rounding INTEGER NOT NULL, total INTEGER NOT NULL,
 notes TEXT NOT NULL DEFAULT '', terms TEXT NOT NULL DEFAULT '', clinic TEXT NOT NULL, customer TEXT NOT NULL, pet TEXT NOT NULL,
 document_type TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS allocations (id TEXT PRIMARY KEY, invoice_id TEXT NOT NULL REFERENCES invoices(id), product_id TEXT NOT NULL REFERENCES products(id), batch_id TEXT NOT NULL REFERENCES batches(id), line_index INTEGER NOT NULL, qty REAL NOT NULL);
CREATE TABLE IF NOT EXISTS credits (id TEXT PRIMARY KEY, number TEXT NOT NULL UNIQUE, invoice_id TEXT NOT NULL UNIQUE REFERENCES invoices(id), date TEXT NOT NULL, reason TEXT NOT NULL, total INTEGER NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS payments (id TEXT PRIMARY KEY, invoice_id TEXT REFERENCES invoices(id), purchase_id TEXT REFERENCES purchases(id), direction TEXT NOT NULL, amount INTEGER NOT NULL, method TEXT NOT NULL, reference TEXT NOT NULL DEFAULT '', date TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS movements (id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products(id), batch_id TEXT REFERENCES batches(id), type TEXT NOT NULL, qty REAL NOT NULL, reference TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS counters (key TEXT PRIMARY KEY, value INTEGER NOT NULL);
`);
export const getMeta = (key) => {
  const row = db.prepare("SELECT value FROM meta WHERE key=?").get(key);
  return row ? JSON.parse(row.value) : null;
};
export const setMeta = (key, value) =>
  db
    .prepare(
      "INSERT INTO meta(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
    )
    .run(key, JSON.stringify(value));
export const all = (table) => db.prepare(`SELECT * FROM ${table}`).all();
export const insert = (table, obj) => {
  const keys = Object.keys(obj);
  return db
    .prepare(
      `INSERT INTO ${table} (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`,
    )
    .run(...keys.map((k) => obj[k]));
};
export const update = (table, id, obj) => {
  const keys = Object.keys(obj);
  return db
    .prepare(
      `UPDATE ${table} SET ${keys.map((k) => `${k}=?`).join(",")} WHERE id=?`,
    )
    .run(...keys.map((k) => obj[k]), id);
};
