// shopdesk — API + static host. Serves the built SPA in production.
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import QRCode from 'qrcode';
import { db, q, transaction, nextCounter, isEmpty, nowLocal, fmtDateTime, ROOT } from './db.js';
import { attachUser, requireAuth, requireAdmin, hashPassword, verifyPassword, createSession, destroySession, COOKIE } from './auth.js';
import { seedDatabase } from './seed.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(ROOT, 'dist');
const PORT = Number(process.env.PORT || 8787);

if (isEmpty()) {
  console.log('Empty database detected — seeding demo business…');
  seedDatabase();
}

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '25mb' })); // headroom for backup restore
app.use(attachUser);

const round2 = (n) => Math.round(n * 100) / 100;
const httpError = (status, message) => Object.assign(new Error(message), { status, expose: true });
const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ============================================================ auth
const loginAttempts = new Map(); // ip -> {count, reset}
function loginRateLimitOk(ip) {
  const now = Date.now();
  const rec = loginAttempts.get(ip);
  if (!rec || now > rec.reset) {
    loginAttempts.set(ip, { count: 1, reset: now + 5 * 60 * 1000 });
    return true;
  }
  rec.count += 1;
  return rec.count <= 15;
}

const cookieOpts = (req) => {
  const secure = req.headers['x-forwarded-proto'] === 'https' || req.secure;
  return `HttpOnly; Path=/; SameSite=Lax; Max-Age=${30 * 86400}${secure ? '; Secure' : ''}`;
};

app.post('/api/auth/login', (req, res) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
  if (!loginRateLimitOk(ip)) return res.status(429).json({ error: 'Too many attempts. Try again in a few minutes.' });
  const parsed = z.object({ email: z.string().email(), password: z.string().min(1).max(200) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Enter a valid email and password.' });
  const user = q.get('SELECT * FROM users WHERE email = ?', parsed.data.email.toLowerCase().trim());
  if (!user || !verifyPassword(parsed.data.password, user.password_hash)) {
    return res.status(401).json({ error: 'Wrong email or password.' });
  }
  const token = createSession(user.id);
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; ${cookieOpts(req)}`);
  res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

app.post('/api/auth/logout', (req, res) => {
  if (req.sessionToken) destroySession(req.sessionToken);
  res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`);
  res.json({ ok: true });
});

app.get('/api/auth/me', (req, res) => {
  res.json({ user: req.user });
});

