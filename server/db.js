// shopdesk — MongoDB data layer (mongoose, serverless-friendly)
// Every tenant document carries `businessId`. Connections are cached across
// serverless invocations via globalThis so warm functions reuse the pool.
import mongoose from 'mongoose';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function mongoUri() {
  return process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/shopdesk';
}

// ---------- connection (cached for serverless) ----------
const cached = globalThis.__shopdeskMongo || (globalThis.__shopdeskMongo = { conn: null, promise: null });

export async function connectMongo() {
  if (cached.conn && mongoose.connection.readyState === 1) return cached.conn;
  if (!cached.promise) {
    mongoose.set('strictQuery', true);
    cached.promise = mongoose
      .connect(mongoUri(), {
        appName: 'shopdesk',
        maxPoolSize: Number(process.env.MONGODB_MAX_POOL || 5),
        serverSelectionTimeoutMS: 8000,
        socketTimeoutMS: 45000,
      })
      .then((m) => m);
  }
  cached.conn = await cached.promise;
  if (!globalThis.__shopdeskIndexesDone) {
    globalThis.__shopdeskIndexesDone = true;
    ensureIndexes().catch((err) => console.warn('Index ensure failed (non-fatal):', err.message));
  }
  return cached.conn;
}

export function disconnectMongo() {
  cached.promise = null; cached.conn = null;
  return mongoose.disconnect();
}

// ---------- base transform: expose stable string `id` ----------
const baseTransform = (_doc, ret) => {
  ret.id = String(ret._id);
  delete ret._id;
  delete ret.__v;
  return ret;
};
const tenantSchema = (fields, options = {}) => {
  const schema = new mongoose.Schema(
    { businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true, index: true }, ...fields },
    { toJSON: { transform: baseTransform }, toObject: { transform: baseTransform }, versionKey: false, ...options }
  );
  return schema;
};
const oid = () => new mongoose.Types.ObjectId();
const OID_RE = /^[a-f0-9]{24}$/i;
export const isValidId = (s) => typeof s === 'string' && OID_RE.test(s);
export const asId = (s) => new mongoose.Types.ObjectId(String(s));

// ---------- models ----------
const Business = mongoose.models.Business || mongoose.model('Business', new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  owner_name: { type: String, default: '', maxlength: 120 },
  email: { type: String, default: '', maxlength: 120 },
  phone: { type: String, default: '', maxlength: 30 },
  address: { type: String, default: '', maxlength: 240 },
  city: { type: String, default: '', maxlength: 80 },
  state: { type: String, default: '', maxlength: 80 },
  pincode: { type: String, default: '', maxlength: 12 },
  gstin: { type: String, default: '', maxlength: 20 },
  invoice_prefix: { type: String, default: 'INV', maxlength: 8 },
  purchase_prefix: { type: String, default: 'PUR', maxlength: 8 },
  upi_id: { type: String, default: '', maxlength: 60 },
  currency: { type: String, default: 'INR', enum: ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD'] },
  tax_inclusive: { type: Number, default: 0 },
  default_tax: { type: Number, default: 18 },
  footer_note: { type: String, default: 'Thank you for shopping with us! Visit again.', maxlength: 300 },
  terms: { type: String, default: '', maxlength: 300 },
  plan: { type: String, default: 'trial', enum: ['trial', 'free', 'pro'] },
  trial_ends_at: { type: Date, default: () => new Date(Date.now() + 14 * 86400 * 1000) },
  is_demo: { type: Boolean, default: false },
  created_at: { type: String, default: () => fmtDateTime(new Date()) },
}, { toJSON: { transform: baseTransform }, toObject: { transform: baseTransform }, versionKey: false }));

const User = mongoose.models.User || mongoose.model('User', new mongoose.Schema({
  businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 80 },
  email: { type: String, required: true, lowercase: true, trim: true },
  password_hash: { type: String, required: true },
  role: { type: String, required: true, enum: ['admin', 'staff'], default: 'staff' },
  created_at: { type: String, default: () => fmtDateTime(new Date()) },
}, { toJSON: { transform: baseTransform }, toObject: { transform: baseTransform }, versionKey: false }));