app.put('/api/auth/profile', requireAuth, (req, res) => {
  const parsed = z.object({ name: z.string().trim().min(2).max(80) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Enter a valid name.' });
  q.run('UPDATE users SET name = ? WHERE id = ?', parsed.data.name, req.user.id);
  res.json({ user: { ...req.user, name: parsed.data.name } });
});

app.post('/api/auth/change-password', requireAuth, (req, res) => {
  const parsed = z.object({ current: z.string().min(1), next: z.string().min(8, 'Use at least 8 characters.').max(200) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error?.issues?.[0]?.message || 'Check the password fields.' });
  const user = q.get('SELECT * FROM users WHERE id = ?', req.user.id);
  if (!verifyPassword(parsed.data.current, user.password_hash)) return res.status(400).json({ error: 'Current password is wrong.' });
  q.run('UPDATE users SET password_hash = ? WHERE id = ?', hashPassword(parsed.data.next), req.user.id);
  res.json({ ok: true });
});

// ============================================================ helpers for invoices/purchases
function computeLine({ qty, price, discount = 0, tax_rate = 0 }) {
  const gross = qty * price;
  const taxable = round2(gross * (1 - discount / 100));
  const tax = round2((taxable * tax_rate) / 100);
  return { gross: round2(gross), taxable, tax, lineTotal: round2(taxable + tax) };
}

function invoiceStatus(paid, grandTotal) {
  if (paid >= grandTotal - 0.5) return 'paid';
  if (paid > 0) return 'partial';
  return 'unpaid';
}

function getInvoiceFull(id) {
  const invoice = q.get(`SELECT i.*, c.phone AS customer_phone, c.gstin AS customer_gstin, c.address AS customer_address, c.city AS customer_city
    FROM invoices i LEFT JOIN customers c ON c.id = i.customer_id WHERE i.id = ?`, id);
  if (!invoice) return null;
  invoice.items = q.all('SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY id', id);
  invoice.payments = q.all('SELECT * FROM payments WHERE invoice_id = ? ORDER BY id', id);
  return invoice;
}

const isoDate = (d) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

// ============================================================ dashboard
app.get('/api/dashboard', requireAuth, (req, res) => {
  const today = isoDate(new Date());
  const y = new Date(); y.setDate(y.getDate() - 1);
  const yesterday = isoDate(y);
  const monthStart = today.slice(0, 8) + '01';
  const py = new Date(); py.setMonth(py.getMonth() - 1);
  const prevMonthStart = isoDate(new Date(py.getFullYear(), py.getMonth(), 1));
  const prevMonthEnd = isoDate(new Date(py.getFullYear(), py.getMonth() + 1, 0));

  const todayStats = q.get(`SELECT COALESCE(SUM(grand_total),0) AS sales, COUNT(*) AS invoices,
      COALESCE(SUM((SELECT SUM(qty) FROM invoice_items ii WHERE ii.invoice_id = invoices.id)),0) AS items
      FROM invoices WHERE date(date) = date(?)`, today);
  const yStats = q.get(`SELECT COALESCE(SUM(grand_total),0) AS sales, COUNT(*) AS invoices FROM invoices WHERE date(date) = date(?)`, yesterday);
  const monthStats = q.get(`SELECT COALESCE(SUM(grand_total),0) AS sales, COUNT(*) AS invoices FROM invoices WHERE date(date) >= date(?)`, monthStart);
  const prevMonth = q.get(`SELECT COALESCE(SUM(grand_total),0) AS sales FROM invoices WHERE date(date) >= date(?) AND date(date) <= date(?)`, prevMonthStart, prevMonthEnd);
  const monthExpenses = q.get(`SELECT COALESCE(SUM(amount),0) AS total FROM expenses WHERE date(date) >= date(?)`, monthStart);
  const outstanding = q.get(`SELECT COALESCE(SUM(grand_total - paid),0) AS total, COUNT(*) AS n FROM invoices WHERE status != 'paid'`);
  const stockValue = q.get(`SELECT COALESCE(SUM(stock * cost),0) AS value, COUNT(*) AS units FROM products`);
  const lowStock = q.all(`SELECT p.id, p.name, p.stock, p.reorder_level, p.unit, p.price, c.name AS category_name
    FROM products p LEFT JOIN categories c ON c.id = p.category_id
    WHERE p.stock <= p.reorder_level ORDER BY (p.stock - p.reorder_level) ASC LIMIT 8`);
  const lowStockCount = q.get('SELECT COUNT(*) AS n FROM products WHERE stock <= reorder_level');
  const topProducts = q.all(`SELECT ii.name, SUM(ii.qty) AS qty, SUM(ii.line_total) AS revenue
    FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id
    WHERE date(i.date) >= date('now','-30 days','localtime')
    GROUP BY ii.name ORDER BY qty DESC LIMIT 6`);
  const recentInvoices = q.all(`SELECT id, invoice_no, customer_name, grand_total, paid, status, payment_method, date FROM invoices ORDER BY id DESC LIMIT 6`);
  const ticker = q.all(`SELECT invoice_no, customer_name, grand_total, payment_method, date FROM invoices ORDER BY id DESC LIMIT 10`);
  const salesByDay = q.all(`SELECT date(date) AS day, COALESCE(SUM(grand_total),0) AS total, COUNT(*) AS invoices
    FROM invoices WHERE date(date) >= date('now','-29 days','localtime') GROUP BY date(date) ORDER BY day`);
  // fill 30-day series
  const series = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = isoDate(d);
    const found = salesByDay.find((r) => r.day === key);
    series.push({ day: key, total: found ? round2(Number(found.total)) : 0, invoices: found ? Number(found.invoices) : 0 });
  }
  const paymentModes = q.all(`SELECT payment_method AS method, COALESCE(SUM(grand_total),0) AS total, COUNT(*) AS n
    FROM invoices WHERE date(date) >= date(?) GROUP BY payment_method ORDER BY total DESC`, monthStart);
  const profitMonth = q.get(`SELECT COALESCE(SUM(ii.taxable - ii.qty * COALESCE(p.cost, 0)),0) AS profit
    FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id LEFT JOIN products p ON p.id = ii.product_id
    WHERE date(i.date) >= date(?)`, monthStart);

  res.json({
    today: { sales: round2(Number(todayStats.sales)), invoices: Number(todayStats.invoices), items: Number(todayStats.items) },
    yesterday: { sales: round2(Number(yStats.sales)), invoices: Number(yStats.invoices) },
    month: { sales: round2(Number(monthStats.sales)), invoices: Number(monthStats.invoices), expenses: round2(Number(monthExpenses.total)), profit: round2(Number(profitMonth.profit) - Number(monthExpenses.total)) },
    prevMonthSales: round2(Number(prevMonth.sales)),
    outstanding: { total: round2(Number(outstanding.total)), invoices: Number(outstanding.n) },
    stockValue: round2(Number(stockValue.value)),
    lowStock,
    lowStockCount: Number(lowStockCount.n),
    topProducts,
    recentInvoices,
    ticker,
    salesByDay: series,
    paymentModes: paymentModes.map((p) => ({ ...p, total: round2(Number(p.total)), n: Number(p.n) })),
  });
});

// ============================================================ products
const productSchema = z.object({
  sku: z.string().trim().min(1).max(60),
  barcode: z.string().trim().max(64).optional().default(''),
  name: z.string().trim().min(2).max(200),
  category_id: z.number().int().positive().nullable().optional(),
  unit: z.string().trim().min(1).max(20).default('pcs'),
  price: z.number().min(0),
  cost: z.number().min(0).default(0),
  tax_rate: z.number().min(0).max(100).default(0),
  stock: z.number().min(0).default(0),
  reorder_level: z.number().min(0).default(0),
  favorite: z.boolean().optional().default(false),
});

app.get('/api/products', requireAuth, (req, res) => {
  const { q: search, category_id, stock, sort } = req.query;
  let where = 'WHERE 1=1';
  const params = [];
  if (search) {
    where += ' AND (p.name LIKE ? OR p.sku LIKE ? OR p.barcode LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (category_id) { where += ' AND p.category_id = ?'; params.push(Number(category_id)); }
  if (stock === 'low') where += ' AND p.stock <= p.reorder_level AND p.stock > 0';
  if (stock === 'out') where += ' AND p.stock <= 0';
  const order = sort === 'name' ? 'p.name ASC' : sort === 'price' ? 'p.price DESC' : sort === 'stock' ? 'p.stock ASC' : 'p.name ASC';
  const rows = q.all(`SELECT p.*, c.name AS category_name, c.color AS category_color
    FROM products p LEFT JOIN categories c ON c.id = p.category_id ${where} ORDER BY ${order}`, ...params);
  res.json(rows);
});

app.post('/api/products', requireAuth, (req, res) => {
  const parsed = productSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues?.[0]?.message || 'Check the product fields.' });
  const d = parsed.data;
  try {
    const result = transaction(() => {
      const r = q.run(`INSERT INTO products(sku, barcode, name, category_id, unit, price, cost, tax_rate, stock, reorder_level, favorite)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        d.sku.trim(), d.barcode, d.name, d.category_id ?? null, d.unit, d.price, d.cost, d.tax_rate, d.stock, d.reorder_level, d.favorite ? 1 : 0);
      const id = Number(r.lastInsertRowid);
      if (d.stock > 0) q.run(`INSERT INTO stock_movements(product_id, delta, reason, ref, created_at) VALUES (?,?,?,?,?)`, id, d.stock, 'opening', 'Opening stock', nowLocal());
      return id;
    });
    res.status(201).json(q.get('SELECT * FROM products WHERE id = ?', result));
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) return res.status(409).json({ error: `SKU “${d.sku}” already exists.` });
    throw err;
  }
});

app.put('/api/products/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const existing = q.get('SELECT * FROM products WHERE id = ?', id);
  if (!existing) return res.status(404).json({ error: 'Product not found.' });
  const parsed = productSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues?.[0]?.message || 'Check the product fields.' });
  const d = parsed.data;
  try {
    transaction(() => {
      q.run(`UPDATE products SET sku=?, barcode=?, name=?, category_id=?, unit=?, price=?, cost=?, tax_rate=?, stock=?, reorder_level=?, favorite=?, updated_at=datetime('now','localtime') WHERE id=?`,
        d.sku.trim(), d.barcode, d.name, d.category_id ?? null, d.unit, d.price, d.cost, d.tax_rate, d.stock, d.reorder_level, d.favorite ? 1 : 0, id);
      const delta = round2(d.stock - existing.stock);
      if (delta !== 0) q.run(`INSERT INTO stock_movements(product_id, delta, reason, ref, created_at) VALUES (?,?,?,?,?)`, id, delta, 'adjustment', 'Manual edit', nowLocal());
    });
    res.json(q.get('SELECT * FROM products WHERE id = ?', id));
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) return res.status(409).json({ error: `SKU “${d.sku}” already exists.` });
    throw err;
  }
});

app.delete('/api/products/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const used = q.get('SELECT (SELECT COUNT(*) FROM invoice_items WHERE product_id = ?) + (SELECT COUNT(*) FROM purchase_items WHERE product_id = ?) AS n', id, id);
  if (Number(used.n) > 0) return res.status(409).json({ error: 'This product is used in saved bills, so it can’t be deleted. Set its stock to 0 instead.' });
  q.run('DELETE FROM products WHERE id = ?', id);
  res.json({ ok: true });
});

app.post('/api/products/:id/adjust-stock', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const parsed = z.object({ delta: z.number().refine((n) => n !== 0, 'Enter a non-zero quantity.').refine((n) => Math.abs(n) < 1000000), reason: z.string().trim().max(120).default('Adjustment') }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues?.[0]?.message || 'Check the adjustment.' });
  const p = q.get('SELECT * FROM products WHERE id = ?', id);
  if (!p) return res.status(404).json({ error: 'Product not found.' });
  const newStock = round2(p.stock + parsed.data.delta);
  if (newStock < 0) return res.status(400).json({ error: `Not enough stock — only ${p.stock} ${p.unit} left.` });
  transaction(() => {
    q.run(`UPDATE products SET stock = ?, updated_at = datetime('now','localtime') WHERE id = ?`, newStock, id);
    q.run(`INSERT INTO stock_movements(product_id, delta, reason, ref, created_at) VALUES (?,?,?,?,?)`, id, parsed.data.delta, 'adjustment', parsed.data.reason, nowLocal());
  });
  res.json(q.get('SELECT * FROM products WHERE id = ?', id));
});

app.get('/api/products/:id/movements', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  res.json(q.all('SELECT * FROM stock_movements WHERE product_id = ? ORDER BY id DESC LIMIT 60', id));
});

// ============================================================ categories
app.get('/api/categories', requireAuth, (req, res) => {
  res.json(q.all(`SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id) AS product_count
    FROM categories c ORDER BY c.name`));
});

app.post('/api/categories', requireAuth, (req, res) => {
  const parsed = z.object({ name: z.string().trim().min(2).max(60), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().default('#a3e635') }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Give the category a name.' });
  try {
    const r = q.run('INSERT INTO categories(name, color) VALUES (?,?)', parsed.data.name, parsed.data.color);
    res.status(201).json(q.get('SELECT * FROM categories WHERE id = ?', Number(r.lastInsertRowid)));
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) return res.status(409).json({ error: 'That category already exists.' });
    throw err;
  }
});

app.put('/api/categories/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const parsed = z.object({ name: z.string().trim().min(2).max(60), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Give the category a name.' });
  const existing = q.get('SELECT * FROM categories WHERE id = ?', id);
  if (!existing) return res.status(404).json({ error: 'Category not found.' });
  try {
    q.run('UPDATE categories SET name = ?, color = COALESCE(?, color) WHERE id = ?', parsed.data.name, parsed.data.color ?? null, id);
    res.json(q.get('SELECT * FROM categories WHERE id = ?', id));
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) return res.status(409).json({ error: 'That category already exists.' });
    throw err;
  }
});

app.delete('/api/categories/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const used = q.get('SELECT COUNT(*) AS n FROM products WHERE category_id = ?', id);
  if (Number(used.n) > 0) return res.status(409).json({ error: 'Move its products to another category first.' });
  q.run('DELETE FROM categories WHERE id = ?', id);
  res.json({ ok: true });
});

// ============================================================ customers
const personSchema = z.object({
  name: z.string().trim().min(2, 'Enter the name.').max(120),
  phone: z.string().trim().max(20).optional().default(''),
  email: z.string().trim().email('Enter a valid email.').max(120).optional().or(z.literal('')).default(''),
  gstin: z.string().trim().max(20).optional().default(''),
  address: z.string().trim().max(240).optional().default(''),
  city: z.string().trim().max(60).optional().default(''),
  notes: z.string().trim().max(400).optional().default(''),
});

app.get('/api/customers', requireAuth, (req, res) => {
  const { q: search } = req.query;
  let where = '';
  const params = [];
  if (search) {
    where = 'WHERE c.name LIKE ? OR c.phone LIKE ? OR c.city LIKE ?';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  const rows = q.all(`SELECT c.*,
      COUNT(i.id) AS bill_count,
      COALESCE(SUM(i.grand_total), 0) AS total_spent,
      COALESCE(SUM(i.grand_total - i.paid), 0) AS outstanding,
      MAX(i.date) AS last_visit
    FROM customers c LEFT JOIN invoices i ON i.customer_id = c.id
    ${where} GROUP BY c.id ORDER BY c.name`, ...params);
  res.json(rows.map((r) => ({ ...r, total_spent: round2(Number(r.total_spent)), outstanding: round2(Number(r.outstanding)) })));
});

app.get('/api/customers/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const customer = q.get('SELECT * FROM customers WHERE id = ?', id);
  if (!customer) return res.status(404).json({ error: 'Customer not found.' });
  const stats = q.get(`SELECT COUNT(*) AS bill_count, COALESCE(SUM(grand_total),0) AS total_spent,
      COALESCE(SUM(grand_total - paid),0) AS outstanding, MAX(date) AS last_visit FROM invoices WHERE customer_id = ?`, id);
  const recent = q.all(`SELECT id, invoice_no, date, grand_total, paid, status, payment_method FROM invoices WHERE customer_id = ? ORDER BY id DESC LIMIT 12`, id);
  res.json({ ...customer, stats: { bill_count: Number(stats.bill_count), total_spent: round2(Number(stats.total_spent)), outstanding: round2(Number(stats.outstanding)), last_visit: stats.last_visit }, recentInvoices: recent });
});

app.post('/api/customers', requireAuth, (req, res) => {
  const parsed = personSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues?.[0]?.message || 'Check the customer details.' });
  const d = parsed.data;
  const r = q.run('INSERT INTO customers(name, phone, email, gstin, address, city, notes) VALUES (?,?,?,?,?,?,?)',
    d.name, d.phone, d.email, d.gstin.toUpperCase(), d.address, d.city, d.notes);
  res.status(201).json(q.get('SELECT * FROM customers WHERE id = ?', Number(r.lastInsertRowid)));
});

app.put('/api/customers/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const existing = q.get('SELECT * FROM customers WHERE id = ?', id);
  if (!existing) return res.status(404).json({ error: 'Customer not found.' });
  const parsed = personSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues?.[0]?.message || 'Check the customer details.' });
  const d = parsed.data;
  q.run('UPDATE customers SET name=?, phone=?, email=?, gstin=?, address=?, city=?, notes=? WHERE id=?',
    d.name, d.phone, d.email, d.gstin.toUpperCase(), d.address, d.city, d.notes, id);
  res.json(q.get('SELECT * FROM customers WHERE id = ?', id));
});

app.delete('/api/customers/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  q.run('UPDATE invoices SET customer_id = NULL WHERE customer_id = ?', id); // history keeps the name snapshot
  q.run('DELETE FROM customers WHERE id = ?', id);
  res.json({ ok: true });
});

// ============================================================ suppliers
app.get('/api/suppliers', requireAuth, (req, res) => {
  const { q: search } = req.query;
  let where = '';
  const params = [];
  if (search) {
    where = 'WHERE s.name LIKE ? OR s.phone LIKE ? OR s.city LIKE ?';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  const rows = q.all(`SELECT s.*, COUNT(p.id) AS purchase_count, COALESCE(SUM(p.grand_total),0) AS total_purchased
    FROM suppliers s LEFT JOIN purchases p ON p.supplier_id = s.id
    ${where} GROUP BY s.id ORDER BY s.name`, ...params);
  res.json(rows.map((r) => ({ ...r, total_purchased: round2(Number(r.total_purchased)) })));
});

app.post('/api/suppliers', requireAuth, (req, res) => {
  const parsed = personSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues?.[0]?.message || 'Check the supplier details.' });
  const d = parsed.data;
  const r = q.run('INSERT INTO suppliers(name, phone, email, gstin, address, city, notes) VALUES (?,?,?,?,?,?,?)',
    d.name, d.phone, d.email, d.gstin.toUpperCase(), d.address, d.city, d.notes);
  res.status(201).json(q.get('SELECT * FROM suppliers WHERE id = ?', Number(r.lastInsertRowid)));
});

app.put('/api/suppliers/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const existing = q.get('SELECT * FROM suppliers WHERE id = ?', id);
  if (!existing) return res.status(404).json({ error: 'Supplier not found.' });
  const parsed = personSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues?.[0]?.message || 'Check the supplier details.' });
  const d = parsed.data;
  q.run('UPDATE suppliers SET name=?, phone=?, email=?, gstin=?, address=?, city=?, notes=? WHERE id=?',
    d.name, d.phone, d.email, d.gstin.toUpperCase(), d.address, d.city, d.notes, id);
  res.json(q.get('SELECT * FROM suppliers WHERE id = ?', id));
});

app.delete('/api/suppliers/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  q.run('UPDATE purchases SET supplier_id = NULL WHERE supplier_id = ?', id);
  q.run('DELETE FROM suppliers WHERE id = ?', id);
  res.json({ ok: true });
});

// ============================================================ invoices
app.get('/api/invoices', requireAuth, (req, res) => {
  const { q: search, status, from, to, page = '1', pageSize = '20' } = req.query;
  let where = 'WHERE 1=1';
  const params = [];
  if (search) { where += ' AND (invoice_no LIKE ? OR customer_name LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
  if (status && ['paid', 'partial', 'unpaid'].includes(status)) { where += ' AND status = ?'; params.push(status); }
  if (from) { where += " AND date(date) >= date(?)"; params.push(from); }
  if (to) { where += " AND date(date) <= date(?)"; params.push(to); }
  const total = Number(q.get(`SELECT COUNT(*) AS n FROM invoices ${where}`, ...params).n);
  const ps = Math.min(100, Math.max(1, Number(pageSize) || 20));
  const pg = Math.max(1, Number(page) || 1);
  const rows = q.all(`SELECT id, invoice_no, customer_name, date, subtotal, discount, tax_total, grand_total, paid, status, payment_method
    FROM invoices ${where} ORDER BY id DESC LIMIT ? OFFSET ?`, ...params, ps, (pg - 1) * ps);
  res.json({ rows, total, page: pg, pageSize: ps });
});

app.get('/api/invoices/:id', requireAuth, (req, res) => {
  const invoice = getInvoiceFull(Number(req.params.id));
  if (!invoice) return res.status(404).json({ error: 'Bill not found.' });
  const business = q.get('SELECT * FROM business WHERE id = 1');
  res.json({ ...invoice, business });
});

const invoiceItemSchema = z.object({
  product_id: z.number().int().positive().nullable().optional(),
  name: z.string().trim().min(1).max(200),
  qty: z.number().positive().max(100000),
  price: z.number().min(0).max(100000000),
  discount: z.number().min(0).max(100).optional().default(0),
  tax_rate: z.number().min(0).max(100).optional().default(0),
});

const invoiceSchema = z.object({
  customer_id: z.number().int().positive().nullable().optional(),
  customer_name: z.string().trim().max(120).nullable().optional(),
  is_interstate: z.boolean().optional().default(false),
  discount: z.number().min(0).max(10000000).optional().default(0),
  payment_method: z.enum(['cash', 'upi', 'card', 'bank', 'credit']),
  paid: z.number().min(0).max(100000000).nullable().optional(),
  notes: z.string().trim().max(500).optional().default(''),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}:\d{2})?$/, 'Bad date').optional(),
  items: z.array(invoiceItemSchema).min(1, 'Add at least one item.').max(200),
});

function buildInvoice(req, res) {
  const parsed = invoiceSchema.safeParse(req.body);
  if (!parsed.success) return { error: parsed.error.issues?.[0]?.message || 'Check the bill details.' };
  const d = parsed.data;
  try {
    const result = transaction(() => {
      // validate stock & gather product snapshots
      const lines = [];
      let gross = 0, taxableSum = 0, taxSum = 0, profitSum = 0;
      for (const item of d.items) {
        let prod = null;
        if (item.product_id) {
          prod = q.get('SELECT * FROM products WHERE id = ?', item.product_id);
          if (!prod) throw httpError(400, `A product in the bill no longer exists.`);
          if (prod.stock < item.qty) throw httpError(400, `Only ${prod.stock} ${prod.unit} of “${prod.name}” in stock.`);
        }
        const calc = computeLine(item);
        gross = round2(gross + calc.gross);
        taxableSum = round2(taxableSum + calc.taxable);
        taxSum = round2(taxSum + calc.tax);
        profitSum = round2(profitSum + calc.taxable - item.qty * (prod?.cost ?? 0));
        lines.push({ item, calc, prod });
      }
      const cgst = d.is_interstate ? 0 : round2(taxSum / 2);
      const sgst = d.is_interstate ? 0 : round2(taxSum - cgst);
      const igst = d.is_interstate ? taxSum : 0;
      const grand = Math.max(0, round2(taxableSum + taxSum - d.discount));
      const paid = d.paid == null ? (d.payment_method === 'credit' ? 0 : grand) : Math.min(d.paid, grand);
      const status = invoiceStatus(paid, grand);

      const business = q.get('SELECT * FROM business WHERE id = 1');
      const seq = nextCounter('invoice');
      const invoiceNo = `${business.invoice_prefix || 'INV'}-${String(seq).padStart(4, '0')}`;
      const stamp = d.date || nowLocal();
      const customerName = d.customer_id
        ? (q.get('SELECT name FROM customers WHERE id = ?', d.customer_id)?.name || 'Customer')
        : (d.customer_name?.trim() || 'Walk-in Customer');

      const r = q.run(`INSERT INTO invoices(invoice_no, customer_id, customer_name, is_interstate, date, subtotal, discount, taxable, cgst, sgst, igst, tax_total, grand_total, paid, payment_method, status, notes, created_by, created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        invoiceNo, d.customer_id ?? null, customerName, d.is_interstate ? 1 : 0, stamp, gross, d.discount, taxableSum, cgst, sgst, igst, taxSum, grand, paid, d.payment_method, status, d.notes, req.user.name, stamp);
      const invoiceId = Number(r.lastInsertRowid);

      for (const { item, calc, prod } of lines) {
        q.run(`INSERT INTO invoice_items(invoice_id, product_id, name, qty, price, discount, tax_rate, taxable, tax_amount, line_total)
          VALUES (?,?,?,?,?,?,?,?,?,?)`, invoiceId, item.product_id ?? null, item.name, item.qty, item.price, item.discount || 0, item.tax_rate || 0, calc.taxable, calc.tax, calc.lineTotal);
        if (prod) {
          q.run(`UPDATE products SET stock = round(stock - ?, 2), updated_at = datetime('now','localtime') WHERE id = ?`, item.qty, prod.id);
          q.run(`INSERT INTO stock_movements(product_id, delta, reason, ref, created_at) VALUES (?,?,?,?,?)`, prod.id, -item.qty, 'sale', invoiceNo, stamp);
        }
      }
      if (paid > 0) q.run('INSERT INTO payments(invoice_id, amount, method, note, date) VALUES (?,?,?,?,?)', invoiceId, paid, d.payment_method === 'credit' ? 'cash' : d.payment_method, 'Bill payment', stamp);
      return invoiceId;
    });
    return { id: result };
  } catch (err) {
    if (err.expose) return { error: err.message, status: err.status };
    throw err;
  }
}

app.post('/api/invoices', requireAuth, (req, res) => {
  const out = buildInvoice(req, res);
  if (out.error) return res.status(out.status || 400).json({ error: out.error });
  res.status(201).json(getInvoiceFull(out.id));
});

app.post('/api/invoices/:id/payments', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const parsed = z.object({ amount: z.number().positive(), method: z.enum(['cash', 'upi', 'card', 'bank']).default('cash'), note: z.string().trim().max(200).optional().default('') }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Enter a valid payment.' });
  const invoice = q.get('SELECT * FROM invoices WHERE id = ?', id);
  if (!invoice) return res.status(404).json({ error: 'Bill not found.' });
  const remaining = round2(invoice.grand_total - invoice.paid);
  if (remaining <= 0.5) return res.status(400).json({ error: 'This bill is already fully paid.' });
  if (parsed.data.amount > remaining + 0.5) return res.status(400).json({ error: `Balance due is only ₹${remaining.toFixed(2)}.` });
  transaction(() => {
    q.run('INSERT INTO payments(invoice_id, amount, method, note, date) VALUES (?,?,?,?,datetime(\'now\',\'localtime\'))', id, parsed.data.amount, parsed.data.method, parsed.data.note || 'Payment');
    const newPaid = round2(invoice.paid + parsed.data.amount);
    q.run('UPDATE invoices SET paid = ?, status = ? WHERE id = ?', newPaid, invoiceStatus(newPaid, invoice.grand_total), id);
  });
  res.json(getInvoiceFull(id));
});

app.delete('/api/invoices/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const invoice = q.get('SELECT * FROM invoices WHERE id = ?', id);
  if (!invoice) return res.status(404).json({ error: 'Bill not found.' });
  transaction(() => {
    const items = q.all('SELECT * FROM invoice_items WHERE invoice_id = ?', id);
    for (const item of items) {
      if (item.product_id) {
        q.run(`UPDATE products SET stock = round(stock + ?, 2), updated_at = datetime('now','localtime') WHERE id = ?`, item.qty, item.product_id);
        q.run('INSERT INTO stock_movements(product_id, delta, reason, ref, created_at) VALUES (?,?,?,?,datetime(\'now\',\'localtime\'))', item.product_id, item.qty, 'sale-reversal', invoice.invoice_no);
      }
    }
    q.run('DELETE FROM invoices WHERE id = ?', id);
  });
  res.json({ ok: true });
});

// ============================================================ purchases
app.get('/api/purchases', requireAuth, (req, res) => {
  const { q: search, from, to, page = '1', pageSize = '12' } = req.query;
  let where = 'WHERE 1=1';
  const params = [];
  if (search) { where += ' AND (purchase_no LIKE ? OR supplier_name LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
  if (from) { where += ' AND date(date) >= date(?)'; params.push(from); }
  if (to) { where += ' AND date(date) <= date(?)'; params.push(to); }
  const total = Number(q.get(`SELECT COUNT(*) AS n FROM purchases ${where}`, ...params).n);
  const ps = Math.min(100, Math.max(1, Number(pageSize) || 12));
  const pg = Math.max(1, Number(page) || 1);
  const rows = q.all(`SELECT * FROM purchases ${where} ORDER BY id DESC LIMIT ? OFFSET ?`, ...params, ps, (pg - 1) * ps);
  const summary = q.get(`SELECT COALESCE(SUM(grand_total),0) AS total, COUNT(*) AS n FROM purchases`);
  res.json({ rows, total, page: pg, pageSize: ps, summary: { total: round2(Number(summary.total)), count: Number(summary.n) } });
});

app.get('/api/purchases/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const purchase = q.get('SELECT * FROM purchases WHERE id = ?', id);
  if (!purchase) return res.status(404).json({ error: 'Purchase not found.' });
  purchase.items = q.all('SELECT * FROM purchase_items WHERE purchase_id = ? ORDER BY id', id);
  res.json(purchase);
});