const Session = mongoose.models.Session || mongoose.model('Session', new mongoose.Schema({
  token: { type: String, required: true, unique: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
  expiresAt: { type: Date, required: true },
  created_at: { type: String, default: () => fmtDateTime(new Date()) },
}, { versionKey: false }));

const Category = mongoose.models.Category || mongoose.model('Category', tenantSchema({
  name: { type: String, required: true, trim: true, maxlength: 60 },
  color: { type: String, default: '#a3e635', match: /^#[0-9a-fA-F]{6}$/ },
  created_at: { type: String, default: () => fmtDateTime(new Date()) },
}));

const Product = mongoose.models.Product || mongoose.model('Product', tenantSchema({
  sku: { type: String, required: true, trim: true, maxlength: 60 },
  barcode: { type: String, default: '', maxlength: 64 },
  name: { type: String, required: true, trim: true, maxlength: 200 },
  category_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null, index: true },
  unit: { type: String, default: 'pcs', maxlength: 20 },
  price: { type: Number, default: 0, min: 0 },
  cost: { type: Number, default: 0, min: 0 },
  tax_rate: { type: Number, default: 0, min: 0, max: 100 },
  stock: { type: Number, default: 0 },
  reorder_level: { type: Number, default: 0, min: 0 },
  favorite: { type: Boolean, default: false },
  created_at: { type: String, default: () => fmtDateTime(new Date()) },
  updated_at: { type: String, default: () => fmtDateTime(new Date()) },
}));

const Customer = mongoose.models.Customer || mongoose.model('Customer', tenantSchema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  phone: { type: String, default: '', maxlength: 20 },
  email: { type: String, default: '', maxlength: 120 },
  gstin: { type: String, default: '', maxlength: 20 },
  address: { type: String, default: '', maxlength: 240 },
  city: { type: String, default: '', maxlength: 60 },
  notes: { type: String, default: '', maxlength: 400 },
  created_at: { type: String, default: () => fmtDateTime(new Date()) },
}));

const Supplier = mongoose.models.Supplier || mongoose.model('Supplier', tenantSchema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  phone: { type: String, default: '', maxlength: 20 },
  email: { type: String, default: '', maxlength: 120 },
  gstin: { type: String, default: '', maxlength: 20 },
  address: { type: String, default: '', maxlength: 240 },
  city: { type: String, default: '', maxlength: 60 },
  notes: { type: String, default: '', maxlength: 400 },
  created_at: { type: String, default: () => fmtDateTime(new Date()) },
}));

const Invoice = mongoose.models.Invoice || mongoose.model('Invoice', tenantSchema({
  invoice_no: { type: String, required: true },
  customer_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null, index: true },
  customer_name: { type: String, default: 'Walk-in Customer', maxlength: 120 },
  is_interstate: { type: Boolean, default: false },
  date: { type: String, required: true, index: true },
  subtotal: { type: Number, default: 0 },
  discount: { type: Number, default: 0 },
  taxable: { type: Number, default: 0 },
  cgst: { type: Number, default: 0 },
  sgst: { type: Number, default: 0 },
  igst: { type: Number, default: 0 },
  tax_total: { type: Number, default: 0 },
  grand_total: { type: Number, default: 0 },
  paid: { type: Number, default: 0 },
  payment_method: { type: String, default: 'cash', enum: ['cash', 'upi', 'card', 'bank', 'credit'] },
  status: { type: String, default: 'paid', enum: ['paid', 'partial', 'unpaid'], index: true },
  notes: { type: String, default: '', maxlength: 500 },
  created_by: { type: String, default: '', maxlength: 80 },
  created_at: { type: String, default: () => fmtDateTime(new Date()) },
}));

const InvoiceItem = mongoose.models.InvoiceItem || mongoose.model('InvoiceItem', tenantSchema({
  invoice_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', required: true, index: true },
  product_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null, index: true },
  name: { type: String, required: true, maxlength: 200 },
  qty: { type: Number, required: true },
  price: { type: Number, required: true },
  cost: { type: Number, default: 0 },          // unit cost snapshot at sale time (profit math)
  discount: { type: Number, default: 0 },
  tax_rate: { type: Number, default: 0 },
  taxable: { type: Number, default: 0 },
  tax_amount: { type: Number, default: 0 },
  line_total: { type: Number, default: 0 },
  date: { type: String, default: '', index: true },
}));

const Payment = mongoose.models.Payment || mongoose.model('Payment', tenantSchema({
  invoice_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', required: true, index: true },
  amount: { type: Number, required: true },
  method: { type: String, default: 'cash' },
  note: { type: String, default: '', maxlength: 200 },
  date: { type: String, default: () => fmtDateTime(new Date()) },
}));

const Purchase = mongoose.models.Purchase || mongoose.model('Purchase', tenantSchema({
  purchase_no: { type: String, required: true },
  supplier_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', default: null },
  supplier_name: { type: String, default: '', maxlength: 120 },
  date: { type: String, required: true, index: true },
  subtotal: { type: Number, default: 0 },
  tax_total: { type: Number, default: 0 },
  grand_total: { type: Number, default: 0 },
  paid: { type: Number, default: 0 },
  status: { type: String, default: 'received', enum: ['received', 'pending'] },
  notes: { type: String, default: '', maxlength: 500 },
  created_at: { type: String, default: () => fmtDateTime(new Date()) },
}));