const purchaseItemSchema = z.object({
  product_id: z.number().int().positive(),
  qty: z.number().positive().max(1000000),
  cost: z.number().min(0).max(100000000),
  tax_rate: z.number().min(0).max(100).optional().default(0),
});

const purchaseSchema = z.object({
  supplier_id: z.number().int().positive().nullable().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}:\d{2})?$/).optional(),
  paid: z.number().min(0).nullable().optional(),
  status: z.enum(['received', 'pending']).optional().default('received'),
  notes: z.string().trim().max(500).optional().default(''),
  items: z.array(purchaseItemSchema).min(1, 'Add at least one item.').max(200),
});

app.post('/api/purchases', requireAuth, (req, res) => {
  const parsed = purchaseSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues?.[0]?.message || 'Check the purchase.' });
  const d = parsed.data;
  try {
    const result = transaction(() => {
      let subtotal = 0, taxTotal = 0;
      const lines = [];
      for (const item of d.items) {
        const prod = q.get('SELECT * FROM products WHERE id = ?', item.product_id);
        if (!prod) throw httpError(400, 'A product in the purchase no longer exists.');
        const taxable = round2(item.qty * item.cost);
        const tax = round2((taxable * (item.tax_rate || 0)) / 100);
        subtotal = round2(subtotal + taxable);
        taxTotal = round2(taxTotal + tax);
        lines.push({ item, prod, taxable, tax, total: round2(taxable + tax) });
      }
      const grand = round2(subtotal + taxTotal);
      const paid = d.paid == null ? grand : Math.min(d.paid, grand);
      const business = q.get('SELECT * FROM business WHERE id = 1');
      const seq = nextCounter('purchase');
      const purchaseNo = `${business.purchase_prefix || 'PUR'}-${String(seq).padStart(4, '0')}`;
      const stamp = d.date || nowLocal();
      const supplierName = d.supplier_id ? (q.get('SELECT name FROM suppliers WHERE id = ?', d.supplier_id)?.name || '') : '';
      const r = q.run(`INSERT INTO purchases(purchase_no, supplier_id, supplier_name, date, subtotal, tax_total, grand_total, paid, status, notes, created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`, purchaseNo, d.supplier_id ?? null, supplierName, stamp, subtotal, taxTotal, grand, paid, d.status, d.notes, stamp);
      const purchaseId = Number(r.lastInsertRowid);
      for (const { item, prod, taxable, tax, total } of lines) {
        q.run(`INSERT INTO purchase_items(purchase_id, product_id, name, qty, cost, tax_rate, taxable, tax_amount, line_total)
          VALUES (?,?,?,?,?,?,?,?,?)`, purchaseId, prod.id, prod.name, item.qty, item.cost, item.tax_rate || 0, taxable, tax, total);
        if (d.status === 'received') {
          q.run(`UPDATE products SET stock = round(stock + ?, 2), cost = ?, updated_at = datetime('now','localtime') WHERE id = ?`, item.qty, item.cost, prod.id);
          q.run('INSERT INTO stock_movements(product_id, delta, reason, ref, created_at) VALUES (?,?,?,?,?)', prod.id, item.qty, 'purchase', purchaseNo, stamp);
        }
      }
      return purchaseId;
    });
    const purchase = q.get('SELECT * FROM purchases WHERE id = ?', result);
    purchase.items = q.all('SELECT * FROM purchase_items WHERE purchase_id = ? ORDER BY id', result);
    res.status(201).json(purchase);
  } catch (err) {
    if (err.expose) return res.status(err.status || 400).json({ error: err.message });
    throw err;
  }
});

app.delete('/api/purchases/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const purchase = q.get('SELECT * FROM purchases WHERE id = ?', id);
  if (!purchase) return res.status(404).json({ error: 'Purchase not found.' });
  transaction(() => {
    const items = q.all('SELECT * FROM purchase_items WHERE purchase_id = ?', id);
    for (const item of items) {
      if (item.product_id) {
        q.run(`UPDATE products SET stock = MAX(0, round(stock - ?, 2)) WHERE id = ?`, item.qty, item.product_id);
        q.run('INSERT INTO stock_movements(product_id, delta, reason, ref, created_at) VALUES (?,?,?,?,datetime(\'now\',\'localtime\'))', item.product_id, -item.qty, 'purchase-reversal', purchase.purchase_no);
      }
    }
    q.run('DELETE FROM purchases WHERE id = ?', id);
  });
  res.json({ ok: true });
});

// ============================================================ expenses
export const EXPENSE_CATEGORIES = ['Rent', 'Salary', 'Utilities', 'Transport', 'Packaging', 'Marketing', 'Repair & Maintenance', 'Miscellaneous'];

app.get('/api/expenses', requireAuth, (req, res) => {
  const { q: search, category, month } = req.query;
  let where = 'WHERE 1=1';
  const params = [];
  if (search) { where += ' AND (category LIKE ? OR notes LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
  if (category) { where += ' AND category LIKE ?'; params.push(`%${category}%`); }
  if (month) { where += " AND strftime('%Y-%m', date) = ?"; params.push(month); }
  const rows = q.all(`SELECT * FROM expenses ${where} ORDER BY date DESC, id DESC LIMIT 300`, ...params);
  const monthTotal = q.get(`SELECT COALESCE(SUM(amount),0) AS total FROM expenses WHERE strftime('%Y-%m', date) = strftime('%Y-%m', date('now','localtime'))`);
  const byCategory = q.all(`SELECT category, COALESCE(SUM(amount),0) AS total FROM expenses
    WHERE strftime('%Y-%m', date) = strftime('%Y-%m', date('now','localtime')) GROUP BY category ORDER BY total DESC`);
  res.json({ rows, monthTotal: round2(Number(monthTotal.total)), byCategory: byCategory.map((r) => ({ category: r.category, total: round2(Number(r.total)) })) });
});

const expenseSchema = z.object({
  category: z.string().trim().min(2).max(80),
  amount: z.number().positive().max(100000000),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}:\d{2})?$/).optional(),
  payment_method: z.enum(['cash', 'upi', 'card', 'bank']).default('cash'),
  notes: z.string().trim().max(300).optional().default(''),
});