const PurchaseItem = mongoose.models.PurchaseItem || mongoose.model('PurchaseItem', tenantSchema({
  purchase_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Purchase', required: true, index: true },
  product_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null },
  name: { type: String, required: true, maxlength: 200 },
  qty: { type: Number, required: true },
  cost: { type: Number, required: true },
  tax_rate: { type: Number, default: 0 },
  taxable: { type: Number, default: 0 },
  tax_amount: { type: Number, default: 0 },
  line_total: { type: Number, default: 0 },
}));

const Expense = mongoose.models.Expense || mongoose.model('Expense', tenantSchema({
  category: { type: String, default: 'Miscellaneous', maxlength: 80 },
  amount: { type: Number, required: true },
  date: { type: String, required: true, index: true },
  payment_method: { type: String, default: 'cash' },
  notes: { type: String, default: '', maxlength: 300 },
  created_at: { type: String, default: () => fmtDateTime(new Date()) },
}));

const StockMovement = mongoose.models.StockMovement || mongoose.model('StockMovement', tenantSchema({
  product_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
  delta: { type: Number, required: true },
  reason: { type: String, required: true, maxlength: 40 },
  ref: { type: String, default: '', maxlength: 80 },
  created_at: { type: String, default: () => fmtDateTime(new Date()) },
}));

const Counter = mongoose.models.Counter || mongoose.model('Counter', tenantSchema({
  key: { type: String, required: true },
  value: { type: Number, default: 0 },
}));

export const models = { Business, User, Session, Category, Product, Customer, Supplier, Invoice, InvoiceItem, Payment, Purchase, PurchaseItem, Expense, StockMovement, Counter };

export async function ensureIndexes() {
  await Promise.all([
    User.collection.createIndex({ email: 1 }, { unique: true }),
    Session.collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    Session.collection.createIndex({ userId: 1 }),
    Category.collection.createIndex({ businessId: 1, name: 1 }, { unique: true }),
    Product.collection.createIndex({ businessId: 1, sku: 1 }, { unique: true }),
    Product.collection.createIndex({ businessId: 1, name: 1 }),
    Product.collection.createIndex({ businessId: 1, stock: 1 }),
    Customer.collection.createIndex({ businessId: 1, name: 1 }),
    Supplier.collection.createIndex({ businessId: 1, name: 1 }),
    Invoice.collection.createIndex({ businessId: 1, invoice_no: 1 }, { unique: true }),
    Invoice.collection.createIndex({ businessId: 1, date: -1 }),
    Invoice.collection.createIndex({ businessId: 1, status: 1 }),
    InvoiceItem.collection.createIndex({ businessId: 1, invoice_id: 1 }),
    InvoiceItem.collection.createIndex({ businessId: 1, product_id: 1 }),
    Payment.collection.createIndex({ businessId: 1, invoice_id: 1 }),
    Purchase.collection.createIndex({ businessId: 1, purchase_no: 1 }, { unique: true }),
    Purchase.collection.createIndex({ businessId: 1, date: -1 }),
    PurchaseItem.collection.createIndex({ businessId: 1, purchase_id: 1 }),
    Expense.collection.createIndex({ businessId: 1, date: -1 }),
    StockMovement.collection.createIndex({ businessId: 1, product_id: 1, created_at: -1 }),
    Counter.collection.createIndex({ businessId: 1, key: 1 }, { unique: true }),
  ]);
}

// ---------- helpers ----------
export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export function fmtDateTime(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
export const nowLocal = () => fmtDateTime(new Date());
export const isoDate = (d = new Date()) => fmtDateTime(d).slice(0, 10);

export async function nextCounter(businessId, key) {
  const doc = await Counter.findOneAndUpdate(
    { businessId, key },
    { $inc: { value: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  return doc.value;
}

/** Inclusive-exclusive string bounds for a YYYY-MM-DD day. */
export function dayRange(isoDay) {
  const start = `${isoDay} 00:00:00`;
  const d = new Date(`${isoDay}T00:00:00`);
  d.setDate(d.getDate() + 1);
  const p = (n) => String(n).padStart(2, '0');
  const end = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} 00:00:00`;
  return { start, end };
}

/** Inclusive bounds covering [from, to] whole days for lexicographic string dates. */
export function rangeBounds(from, to) {
  const start = `${from} 00:00:00`;
  const end = `${to} 23:59:59.999`;
  return { start, end };
}

export { Counter };