app.post('/api/expenses', requireAuth, (req, res) => {
  const parsed = expenseSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues?.[0]?.message || 'Check the expense.' });
  const d = parsed.data;
  const stamp = d.date || nowLocal();
  const r = q.run('INSERT INTO expenses(category, amount, date, payment_method, notes, created_at) VALUES (?,?,?,?,?,?)',
    d.category, d.amount, stamp, d.payment_method, d.notes, stamp);
  res.status(201).json(q.get('SELECT * FROM expenses WHERE id = ?', Number(r.lastInsertRowid)));
});

app.put('/api/expenses/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const existing = q.get('SELECT * FROM expenses WHERE id = ?', id);
  if (!existing) return res.status(404).json({ error: 'Expense not found.' });
  const parsed = expenseSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues?.[0]?.message || 'Check the expense.' });
  const d = parsed.data;
  const stamp = d.date || existing.date;
  q.run('UPDATE expenses SET category=?, amount=?, date=?, payment_method=?, notes=? WHERE id=?',
    d.category, d.amount, stamp, d.payment_method, d.notes, id);
  res.json(q.get('SELECT * FROM expenses WHERE id = ?', id));
});

app.delete('/api/expenses/:id', requireAdmin, (req, res) => {
  q.run('DELETE FROM expenses WHERE id = ?', Number(req.params.id));
  res.json({ ok: true });
});

// ============================================================ reports
function rangeOrDefault(req) {
  const to = req.query.to && /^\d{4}-\d{2}-\d{2}$/.test(req.query.to) ? req.query.to : isoDate(new Date());
  let from = req.query.from && /^\d{4}-\d{2}-\d{2}$/.test(req.query.from) ? req.query.from : null;
  if (!from) { const d = new Date(); d.setDate(d.getDate() - 29); from = isoDate(d); }
  return { from, to };
}

app.get('/api/reports/summary', requireAuth, (req, res) => {
  const { from, to } = rangeOrDefault(req);
  const kpis = q.get(`SELECT COUNT(*) AS invoices, COALESCE(SUM(grand_total),0) AS revenue, COALESCE(SUM(discount),0) AS discount,
      COALESCE(SUM(tax_total),0) AS tax, COALESCE(SUM(paid),0) AS collected
    FROM invoices WHERE date(date) >= date(?) AND date(date) <= date(?)`, from, to);
  const items = q.all(`SELECT ii.qty, ii.taxable, ii.tax_rate, ii.product_id, p.cost, p.name
    FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id LEFT JOIN products p ON p.id = ii.product_id
    WHERE date(i.date) >= date(?) AND date(i.date) <= date(?)`, from, to);
  let itemsSold = 0, profit = 0;
  for (const it of items) {
    itemsSold += Number(it.qty);
    profit += Number(it.taxable) - Number(it.qty) * (it.cost ?? 0);
  }
  const expenses = q.get(`SELECT COALESCE(SUM(amount),0) AS total FROM expenses WHERE date(date) >= date(?) AND date(date) <= date(?)`, from, to);
  const discount = Number(kpis.discount);
  const grossProfit = round2(profit - discount);
  const days = Math.max(1, Math.round((new Date(to) - new Date(from)) / 86400000) + 1);
  const prevTo = new Date(from); prevTo.setDate(prevTo.getDate() - 1);
  const prevFrom = new Date(prevTo); prevFrom.setDate(prevFrom.getDate() - (days - 1));
  const prev = q.get(`SELECT COALESCE(SUM(grand_total),0) AS revenue, COUNT(*) AS invoices FROM invoices WHERE date(date) >= date(?) AND date(date) <= date(?)`, isoDate(prevFrom), isoDate(prevTo));

  // daily series
  const dailyRows = q.all(`SELECT date(date) AS day, SUM(grand_total) AS total, COUNT(*) AS invoices
    FROM invoices WHERE date(date) >= date(?) AND date(date) <= date(?) GROUP BY date(date) ORDER BY day`, from, to);
  const byDay = [];
  for (let d = new Date(from); d <= new Date(to); d.setDate(d.getDate() + 1)) {
    const key = isoDate(d);
    const found = dailyRows.find((r) => r.day === key);
    byDay.push({ day: key, total: found ? round2(Number(found.total)) : 0, invoices: found ? Number(found.invoices) : 0 });
  }

  const byPayment = q.all(`SELECT payment_method AS method, SUM(grand_total) AS total, COUNT(*) AS n
    FROM invoices WHERE date(date) >= date(?) AND date(date) <= date(?) GROUP BY payment_method ORDER BY total DESC`, from, to)
    .map((r) => ({ method: r.method, total: round2(Number(r.total)), n: Number(r.n) }));

  const topProducts = q.all(`SELECT ii.name, SUM(ii.qty) AS qty, SUM(ii.line_total) AS revenue
    FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id
    WHERE date(i.date) >= date(?) AND date(i.date) <= date(?)
    GROUP BY ii.name ORDER BY revenue DESC LIMIT 8`, from, to)
    .map((r) => ({ ...r, qty: round2(Number(r.qty)), revenue: round2(Number(r.revenue)) }));

  const byCategory = q.all(`SELECT COALESCE(c.name,'Uncategorised') AS category, COALESCE(c.color,'#8a93a6') AS color, SUM(ii.line_total) AS revenue
    FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id
    LEFT JOIN products p ON p.id = ii.product_id LEFT JOIN categories c ON c.id = p.category_id
    WHERE date(i.date) >= date(?) AND date(i.date) <= date(?)
    GROUP BY category ORDER BY revenue DESC`, from, to)
    .map((r) => ({ ...r, revenue: round2(Number(r.revenue)) }));

  const gst = q.all(`SELECT ii.tax_rate AS rate, SUM(ii.taxable) AS taxable, SUM(ii.tax_amount) AS tax
    FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id
    WHERE date(i.date) >= date(?) AND date(i.date) <= date(?) GROUP BY ii.tax_rate ORDER BY ii.tax_rate`, from, to)
    .map((r) => ({ rate: Number(r.rate), taxable: round2(Number(r.taxable)), tax: round2(Number(r.tax)), cgst: round2(Number(r.tax) / 2), sgst: round2(Number(r.tax) / 2) }));

  const revenue = Number(kpis.revenue);
  const expenseTotal = Number(expenses.total);
  res.json({
    from, to,
    kpis: {
      revenue: round2(revenue), invoices: Number(kpis.invoices), itemsSold: round2(itemsSold),
      avgBill: kpis.invoices ? round2(revenue / Number(kpis.invoices)) : 0,
      taxCollected: round2(Number(kpis.tax)),
      collected: round2(Number(kpis.collected)),
      expenses: round2(expenseTotal),
      grossProfit,
      netProfit: round2(grossProfit - expenseTotal),
    },
    previous: { revenue: round2(Number(prev.revenue)), invoices: Number(prev.invoices) },
    byDay, byPayment, topProducts, byCategory, gst,
  });
});

app.get('/api/reports/export', requireAuth, (req, res) => {
  const { from, to } = rangeOrDefault(req);
  const rows = q.all(`SELECT invoice_no, date, customer_name, subtotal, discount, tax_total, grand_total, paid,
      (grand_total - paid) AS balance, status, payment_method
    FROM invoices WHERE date(date) >= date(?) AND date(date) <= date(?) ORDER BY id ASC`, from, to);
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const header = ['Invoice No', 'Date', 'Customer', 'Subtotal', 'Discount', 'Tax', 'Grand Total', 'Paid', 'Balance', 'Status', 'Payment Method'];
  const lines = [header.map(esc).join(',')];
  for (const r of rows) {
    lines.push([r.invoice_no, r.date, r.customer_name, r.subtotal, r.discount, r.tax_total, r.grand_total, r.paid, round2(r.grand_total - r.paid), r.status, r.payment_method].map(esc).join(','));
  }
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="shopdesk-sales-${from}-to-${to}.csv"`);
  res.send(lines.join('\n'));
});

// ============================================================ settings & backup
app.get('/api/settings', requireAuth, (req, res) => {
  res.json(q.get('SELECT * FROM business WHERE id = 1'));
});

const settingsSchema = z.object({
  name: z.string().trim().min(2).max(120),
  owner_name: z.string().trim().max(120).optional().default(''),
  email: z.string().trim().max(120).optional().default(''),
  phone: z.string().trim().max(30).optional().default(''),
  address: z.string().trim().max(240).optional().default(''),
  city: z.string().trim().max(80).optional().default(''),
  state: z.string().trim().max(80).optional().default(''),
  pincode: z.string().trim().max(12).optional().default(''),
  gstin: z.string().trim().max(20).optional().default(''),
  invoice_prefix: z.string().trim().min(1).max(8).regex(/^[A-Za-z0-9]+$/, 'Letters and numbers only.'),
  purchase_prefix: z.string().trim().min(1).max(8).regex(/^[A-Za-z0-9]+$/, 'Letters and numbers only.'),
  upi_id: z.string().trim().max(60).optional().default(''),
  currency: z.enum(['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD']),
  footer_note: z.string().trim().max(300).optional().default(''),
  terms: z.string().trim().max(300).optional().default(''),
});

app.put('/api/settings', requireAdmin, (req, res) => {
  const parsed = settingsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues?.[0]?.message || 'Check the settings.' });
  const d = parsed.data;
  q.run(`UPDATE business SET name=?, owner_name=?, email=?, phone=?, address=?, city=?, state=?, pincode=?, gstin=?, invoice_prefix=?, purchase_prefix=?, upi_id=?, currency=?, footer_note=?, terms=? WHERE id = 1`,
    d.name, d.owner_name, d.email, d.phone, d.address, d.city, d.state, d.pincode, d.gstin.toUpperCase(), d.invoice_prefix.toUpperCase(), d.purchase_prefix.toUpperCase(), d.upi_id, d.currency, d.footer_note, d.terms);
  res.json(q.get('SELECT * FROM business WHERE id = 1'));
});

const BACKUP_TABLES = ['counters', 'business', 'users', 'categories', 'products', 'customers', 'suppliers', 'invoices', 'invoice_items', 'payments', 'purchases', 'purchase_items', 'expenses', 'stock_movements'];

app.get('/api/backup', requireAdmin, (req, res) => {
  const tables = {};
  for (const t of BACKUP_TABLES) tables[t] = q.all(`SELECT * FROM ${t}`);
  res.setHeader('Content-Disposition', `attachment; filename="shopdesk-backup-${isoDate(new Date())}.json"`);
  res.json({ app: 'shopdesk', version: 2, exported_at: new Date().toISOString(), tables });
});

app.post('/api/restore', requireAdmin, (req, res) => {
  const body = req.body;
  if (!body || typeof body !== 'object' || !body.tables || typeof body.tables !== 'object') {
    return res.status(400).json({ error: 'Not a valid shopdesk backup file.' });
  }
  const missing = BACKUP_TABLES.filter((t) => !Array.isArray(body.tables[t]));
  if (missing.length) return res.status(400).json({ error: `Backup is missing tables: ${missing.join(', ')}` });
  try {
    transaction(() => {
      db.exec('DELETE FROM sessions');
      for (const t of [...BACKUP_TABLES].reverse()) db.exec(`DELETE FROM ${t}`);
      for (const t of BACKUP_TABLES) {
        const rows = body.tables[t];
        if (!rows.length) continue;
        const cols = Object.keys(rows[0]);
        const placeholders = cols.map(() => '?').join(',');
        const stmt = db.prepare(`INSERT INTO ${t}(${cols.join(',')}) VALUES (${placeholders})`);
        for (const row of rows) stmt.run(...cols.map((c) => (row[c] === undefined ? null : row[c])));
      }
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('Restore failed:', err);
    res.status(400).json({ error: 'Restore failed — the backup file looks corrupt.' });
  }
});

app.post('/api/reset-demo', requireAdmin, (req, res) => {
  seedDatabase();
  res.json({ ok: true });
});

// ============================================================ search (command palette)
app.get('/api/search', requireAuth, (req, res) => {
  const search = String(req.query.q || '').trim();
  if (search.length < 2) return res.json({ products: [], customers: [], invoices: [], actions: [] });
  const like = `%${search}%`;
  const products = q.all(`SELECT id, name, sku, price, stock, unit FROM products WHERE name LIKE ? OR sku LIKE ? OR barcode LIKE ? ORDER BY name LIMIT 6`, like, like, like);
  const customers = q.all(`SELECT id, name, phone FROM customers WHERE name LIKE ? OR phone LIKE ? ORDER BY name LIMIT 5`, like, like);
  const invoices = q.all(`SELECT id, invoice_no, customer_name, grand_total, status, date FROM invoices WHERE invoice_no LIKE ? OR customer_name LIKE ? ORDER BY id DESC LIMIT 5`, like, like);
  res.json({ products, customers, invoices });
});

// ============================================================ UPI QR for billing
const qrCache = new Map();
app.get('/api/pay-qr', requireAuth, asyncRoute(async (req, res) => {
  const amount = Math.max(0, Number(req.query.amount) || 0);
  const note = String(req.query.note || 'Bill').slice(0, 60);
  const business = q.get('SELECT name, upi_id FROM business WHERE id = 1');
  const upi = business?.upi_id || 'shopdesk@upi';
  const key = `${upi}|${amount.toFixed(2)}|${note}`;
  let dataUrl = qrCache.get(key);
  if (!dataUrl) {
    const payload = `upi://pay?pa=${encodeURIComponent(upi)}&pn=${encodeURIComponent((business?.name || 'shopdesk').slice(0, 50))}&am=${amount.toFixed(2)}&cu=INR&tn=${encodeURIComponent(note)}`;
    dataUrl = await QRCode.toDataURL(payload, { width: 220, margin: 1, color: { dark: '#0a0e17', light: '#ffffff' } });
    if (qrCache.size > 120) qrCache.clear();
    qrCache.set(key, dataUrl);
  }
  res.json({ qr: dataUrl, upi });
}));

// ============================================================ static hosting + SPA fallback
if (fs.existsSync(DIST)) {
  app.use(express.static(DIST, { maxAge: '1h', index: false }));
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api')) return res.sendFile(path.join(DIST, 'index.html'));
    next();
  });
}

// ============================================================ errors
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  if (err?.type === 'entity.parse.failed' || err?.type === 'entity.too.large') {
    return res.status(400).json({ error: 'Bad request body.' });
  }
  console.error('API error:', err);
  res.status(err?.status || 500).json({ error: err?.expose ? err.message : 'Something went wrong on the server.' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`shopdesk server on http://0.0.0.0:${PORT} (DB: ${process.env.SHOPDESK_DB || 'data/shopdesk.sqlite'})`);
});
