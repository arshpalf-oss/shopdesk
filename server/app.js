// shopdesk — API application (Express). Business logic is identical for
// local dev, Docker and Vercel serverless; the entry point decides how to serve.
import express from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import QRCode from 'qrcode';
import { models, round2, fmtDateTime, nowLocal, isoDate, dayRange, rangeBounds, nextCounter, isValidId, asId } from './db.js';
import { attachUser, requireAuth, requireAdmin, hashPassword, verifyPassword, createSession, destroySession, sessionCookie, clearSessionCookie, COOKIE } from './auth.js';
import { clearBusinessData, seedBusinessData } from './seed.js';
import { computeLine, invoiceStatus, gstSplit } from './billing.js';

export const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true); // Vercel / proxies set x-forwarded-proto
app.use(express.json({ limit: '25mb' })); // headroom for backup restore
app.use(attachUser);

const httpError = (status, message) => Object.assign(new Error(message), { status, expose: true });
const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const dup = (err) => err?.code === 11000 || String(err?.message || '').includes('E11000');
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const J = (doc) => (doc ? doc.toJSON() : null);
const JAll = (docs) => docs.map((d) => d.toJSON());
const bId = (req) => req.businessId;
const L = (doc) => {
  if (!doc) return doc;
  const { _id, __v, businessId, ...rest } = doc;
  const out = { ...rest, id: String(_id) };
  if (out.category_id != null) out.category_id = String(out.category_id);
  return out;
};
const LAll = (docs) => docs.map(L);

// attach a category name/color (left-join equivalent) to product docs
async function withCategoryInfo(req, products) {
  const categories = await models.Category.find({ businessId: bId(req) }).lean();
  const byId = new Map(categories.map((c) => [String(c._id), c]));
  return products.map((p) => ({
    ...L(p),
    category_name: p.category_id ? byId.get(String(p.category_id))?.name || null : null,
    category_color: p.category_id ? byId.get(String(p.category_id))?.color || null : null,
  }));
}

// ============================================================ health
app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'shopdesk', ts: Date.now() }));

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

const credsSchema = z.object({
  email: z.string().email().max(160),
  password: z.string().min(1).max(200),
});

async function signIn(res, user, req) {
  const token = await createSession(user);
  const secure = req.headers['x-forwarded-proto'] === 'https' || req.secure || req.protocol === 'https';
  res.setHeader('Set-Cookie', sessionCookie(token, secure));
  return { id: String(user._id), name: user.name, email: user.email, role: user.role, businessId: String(user.businessId) };
}

app.post('/api/auth/login', asyncRoute(async (req, res) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
  if (!loginRateLimitOk(ip)) return res.status(429).json({ error: 'Too many attempts. Try again in a few minutes.' });
  const parsed = credsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Enter a valid email and password.' });
  const user = await models.User.findOne({ email: parsed.data.email.toLowerCase().trim() });
  if (!user || !verifyPassword(parsed.data.password, user.password_hash)) {
    return res.status(401).json({ error: 'Wrong email or password.' });
  }
  res.json({ user: await signIn(res, user, req) });
}));

const signupSchema = z.object({
  businessName: z.string().trim().min(2, 'Tell us your business name.').max(120),
  name: z.string().trim().min(2, 'Enter your name.').max(80),
  email: z.string().email('Enter a valid email.').max(160),
  password: z.string().min(8, 'Use at least 8 characters.').max(200),
  withSampleData: z.boolean().optional().default(true),
});

app.post('/api/auth/signup', asyncRoute(async (req, res) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error?.issues?.[0]?.message || 'Check the form.' });
  const d = parsed.data;
  const email = d.email.toLowerCase().trim();
  const exists = await models.User.findOne({ email }).lean();
  if (exists) return res.status(409).json({ error: 'An account with that email already exists. Try signing in.' });

  const business = await models.Business.create({
    name: d.businessName.trim(),
    owner_name: d.name.trim(),
    email,
    invoice_prefix: 'INV',
    purchase_prefix: 'PUR',
    plan: 'trial',
    trial_ends_at: new Date(Date.now() + 14 * 86400 * 1000),
  });
  let user;
  try {
    user = await models.User.create({ businessId: business._id, name: d.name.trim(), email, password_hash: hashPassword(d.password), role: 'admin' });
  } catch (err) {
    await models.Business.deleteOne({ _id: business._id }).catch(() => {});
    if (dup(err)) return res.status(409).json({ error: 'An account with that email already exists. Try signing in.' });
    throw err;
  }

  // optional sample catalogue so the new workspace feels alive
  if (d.withSampleData) {
    try {
      await seedBusinessData(business._id);
    } catch (err) {
      console.error('Sample data seed failed for new workspace:', err);
      // workspace exists and is usable — report partial success, don't block signup
    }
  }

  res.status(201).json({ user: await signIn(res, user, req), businessId: String(business._id) });
}));

app.post('/api/auth/logout', asyncRoute(async (req, res) => {
  if (req.sessionToken) await destroySession(req.sessionToken).catch(() => {});
  res.setHeader('Set-Cookie', clearSessionCookie());
  res.json({ ok: true });
}));

app.get('/api/auth/me', (req, res) => {
  res.json({ user: req.user });
});

app.put('/api/auth/profile', requireAuth, asyncRoute(async (req, res) => {
  const parsed = z.object({ name: z.string().trim().min(2).max(80) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Enter a valid name.' });
  await models.User.updateOne({ _id: asId(req.user.id) }, { $set: { name: parsed.data.name } });
  res.json({ user: { ...req.user, name: parsed.data.name } });
}));

app.post('/api/auth/change-password', requireAuth, asyncRoute(async (req, res) => {
  const parsed = z.object({ current: z.string().min(1), next: z.string().min(8, 'Use at least 8 characters.').max(200) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error?.issues?.[0]?.message || 'Check the password fields.' });
  const user = await models.User.findById(asId(req.user.id));
  if (!verifyPassword(parsed.data.current, user.password_hash)) return res.status(400).json({ error: 'Current password is wrong.' });
  user.password_hash = hashPassword(parsed.data.next);
  await user.save();
  res.json({ ok: true });
}));

// ============================================================ dashboard
async function sumInvoices(match) {
  const rows = await models.Invoice.aggregate([
    { $match: match },
    { $group: { _id: null, sales: { $sum: '$grand_total' }, invoices: { $sum: 1 } } },
  ]);
  return rows[0] || { sales: 0, invoices: 0 };
}

app.get('/api/dashboard', requireAuth, asyncRoute(async (req, res) => {
  const today = isoDate(new Date());
  const y = new Date(); y.setDate(y.getDate() - 1);
  const yesterday = isoDate(y);
  const monthStart = `${today.slice(0, 8)}01`;
  const monthStartStamp = `${monthStart} 00:00:00`;
  const py = new Date(); py.setMonth(py.getMonth() - 1);
  const prevMonthStart = isoDate(new Date(py.getFullYear(), py.getMonth(), 1));
  const prevMonthEnd = isoDate(new Date(py.getFullYear(), py.getMonth() + 1, 0));
  const todayRange = dayRange(today);
  const yRange = dayRange(yesterday);
  const prevRange = rangeBounds(prevMonthStart, prevMonthEnd);
  const last30 = new Date(); last30.setDate(last30.getDate() - 29);
  const last30From = isoDate(last30);

  const id = bId(req);
  const [todayStats, yStats, monthStats, prevMonth, monthExpenses, outstandingAgg, stockAgg] = await Promise.all([
    sumInvoices({ businessId: id, date: { $gte: todayRange.start, $lt: todayRange.end } }),
    sumInvoices({ businessId: id, date: { $gte: yRange.start, $lt: yRange.end } }),
    sumInvoices({ businessId: id, date: { $gte: monthStartStamp } }),
    sumInvoices({ businessId: id, date: { $gte: prevRange.start, $lte: prevRange.end } }),
    models.Expense.aggregate([
      { $match: { businessId: id, date: { $gte: monthStartStamp } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    models.Invoice.aggregate([
      { $match: { businessId: id, status: { $ne: 'paid' } } },
      { $group: { _id: null, total: { $sum: { $subtract: ['$grand_total', '$paid'] } }, n: { $sum: 1 } } },
    ]),
    models.Product.aggregate([
      { $match: { businessId: id } },
      { $group: { _id: null, value: { $sum: { $multiply: ['$stock', '$cost'] } }, units: { $sum: 1 } } },
    ]),
  ]);

  const todayItems = await models.InvoiceItem.aggregate([
    { $match: { businessId: id, date: { $gte: todayRange.start, $lt: todayRange.end } } },
    { $group: { _id: null, qty: { $sum: '$qty' } } },
  ]);

  const lowStockDocs = await models.Product.find({ businessId: id, $expr: { $lte: ['$stock', '$reorder_level'] } })
    .sort({ stock: 1 }).limit(8).lean();
  const lowStock = await withCategoryInfo(req, lowStockDocs);
  const lowStockCount = await models.Product.countDocuments({ businessId: id, $expr: { $lte: ['$stock', '$reorder_level'] } });

  const topProducts = await models.InvoiceItem.aggregate([
    { $match: { businessId: id, date: { $gte: `${last30From} 00:00:00` } } },
    { $group: { _id: '$name', qty: { $sum: '$qty' }, revenue: { $sum: '$line_total' } } },
    { $sort: { qty: -1 } },
    { $limit: 6 },
    { $project: { _id: 0, name: '$_id', qty: 1, revenue: 1 } },
  ]);

  const recentInvoices = JAll(await models.Invoice.find({ businessId: id }).sort({ _id: -1 }).limit(6)
    .select('invoice_no customer_name grand_total paid status payment_method date'));
  const ticker = JAll(await models.Invoice.find({ businessId: id }).sort({ _id: -1 }).limit(10)
    .select('invoice_no customer_name grand_total payment_method date'));

  const salesByDayRows = await models.Invoice.aggregate([
    { $match: { businessId: id, date: { $gte: `${last30From} 00:00:00` } } },
    { $group: { _id: { $substr: ['$date', 0, 10] }, total: { $sum: '$grand_total' }, invoices: { $sum: 1 } } },
  ]);
  const series = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = isoDate(d);
    const found = salesByDayRows.find((r) => r._id === key);
    series.push({ day: key, total: found ? round2(found.total) : 0, invoices: found ? found.invoices : 0 });
  }

  const paymentModes = (await models.Invoice.aggregate([
    { $match: { businessId: id, date: { $gte: monthStartStamp } } },
    { $group: { _id: '$payment_method', total: { $sum: '$grand_total' }, n: { $sum: 1 } } },
    { $sort: { total: -1 } },
  ])).map((p) => ({ method: p._id, total: round2(p.total), n: p.n }));

  const profitAgg = await models.InvoiceItem.aggregate([
    { $match: { businessId: id, date: { $gte: monthStartStamp } } },
    { $group: { _id: null, profit: { $sum: { $subtract: ['$taxable', { $multiply: ['$qty', '$cost'] }] } } } },
  ]);

  const expensesTotal = round2(monthExpenses[0]?.total || 0);
  res.json({
    today: { sales: round2(todayStats.sales), invoices: todayStats.invoices, items: round2(todayItems[0]?.qty || 0) },
    yesterday: { sales: round2(yStats.sales), invoices: yStats.invoices },
    month: {
      sales: round2(monthStats.sales), invoices: monthStats.invoices,
      expenses: expensesTotal,
      profit: round2((profitAgg[0]?.profit || 0) - expensesTotal),
    },
    prevMonthSales: round2(prevMonth.sales),
    outstanding: { total: round2(outstandingAgg[0]?.total || 0), invoices: outstandingAgg[0]?.n || 0 },
    stockValue: round2(stockAgg[0]?.value || 0),
    lowStock,
    lowStockCount,
    topProducts,
    recentInvoices,
    ticker,
    salesByDay: series,
    paymentModes,
  });
}));

// ============================================================ products
const productSchema = z.object({
  sku: z.string().trim().min(1).max(60),
  barcode: z.string().trim().max(64).optional().default(''),
  name: z.string().trim().min(2).max(200),
  category_id: z.string().refine((v) => isValidId(v) || v === '', 'Bad category').nullable().optional().transform((v) => v || null),
  unit: z.string().trim().min(1).max(20).default('pcs'),
  price: z.number().min(0),
  cost: z.number().min(0).default(0),
  tax_rate: z.number().min(0).max(100).default(0),
  stock: z.number().min(0).default(0),
  reorder_level: z.number().min(0).default(0),
  favorite: z.boolean().optional().default(false),
});

app.get('/api/products', requireAuth, asyncRoute(async (req, res) => {
  const { q: search, category_id, stock, sort } = req.query;
  const filter = { businessId: bId(req) };
  if (search) {
    const rx = new RegExp(escapeRegExp(String(search).trim()), 'i');
    filter.$or = [{ name: rx }, { sku: rx }, { barcode: rx }];
  }
  if (category_id && isValidId(category_id)) filter.category_id = asId(category_id);
  if (stock === 'low') filter.$expr = { $and: [{ $gt: ['$stock', 0] }, { $lte: ['$stock', '$reorder_level'] }] };
  if (stock === 'out') filter.stock = { $lte: 0 };
  const order = sort === 'price' ? { price: -1 } : sort === 'stock' ? { stock: 1 } : { name: 1 };
  const docs = await models.Product.find(filter).sort(order).lean();
  res.json(await withCategoryInfo(req, docs));
}));

app.post('/api/products', requireAuth, asyncRoute(async (req, res) => {
  const parsed = productSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues?.[0]?.message || 'Check the product fields.' });
  const d = parsed.data;
  try {
    const product = await models.Product.create({
      ...d,
      businessId: bId(req),
      category_id: d.category_id ? asId(d.category_id) : null,
      sku: d.sku.trim(),
      updated_at: nowLocal(),
    });
    if (d.stock > 0) {
      await models.StockMovement.create({ businessId: bId(req), product_id: product._id, delta: d.stock, reason: 'opening', ref: 'Opening stock', created_at: nowLocal() });
    }
    res.status(201).json(J(product));
  } catch (err) {
    if (dup(err)) return res.status(409).json({ error: `SKU “${d.sku}” already exists.` });
    throw err;
  }
}));

app.put('/api/products/:id', requireAuth, asyncRoute(async (req, res) => {
  const { id } = req.params;
  if (!isValidId(id)) return res.status(400).json({ error: 'Bad product id.' });
  const existing = await models.Product.findOne({ _id: asId(id), businessId: bId(req) });
  if (!existing) return res.status(404).json({ error: 'Product not found.' });
  const parsed = productSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues?.[0]?.message || 'Check the product fields.' });
  const d = parsed.data;
  const prevStock = existing.stock;
  try {
    existing.set({
      ...d,
      category_id: d.category_id ? asId(d.category_id) : null,
      sku: d.sku.trim(),
      updated_at: nowLocal(),
    });
    await existing.save();
    const delta = round2(d.stock - prevStock);
    if (delta !== 0) {
      await models.StockMovement.create({ businessId: bId(req), product_id: existing._id, delta, reason: 'adjustment', ref: 'Manual edit', created_at: nowLocal() });
    }
    res.json(J(existing));
  } catch (err) {
    if (dup(err)) return res.status(409).json({ error: `SKU “${d.sku}” already exists.` });
    throw err;
  }
}));

app.delete('/api/products/:id', requireAdmin, asyncRoute(async (req, res) => {
  const { id } = req.params;
  if (!isValidId(id)) return res.status(400).json({ error: 'Bad product id.' });
  const used = await models.InvoiceItem.countDocuments({ businessId: bId(req), product_id: asId(id) })
    + await models.PurchaseItem.countDocuments({ businessId: bId(req), product_id: asId(id) });
  if (used > 0) return res.status(409).json({ error: 'This product is used in saved bills, so it can’t be deleted. Set its stock to 0 instead.' });
  await models.Product.deleteOne({ _id: asId(id), businessId: bId(req) });
  res.json({ ok: true });
}));

app.post('/api/products/:id/adjust-stock', requireAuth, asyncRoute(async (req, res) => {
  const { id } = req.params;
  if (!isValidId(id)) return res.status(400).json({ error: 'Bad product id.' });
  const parsed = z.object({
    delta: z.number().refine((n) => n !== 0, 'Enter a non-zero quantity.').refine((n) => Math.abs(n) < 1000000),
    reason: z.string().trim().max(120).default('Adjustment'),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues?.[0]?.message || 'Check the adjustment.' });
  // atomic guarded increment — cannot drive stock negative even under races
  const updated = await models.Product.findOneAndUpdate(
    { _id: asId(id), businessId: bId(req), stock: { $gte: -parsed.data.delta } },
    { $inc: { stock: parsed.data.delta }, $set: { updated_at: nowLocal() } },
    { new: true }
  );
  if (!updated) {
    const p = await models.Product.findOne({ _id: asId(id), businessId: bId(req) }).lean();
    if (!p) return res.status(404).json({ error: 'Product not found.' });
    return res.status(400).json({ error: `Not enough stock — only ${p.stock} ${p.unit} left.` });
  }
  await models.StockMovement.create({ businessId: bId(req), product_id: updated._id, delta: parsed.data.delta, reason: 'adjustment', ref: parsed.data.reason, created_at: nowLocal() });
  res.json(J(updated));
}));

app.get('/api/products/:id/movements', requireAuth, asyncRoute(async (req, res) => {
  const { id } = req.params;
  if (!isValidId(id)) return res.status(400).json({ error: 'Bad product id.' });
  const movements = await models.StockMovement.find({ businessId: bId(req), product_id: asId(id) }).sort({ _id: -1 }).limit(60).lean();
  res.json(movements.map((m) => ({ ...L(m), product_id: String(m.product_id) })));
}));

// ============================================================ categories
app.get('/api/categories', requireAuth, asyncRoute(async (req, res) => {
  const cats = await models.Category.find({ businessId: bId(req) }).sort({ name: 1 }).lean();
  const counts = await models.Product.aggregate([
    { $match: { businessId: bId(req) } },
    { $group: { _id: '$category_id', n: { $sum: 1 } } },
  ]);
  const countByCat = new Map(counts.map((c) => [String(c._id), c.n]));
  res.json(cats.map((c) => ({ ...L(c), product_count: countByCat.get(String(c._id)) || 0 })));
}));

app.post('/api/categories', requireAuth, asyncRoute(async (req, res) => {
  const parsed = z.object({ name: z.string().trim().min(2).max(60), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().default('#a3e635') }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Give the category a name.' });
  try {
    const cat = await models.Category.create({ businessId: bId(req), name: parsed.data.name, color: parsed.data.color });
    res.status(201).json(J(cat));
  } catch (err) {
    if (dup(err)) return res.status(409).json({ error: 'That category already exists.' });
    throw err;
  }
}));

app.put('/api/categories/:id', requireAuth, asyncRoute(async (req, res) => {
  const { id } = req.params;
  if (!isValidId(id)) return res.status(400).json({ error: 'Bad category id.' });
  const parsed = z.object({ name: z.string().trim().min(2).max(60), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Give the category a name.' });
  try {
    const cat = await models.Category.findOneAndUpdate(
      { _id: asId(id), businessId: bId(req) },
      { $set: { name: parsed.data.name, ...(parsed.data.color ? { color: parsed.data.color } : {}) } },
      { new: true }
    );
    if (!cat) return res.status(404).json({ error: 'Category not found.' });
    res.json(J(cat));
  } catch (err) {
    if (dup(err)) return res.status(409).json({ error: 'That category already exists.' });
    throw err;
  }
}));

app.delete('/api/categories/:id', requireAdmin, asyncRoute(async (req, res) => {
  const { id } = req.params;
  if (!isValidId(id)) return res.status(400).json({ error: 'Bad category id.' });
  const used = await models.Product.countDocuments({ businessId: bId(req), category_id: asId(id) });
  if (used > 0) return res.status(409).json({ error: 'Move its products to another category first.' });
  await models.Category.deleteOne({ _id: asId(id), businessId: bId(req) });
  res.json({ ok: true });
}));

// ============================================================ customers & suppliers
const personSchema = z.object({
  name: z.string().trim().min(2, 'Enter the name.').max(120),
  phone: z.string().trim().max(20).optional().default(''),
  email: z.string().trim().email('Enter a valid email.').max(120).optional().or(z.literal('')).default(''),
  gstin: z.string().trim().max(20).optional().default(''),
  address: z.string().trim().max(240).optional().default(''),
  city: z.string().trim().max(60).optional().default(''),
  notes: z.string().trim().max(400).optional().default(''),
});

const escapeSearch = (s) => escapeRegExp(String(s || '').trim());
const parseLocalDay = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };

function peopleRouter({ Model, label, kind }) {
  const base = `/api/${label}`;

  app.get(base, requireAuth, asyncRoute(async (req, res) => {
    const { q: search } = req.query;
    const filter = { businessId: bId(req) };
    if (search) {
      const rx = new RegExp(escapeSearch(search), 'i');
      filter.$or = [{ name: rx }, { phone: rx }, { city: rx }];
    }
    const docs = await Model.find(filter).sort({ name: 1 }).lean();
    const ids = docs.map((d) => d._id);
    if (kind === 'customers') {
      const stats = await models.Invoice.aggregate([
        { $match: { businessId: bId(req), customer_id: { $in: ids } } },
        { $group: { _id: '$customer_id', bill_count: { $sum: 1 }, total_spent: { $sum: '$grand_total' }, outstanding: { $sum: { $subtract: ['$grand_total', '$paid'] } }, last_visit: { $max: '$date' } } },
      ]);
      const byId = new Map(stats.map((s) => [String(s._id), s]));
      return res.json(docs.map((d) => {
        const s = byId.get(String(d._id));
        return { ...L(d), bill_count: s?.bill_count || 0, total_spent: round2(s?.total_spent || 0), outstanding: round2(s?.outstanding || 0), last_visit: s?.last_visit || null };
      }));
    }
    const stats = await models.Purchase.aggregate([
      { $match: { businessId: bId(req), supplier_id: { $in: ids } } },
      { $group: { _id: '$supplier_id', purchase_count: { $sum: 1 }, total_purchased: { $sum: '$grand_total' } } },
    ]);
    const byId = new Map(stats.map((s) => [String(s._id), s]));
    res.json(docs.map((d) => {
      const s = byId.get(String(d._id));
      return { ...L(d), purchase_count: s?.purchase_count || 0, total_purchased: round2(s?.total_purchased || 0) };
    }));
  }));

  app.post(base, requireAuth, asyncRoute(async (req, res) => {
    const parsed = personSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues?.[0]?.message || `Check the ${label.slice(0, -1)} details.` });
    const d = parsed.data;
    const doc = await Model.create({ ...d, businessId: bId(req), gstin: d.gstin.toUpperCase() });
    res.status(201).json(J(doc));
  }));

  app.put(`${base}/:id`, requireAuth, asyncRoute(async (req, res) => {
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ error: 'Bad id.' });
    const parsed = personSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues?.[0]?.message || 'Check the details.' });
    const d = parsed.data;
    const doc = await Model.findOneAndUpdate(
      { _id: asId(id), businessId: bId(req) },
      { $set: { ...d, gstin: d.gstin.toUpperCase() } },
      { new: true }
    );
    if (!doc) return res.status(404).json({ error: `Not found.` });
    res.json(J(doc));
  }));

  app.delete(`${base}/:id`, requireAdmin, asyncRoute(async (req, res) => {
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ error: 'Bad id.' });
    if (label === 'customers') {
      await models.Invoice.updateMany({ businessId: bId(req), customer_id: asId(id) }, { $set: { customer_id: null } });
    } else {
      await models.Purchase.updateMany({ businessId: bId(req), supplier_id: asId(id) }, { $set: { supplier_id: null } });
    }
    await Model.deleteOne({ _id: asId(id), businessId: bId(req) });
    res.json({ ok: true });
  }));
}

peopleRouter({ Model: models.Customer, label: 'customers', kind: 'customers' });
// suppliers get their stats from purchases, not invoices
app.get('/api/customers/:id', requireAuth, asyncRoute(async (req, res) => {
  const { id } = req.params;
  if (!isValidId(id)) return res.status(400).json({ error: 'Bad id.' });
  const customer = await models.Customer.findOne({ _id: asId(id), businessId: bId(req) }).lean();
  if (!customer) return res.status(404).json({ error: 'Customer not found.' });
  const statsAgg = await models.Invoice.aggregate([
    { $match: { businessId: bId(req), customer_id: customer._id } },
    { $group: { _id: null, bill_count: { $sum: 1 }, total_spent: { $sum: '$grand_total' }, outstanding: { $sum: { $subtract: ['$grand_total', '$paid'] } }, last_visit: { $max: '$date' } } },
  ]);
  const s = statsAgg[0] || { bill_count: 0, total_spent: 0, outstanding: 0, last_visit: null };
  const recent = JAll(await models.Invoice.find({ businessId: bId(req), customer_id: customer._id })
    .sort({ _id: -1 }).limit(12).select('invoice_no date grand_total paid status payment_method'));
  res.json({
    ...L(customer),
    stats: { bill_count: s.bill_count, total_spent: round2(s.total_spent), outstanding: round2(s.outstanding), last_visit: s.last_visit },
    recentInvoices: recent,
  });
}));
peopleRouter({ Model: models.Supplier, label: 'suppliers', kind: 'suppliers' });

// ============================================================ invoices
async function getInvoiceFull(businessId, id) {
  const invoice = await models.Invoice.findOne({ _id: asId(id), businessId });
  if (!invoice) return null;
  const [items, payments, customer] = await Promise.all([
    models.InvoiceItem.find({ businessId, invoice_id: invoice._id }).sort({ _id: 1 }).lean(),
    models.Payment.find({ businessId, invoice_id: invoice._id }).sort({ _id: 1 }).lean(),
    invoice.customer_id ? models.Customer.findOne({ _id: invoice.customer_id, businessId }).lean() : null,
  ]);
  return {
    ...invoice.toJSON(),
    customer_phone: customer?.phone || '',
    customer_gstin: customer?.gstin || '',
    customer_address: customer?.address || '',
    customer_city: customer?.city || '',
    items: LAll(items),
    payments: LAll(payments),
  };
}

app.get('/api/invoices', requireAuth, asyncRoute(async (req, res) => {
  const { q: search, status, from, to, page = '1', pageSize = '20' } = req.query;
  const filter = { businessId: bId(req) };
  if (search) {
    const rx = new RegExp(escapeSearch(search), 'i');
    filter.$or = [{ invoice_no: rx }, { customer_name: rx }];
  }
  if (status && ['paid', 'partial', 'unpaid'].includes(status)) filter.status = status;
  if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) filter.date = { ...(filter.date || {}), $gte: `${from} 00:00:00` };
  if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) filter.date = { ...(filter.date || {}), $lte: `${to} 23:59:59.999` };
  const total = await models.Invoice.countDocuments(filter);
  const ps = Math.min(100, Math.max(1, Number(pageSize) || 20));
  const pg = Math.max(1, Number(page) || 1);
  const docs = await models.Invoice.find(filter)
    .sort({ _id: -1 })
    .skip((pg - 1) * ps)
    .limit(ps)
    .select('invoice_no customer_name date subtotal discount tax_total grand_total paid status payment_method')
    .lean();
  res.json({ rows: LAll(docs), total, page: pg, pageSize: ps });
}));

app.get('/api/invoices/:id', requireAuth, asyncRoute(async (req, res) => {
  const { id } = req.params;
  if (!isValidId(id)) return res.status(400).json({ error: 'Bad bill id.' });
  const invoice = await getInvoiceFull(bId(req), id);
  if (!invoice) return res.status(404).json({ error: 'Bill not found.' });
  const business = await models.Business.findById(bId(req)).lean();
  res.json({ ...invoice, business: L(business) });
}));

const invoiceItemSchema = z.object({
  product_id: z.string().refine((v) => isValidId(v) || v === '' || v == null, 'Bad product').nullable().optional().transform((v) => v || null),
  name: z.string().trim().min(1).max(200),
  qty: z.number().positive().max(100000),
  price: z.number().min(0).max(100000000),
  discount: z.number().min(0).max(100).optional().default(0),
  tax_rate: z.number().min(0).max(100).optional().default(0),
});

const invoiceSchema = z.object({
  customer_id: z.string().refine((v) => isValidId(v) || v === '' || v == null, 'Bad customer').nullable().optional().transform((v) => v || null),
  customer_name: z.string().trim().max(120).nullable().optional(),
  is_interstate: z.boolean().optional().default(false),
  discount: z.number().min(0).max(10000000).optional().default(0),
  payment_method: z.enum(['cash', 'upi', 'card', 'bank', 'credit']),
  paid: z.number().min(0).max(100000000).nullable().optional(),
  notes: z.string().trim().max(500).optional().default(''),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}:\d{2})?$/, 'Bad date').optional(),
  items: z.array(invoiceItemSchema).min(1, 'Add at least one item.').max(200),
});

app.post('/api/invoices', requireAuth, asyncRoute(async (req, res) => {
  const parsed = invoiceSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues?.[0]?.message || 'Check the bill details.' });
  const d = parsed.data;
  const id = bId(req);

  // ---- pass 1: compute lines and atomically reserve stock ----
  const lines = [];
  let gross = 0, taxableSum = 0, taxSum = 0;
  const reserved = []; // { product, qty } for compensation on failure
  try {
    for (const item of d.items) {
      let prod = null;
      if (item.product_id) {
        prod = await models.Product.findOneAndUpdate(
          { _id: asId(item.product_id), businessId: id, stock: { $gte: item.qty } },
          { $inc: { stock: -item.qty }, $set: { updated_at: nowLocal() } },
          { new: true }
        );
        if (!prod) {
          const any = await models.Product.findOne({ _id: asId(item.product_id), businessId: id }).lean();
          throw httpError(400, any
            ? `Only ${any.stock} ${any.unit} of “${any.name}” in stock.`
            : 'A product in the bill no longer exists.');
        }
        reserved.push({ productId: prod._id, qty: item.qty });
      }
      const calc = computeLine(item);
      gross = round2(gross + calc.gross);
      taxableSum = round2(taxableSum + calc.taxable);
      taxSum = round2(taxSum + calc.tax);
      lines.push({ item, calc, prod });
    }

    const { cgst, sgst, igst } = gstSplit(taxSum, d.is_interstate);
    const grand = Math.max(0, round2(taxableSum + taxSum - d.discount));
    const paid = d.paid == null ? (d.payment_method === 'credit' ? 0 : grand) : Math.min(d.paid, grand);
    const status = invoiceStatus(paid, grand);

    const business = await models.Business.findById(id).lean();
    const seq = await nextCounter(id, 'invoice');
    const invoiceNo = `${business?.invoice_prefix || 'INV'}-${String(seq).padStart(4, '0')}`;
    const stamp = d.date || nowLocal();
    let customerName = d.customer_name?.trim() || 'Walk-in Customer';
    if (d.customer_id) {
      const c = await models.Customer.findOne({ _id: asId(d.customer_id), businessId: id }).lean();
      customerName = c?.name || customerName;
    }

    var createdInvoiceId = null;
    const invoice = await models.Invoice.create({
      businessId: id,
      invoice_no: invoiceNo,
      customer_id: d.customer_id ? asId(d.customer_id) : null,
      customer_name: customerName,
      is_interstate: d.is_interstate,
      date: stamp,
      subtotal: gross, discount: d.discount, taxable: taxableSum,
      cgst, sgst, igst, tax_total: taxSum,
      grand_total: grand, paid,
      payment_method: d.payment_method, status,
      notes: d.notes, created_by: req.user.name, created_at: stamp,
    });
    createdInvoiceId = invoice._id;

    if (lines.length) {
      await models.InvoiceItem.insertMany(lines.map(({ item, calc, prod }) => ({
        businessId: id, invoice_id: invoice._id,
        product_id: prod ? prod._id : null,
        name: item.name, qty: item.qty, price: item.price, cost: prod?.cost ?? 0,
        discount: item.discount || 0, tax_rate: item.tax_rate || 0,
        taxable: calc.taxable, tax_amount: calc.tax, line_total: calc.lineTotal, date: stamp,
      })));
    }

    const movements = lines.filter(({ prod }) => prod).map(({ item, prod }) => ({
      businessId: id, product_id: prod._id, delta: -item.qty, reason: 'sale', ref: invoiceNo, created_at: stamp,
    }));
    if (movements.length) await models.StockMovement.insertMany(movements);

    if (paid > 0) {
      await models.Payment.create({ businessId: id, invoice_id: invoice._id, amount: paid, method: d.payment_method === 'credit' ? 'cash' : d.payment_method, note: 'Bill payment', date: stamp });
    }

    res.status(201).json(await getInvoiceFull(id, String(invoice._id)));
  } catch (err) {
    // compensate any stock reservations if the sale could not be completed
    for (const r of reserved) {
      await models.Product.updateOne({ _id: r.productId, businessId: id }, { $inc: { stock: r.qty } }).catch(() => {});
    }
    if (createdInvoiceId) {
      await Promise.all([
        models.Invoice.deleteOne({ _id: createdInvoiceId }).catch(() => {}),
        models.InvoiceItem.deleteMany({ invoice_id: createdInvoiceId }).catch(() => {}),
        models.Payment.deleteMany({ invoice_id: createdInvoiceId }).catch(() => {}),
      ]);
    }
    if (err.expose) return res.status(err.status || 400).json({ error: err.message });
    if (dup(err)) return res.status(409).json({ error: 'Invoice number clash — please retry.' });
    throw err;
  }
}));

app.post('/api/invoices/:id/payments', requireAuth, asyncRoute(async (req, res) => {
  const { id } = req.params;
  if (!isValidId(id)) return res.status(400).json({ error: 'Bad bill id.' });
  const parsed = z.object({ amount: z.number().positive(), method: z.enum(['cash', 'upi', 'card', 'bank']).default('cash'), note: z.string().trim().max(200).optional().default('') }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Enter a valid payment.' });
  const invoice = await models.Invoice.findOne({ _id: asId(id), businessId: bId(req) });
  if (!invoice) return res.status(404).json({ error: 'Bill not found.' });
  const remaining = round2(invoice.grand_total - invoice.paid);
  if (remaining <= 0.5) return res.status(400).json({ error: 'This bill is already fully paid.' });
  if (parsed.data.amount > remaining + 0.5) return res.status(400).json({ error: `Balance due is only ₹${remaining.toFixed(2)}.` });
  await models.Payment.create({ businessId: bId(req), invoice_id: invoice._id, amount: parsed.data.amount, method: parsed.data.method, note: parsed.data.note || 'Payment', date: nowLocal() });
  invoice.paid = round2(invoice.paid + parsed.data.amount);
  invoice.status = invoiceStatus(invoice.paid, invoice.grand_total);
  await invoice.save();
  res.json(await getInvoiceFull(bId(req), id));
}));

app.delete('/api/invoices/:id', requireAdmin, asyncRoute(async (req, res) => {
  const { id } = req.params;
  if (!isValidId(id)) return res.status(400).json({ error: 'Bad bill id.' });
  const invoice = await models.Invoice.findOne({ _id: asId(id), businessId: bId(req) });
  if (!invoice) return res.status(404).json({ error: 'Bill not found.' });
  const items = await models.InvoiceItem.find({ businessId: bId(req), invoice_id: invoice._id }).lean();
  for (const item of items) {
    if (item.product_id) {
      await models.Product.updateOne({ _id: item.product_id, businessId: bId(req) }, { $inc: { stock: item.qty }, $set: { updated_at: nowLocal() } });
      await models.StockMovement.create({ businessId: bId(req), product_id: item.product_id, delta: item.qty, reason: 'sale-reversal', ref: invoice.invoice_no, created_at: nowLocal() });
    }
  }
  await Promise.all([
    models.Invoice.deleteOne({ _id: invoice._id }),
    models.InvoiceItem.deleteMany({ businessId: bId(req), invoice_id: invoice._id }),
    models.Payment.deleteMany({ businessId: bId(req), invoice_id: invoice._id }),
  ]);
  res.json({ ok: true });
}));

// ============================================================ purchases
app.get('/api/purchases', requireAuth, asyncRoute(async (req, res) => {
  const { q: search, from, to, page = '1', pageSize = '12' } = req.query;
  const filter = { businessId: bId(req) };
  if (search) {
    const rx = new RegExp(escapeSearch(search), 'i');
    filter.$or = [{ purchase_no: rx }, { supplier_name: rx }];
  }
  if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) filter.date = { ...(filter.date || {}), $gte: `${from} 00:00:00` };
  if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) filter.date = { ...(filter.date || {}), $lte: `${to} 23:59:59.999` };
  const total = await models.Purchase.countDocuments(filter);
  const ps = Math.min(100, Math.max(1, Number(pageSize) || 12));
  const pg = Math.max(1, Number(page) || 1);
  const docs = await models.Purchase.find(filter).sort({ _id: -1 }).skip((pg - 1) * ps).limit(ps).lean();
  const summaryAgg = await models.Purchase.aggregate([
    { $match: { businessId: bId(req) } },
    { $group: { _id: null, total: { $sum: '$grand_total' }, n: { $sum: 1 } } },
  ]);
  res.json({ rows: LAll(docs), total, page: pg, pageSize: ps, summary: { total: round2(summaryAgg[0]?.total || 0), count: summaryAgg[0]?.n || 0 } });
}));

app.get('/api/purchases/:id', requireAuth, asyncRoute(async (req, res) => {
  const { id } = req.params;
  if (!isValidId(id)) return res.status(400).json({ error: 'Bad purchase id.' });
  const purchase = await models.Purchase.findOne({ _id: asId(id), businessId: bId(req) });
  if (!purchase) return res.status(404).json({ error: 'Purchase not found.' });
  const items = await models.PurchaseItem.find({ businessId: bId(req), purchase_id: purchase._id }).sort({ _id: 1 }).lean();
  res.json({ ...purchase.toJSON(), items: LAll(items) });
}));

const purchaseItemSchema = z.object({
  product_id: z.string().refine((v) => isValidId(v), 'Bad product'),
  qty: z.number().positive().max(1000000),
  cost: z.number().min(0).max(100000000),
  tax_rate: z.number().min(0).max(100).optional().default(0),
});

const purchaseSchema = z.object({
  supplier_id: z.string().refine((v) => isValidId(v) || v === '' || v == null, 'Bad supplier').nullable().optional().transform((v) => v || null),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}:\d{2})?$/).optional(),
  paid: z.number().min(0).nullable().optional(),
  status: z.enum(['received', 'pending']).optional().default('received'),
  notes: z.string().trim().max(500).optional().default(''),
  items: z.array(purchaseItemSchema).min(1, 'Add at least one item.').max(200),
});

app.post('/api/purchases', requireAuth, asyncRoute(async (req, res) => {
  const parsed = purchaseSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues?.[0]?.message || 'Check the purchase.' });
  const d = parsed.data;
  const id = bId(req);
  try {
    // validate products belong to this workspace and gather totals
    const lines = [];
    let subtotal = 0, taxTotal = 0;
    for (const item of d.items) {
      const prod = await models.Product.findOne({ _id: asId(item.product_id), businessId: id }).lean();
      if (!prod) throw httpError(400, 'A product in the purchase no longer exists.');
      const taxable = round2(item.qty * item.cost);
      const tax = round2((taxable * (item.tax_rate || 0)) / 100);
      subtotal = round2(subtotal + taxable);
      taxTotal = round2(taxTotal + tax);
      lines.push({ item, prod, taxable, tax, total: round2(taxable + tax) });
    }
    const grand = round2(subtotal + taxTotal);
    const paid = d.paid == null ? grand : Math.min(d.paid, grand);
    const business = await models.Business.findById(id).lean();
    const seq = await nextCounter(id, 'purchase');
    const purchaseNo = `${business?.purchase_prefix || 'PUR'}-${String(seq).padStart(4, '0')}`;
    const stamp = d.date || nowLocal();
    let supplierName = '';
    if (d.supplier_id) {
      const s = await models.Supplier.findOne({ _id: asId(d.supplier_id), businessId: id }).lean();
      supplierName = s?.name || '';
    }
    const purchase = await models.Purchase.create({
      businessId: id, purchase_no: purchaseNo,
      supplier_id: d.supplier_id ? asId(d.supplier_id) : null, supplier_name: supplierName,
      date: stamp, subtotal, tax_total: taxTotal, grand_total: grand, paid,
      status: d.status, notes: d.notes, created_at: stamp,
    });
    if (lines.length) {
      await models.PurchaseItem.insertMany(lines.map(({ item, prod, taxable, tax, total }) => ({
        businessId: id, purchase_id: purchase._id, product_id: prod._id, name: prod.name,
        qty: item.qty, cost: item.cost, tax_rate: item.tax_rate || 0,
        taxable, tax_amount: tax, line_total: total,
      })));
    }
    if (d.status === 'received') {
      for (const { item, prod } of lines) {
        await models.Product.updateOne({ _id: prod._id, businessId: id }, { $inc: { stock: item.qty }, $set: { cost: item.cost, updated_at: nowLocal() } });
        await models.StockMovement.create({ businessId: id, product_id: prod._id, delta: item.qty, reason: 'purchase', ref: purchaseNo, created_at: stamp });
      }
    }
    const items = await models.PurchaseItem.find({ businessId: id, purchase_id: purchase._id }).sort({ _id: 1 }).lean();
    res.status(201).json({ ...purchase.toJSON(), items: LAll(items) });
  } catch (err) {
    if (err.expose) return res.status(err.status || 400).json({ error: err.message });
    throw err;
  }
}));

app.delete('/api/purchases/:id', requireAdmin, asyncRoute(async (req, res) => {
  const { id } = req.params;
  if (!isValidId(id)) return res.status(400).json({ error: 'Bad purchase id.' });
  const purchase = await models.Purchase.findOne({ _id: asId(id), businessId: bId(req) });
  if (!purchase) return res.status(404).json({ error: 'Purchase not found.' });
  const items = await models.PurchaseItem.find({ businessId: bId(req), purchase_id: purchase._id }).lean();
  for (const item of items) {
    if (item.product_id) {
      await models.Product.updateOne(
        { _id: item.product_id, businessId: bId(req) },
        [{ $set: { stock: { $max: [0, { $add: ['$stock', -item.qty] }] }, updated_at: nowLocal() } }]
      );
      await models.StockMovement.create({ businessId: bId(req), product_id: item.product_id, delta: -item.qty, reason: 'purchase-reversal', ref: purchase.purchase_no, created_at: nowLocal() });
    }
  }
  await Promise.all([
    models.Purchase.deleteOne({ _id: purchase._id }),
    models.PurchaseItem.deleteMany({ businessId: bId(req), purchase_id: purchase._id }),
  ]);
  res.json({ ok: true });
}));

// ============================================================ expenses
export const EXPENSE_CATEGORIES = ['Rent', 'Salary', 'Utilities', 'Transport', 'Packaging', 'Marketing', 'Repair & Maintenance', 'Miscellaneous'];

app.get('/api/expenses', requireAuth, asyncRoute(async (req, res) => {
  const { q: search, category, month } = req.query;
  const filter = { businessId: bId(req) };
  if (search) {
    const rx = new RegExp(escapeSearch(search), 'i');
    filter.$or = [{ category: rx }, { notes: rx }];
  }
  if (category) filter.category = new RegExp(escapeSearch(category), 'i');
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [yy, mm] = month.split('-').map(Number);
    const next = new Date(yy, mm, 1); // first of next month
    const p = (n) => String(n).padStart(2, '0');
    const nextStamp = `${next.getFullYear()}-${p(next.getMonth() + 1)}-01 00:00:00`;
    filter.date = { $gte: `${month}-01 00:00:00`, $lt: nextStamp };
  }
  const rows = await models.Expense.find(filter).sort({ date: -1, _id: -1 }).limit(300).lean();
  const curMonth = isoDate(new Date()).slice(0, 7);
  const monthAgg = await models.Expense.aggregate([
    { $match: { businessId: bId(req), date: { $gte: `${curMonth}-01 00:00:00` } } },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);
  const byCategory = (await models.Expense.aggregate([
    { $match: { businessId: bId(req), date: { $gte: `${curMonth}-01 00:00:00` } } },
    { $group: { _id: '$category', total: { $sum: '$amount' } } },
    { $sort: { total: -1 } },
  ])).map((r) => ({ category: r._id, total: round2(r.total) }));
  res.json({ rows: LAll(rows), monthTotal: round2(monthAgg[0]?.total || 0), byCategory });
}));

const expenseSchema = z.object({
  category: z.string().trim().min(2).max(80),
  amount: z.number().positive().max(100000000),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}:\d{2})?$/).optional(),
  payment_method: z.enum(['cash', 'upi', 'card', 'bank']).default('cash'),
  notes: z.string().trim().max(300).optional().default(''),
});

app.post('/api/expenses', requireAuth, asyncRoute(async (req, res) => {
  const parsed = expenseSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues?.[0]?.message || 'Check the expense.' });
  const d = parsed.data;
  const stamp = d.date || nowLocal();
  const doc = await models.Expense.create({ businessId: bId(req), category: d.category, amount: d.amount, date: stamp, payment_method: d.payment_method, notes: d.notes, created_at: stamp });
  res.status(201).json(J(doc));
}));

app.put('/api/expenses/:id', requireAuth, asyncRoute(async (req, res) => {
  const { id } = req.params;
  if (!isValidId(id)) return res.status(400).json({ error: 'Bad expense id.' });
  const existing = await models.Expense.findOne({ _id: asId(id), businessId: bId(req) });
  if (!existing) return res.status(404).json({ error: 'Expense not found.' });
  const parsed = expenseSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues?.[0]?.message || 'Check the expense.' });
  const d = parsed.data;
  existing.set({ category: d.category, amount: d.amount, date: d.date || existing.date, payment_method: d.payment_method, notes: d.notes });
  await existing.save();
  res.json(J(existing));
}));

app.delete('/api/expenses/:id', requireAdmin, asyncRoute(async (req, res) => {
  const { id } = req.params;
  if (!isValidId(id)) return res.status(400).json({ error: 'Bad expense id.' });
  await models.Expense.deleteOne({ _id: asId(id), businessId: bId(req) });
  res.json({ ok: true });
}));

// ============================================================ reports
function rangeOrDefault(req) {
  const to = req.query.to && /^\d{4}-\d{2}-\d{2}$/.test(req.query.to) ? req.query.to : isoDate(new Date());
  let from = req.query.from && /^\d{4}-\d{2}-\d{2}$/.test(req.query.from) ? req.query.from : null;
  if (!from) { const d = new Date(); d.setDate(d.getDate() - 29); from = isoDate(d); }
  return { ...rangeBounds(from, to), from, to };
}

app.get('/api/reports/summary', requireAuth, asyncRoute(async (req, res) => {
  const { start, end, from, to } = rangeOrDefault(req);
  const id = bId(req);
  const match = { businessId: id, date: { $gte: start, $lte: end } };

  const [kpisAgg, items, expensesAgg] = await Promise.all([
    models.Invoice.aggregate([
      { $match: match },
      { $group: { _id: null, invoices: { $sum: 1 }, revenue: { $sum: '$grand_total' }, discount: { $sum: '$discount' }, tax: { $sum: '$tax_total' }, collected: { $sum: '$paid' } } },
    ]),
    models.InvoiceItem.find(match).select('qty taxable tax_rate tax_amount line_total product_id name').lean(),
    models.Expense.aggregate([
      { $match: match },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
  ]);
  const kpis = kpisAgg[0] || { invoices: 0, revenue: 0, discount: 0, tax: 0, collected: 0 };

  // unit cost snapshot lives on the item → profit is exact even after re-pricing
  let itemsSold = 0, grossProfitRaw = 0;
  const topMap = new Map();
  const gstMap = new Map();
  for (const it of items) {
    itemsSold += it.qty;
    grossProfitRaw += it.taxable - it.qty * (it.cost ?? 0);
    const t = topMap.get(it.name) || { name: it.name, qty: 0, revenue: 0 };
    t.qty += it.qty; t.revenue += it.line_total;
    topMap.set(it.name, t);
    const g = gstMap.get(it.tax_rate) || { rate: it.tax_rate, taxable: 0, tax: 0 };
    g.taxable += it.taxable; g.tax += it.tax_amount;
    gstMap.set(it.tax_rate, g);
  }
  const topProducts = [...topMap.values()].map((t) => ({ ...t, qty: round2(t.qty), revenue: round2(t.revenue) }))
    .sort((a, b) => b.revenue - a.revenue).slice(0, 8);
  const gst = [...gstMap.values()].map((g) => ({ rate: g.rate, taxable: round2(g.taxable), tax: round2(g.tax), cgst: round2(g.tax / 2), sgst: round2(g.tax / 2) }))
    .sort((a, b) => a.rate - b.rate);

  const expenseTotal = expensesAgg[0]?.total || 0;
  const grossProfit = round2(grossProfitRaw - kpis.discount);

  const days = Math.max(1, Math.round((parseLocalDay(to) - parseLocalDay(from)) / 86400000) + 1);
  const prevTo = parseLocalDay(from); prevTo.setDate(prevTo.getDate() - 1);
  const prevFrom = new Date(prevTo); prevFrom.setDate(prevFrom.getDate() - (days - 1));
  const prevRange = rangeBounds(isoDate(prevFrom), isoDate(prevTo));
  const prevAgg = await models.Invoice.aggregate([
    { $match: { businessId: id, date: { $gte: prevRange.start, $lte: prevRange.end } } },
    { $group: { _id: null, revenue: { $sum: '$grand_total' }, invoices: { $sum: 1 } } },
  ]);
  const prev = prevAgg[0] || { revenue: 0, invoices: 0 };

  const dailyRows = await models.Invoice.aggregate([
    { $match: match },
    { $group: { _id: { $substr: ['$date', 0, 10] }, total: { $sum: '$grand_total' }, invoices: { $sum: 1 } } },
  ]);
  const byDay = [];
  for (let d = parseLocalDay(from); d <= parseLocalDay(to); d.setDate(d.getDate() + 1)) {
    const key = isoDate(d);
    const found = dailyRows.find((r) => r._id === key);
    byDay.push({ day: key, total: found ? round2(found.total) : 0, invoices: found ? found.invoices : 0 });
  }

  const byPayment = (await models.Invoice.aggregate([
    { $match: match },
    { $group: { _id: '$payment_method', total: { $sum: '$grand_total' }, n: { $sum: 1 } } },
    { $sort: { total: -1 } },
  ])).map((r) => ({ method: r._id, total: round2(r.total), n: r.n }));

  // category revenue — needs product → category resolution; fetch maps once
  const productIds = [...new Set(items.filter((i) => i.product_id).map((i) => String(i.product_id)))];
  const products = productIds.length
    ? await models.Product.find({ businessId: id, _id: { $in: productIds.map(asId) } }).select('category_id').lean()
    : [];
  const catIds = [...new Set(products.filter((p) => p.category_id).map((p) => String(p.category_id)))];
  const categories = catIds.length
    ? await models.Category.find({ businessId: id, _id: { $in: catIds.map(asId) } }).lean()
    : [];
  const catById = new Map(categories.map((c) => [String(c._id), c]));
  const prodCat = new Map(products.map((p) => [String(p._id), p.category_id ? catById.get(String(p.category_id)) : null]));
  const catMap = new Map();
  for (const it of items) {
    const cat = it.product_id ? prodCat.get(String(it.product_id)) : null;
    const key = cat ? cat.name : 'Uncategorised';
    const color = cat ? cat.color : '#8a93a6';
    const cur = catMap.get(key) || { category: key, color, revenue: 0 };
    cur.revenue += it.line_total;
    catMap.set(key, cur);
  }
  const byCategory = [...catMap.values()].map((c) => ({ ...c, revenue: round2(c.revenue) })).sort((a, b) => b.revenue - a.revenue);

  const revenue = kpis.revenue;
  res.json({
    from, to,
    kpis: {
      revenue: round2(revenue), invoices: kpis.invoices, itemsSold: round2(itemsSold),
      avgBill: kpis.invoices ? round2(revenue / kpis.invoices) : 0,
      taxCollected: round2(kpis.tax),
      collected: round2(kpis.collected),
      expenses: round2(expenseTotal),
      grossProfit,
      netProfit: round2(grossProfit - expenseTotal),
    },
    previous: { revenue: round2(prev.revenue), invoices: prev.invoices },
    byDay, byPayment, topProducts, byCategory, gst,
  });
}));

app.get('/api/reports/export', requireAuth, asyncRoute(async (req, res) => {
  const { start, end, from, to } = rangeOrDefault(req);
  const rows = await models.Invoice.find({ businessId: bId(req), date: { $gte: start, $lte: end } })
    .sort({ date: 1, _id: 1 })
    .select('invoice_no date customer_name subtotal discount tax_total grand_total paid status payment_method')
    .lean();
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const header = ['Invoice No', 'Date', 'Customer', 'Subtotal', 'Discount', 'Tax', 'Grand Total', 'Paid', 'Balance', 'Status', 'Payment Method'];
  const lines = [header.map(esc).join(',')];
  for (const r of rows) {
    lines.push([r.invoice_no, r.date, r.customer_name, r.subtotal, r.discount, r.tax_total, r.grand_total, r.paid, round2(r.grand_total - r.paid), r.status, r.payment_method].map(esc).join(','));
  }
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="shopdesk-sales-${from}-to-${to}.csv"`);
  res.send(lines.join('\n'));
}));

// ============================================================ settings & backup
const BACKUP_COLLECTIONS = ['categories', 'products', 'customers', 'suppliers', 'invoices', 'invoice_items', 'payments', 'purchases', 'purchase_items', 'expenses', 'stock_movements', 'counters'];
const collectionFor = {
  categories: models.Category, products: models.Product, customers: models.Customer, suppliers: models.Supplier,
  invoices: models.Invoice, invoice_items: models.InvoiceItem, payments: models.Payment,
  purchases: models.Purchase, purchase_items: models.PurchaseItem, expenses: models.Expense,
  stock_movements: models.StockMovement, counters: models.Counter,
};

app.get('/api/settings', requireAuth, asyncRoute(async (req, res) => {
  const business = await models.Business.findById(bId(req)).lean();
  res.json(L(business));
}));

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

app.put('/api/settings', requireAdmin, asyncRoute(async (req, res) => {
  const parsed = settingsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues?.[0]?.message || 'Check the settings.' });
  const d = parsed.data;
  const business = await models.Business.findByIdAndUpdate(
    bId(req),
    { $set: { ...d, gstin: d.gstin.toUpperCase(), invoice_prefix: d.invoice_prefix.toUpperCase(), purchase_prefix: d.purchase_prefix.toUpperCase() } },
    { new: true, runValidators: true }
  ).lean();
  res.json(L(business));
}));

// wipe + reseed this workspace with the sample dataset (admin; destructive)
app.post('/api/settings/load-sample', requireAdmin, asyncRoute(async (req, res) => {
  const counts = await seedBusinessData(bId(req));
  res.json({ ok: true, ...counts });
}));

// wipe all data in this workspace but keep users + business profile (admin; destructive)
app.post('/api/settings/clear-data', requireAdmin, asyncRoute(async (req, res) => {
  await clearBusinessData(bId(req));
  res.json({ ok: true });
}));

app.get('/api/backup', requireAdmin, asyncRoute(async (req, res) => {
  const data = {};
  data.business = [await models.Business.findById(bId(req)).lean()];
  data.users = await models.User.find({ businessId: bId(req) }).select('+password_hash').lean();
  await Promise.all(BACKUP_COLLECTIONS.map(async (name) => {
    data[name] = await collectionFor[name].find({ businessId: bId(req) }).lean();
  }));
  res.setHeader('Content-Disposition', `attachment; filename="shopdesk-backup-${isoDate(new Date())}.json"`);
  res.json({ app: 'shopdesk', version: 3, exported_at: new Date().toISOString(), data });
}));

app.post('/api/restore', requireAdmin, asyncRoute(async (req, res) => {
  const body = req.body;
  if (!body || typeof body !== 'object' || !body.data || typeof body.data !== 'object') {
    return res.status(400).json({ error: 'Not a valid shopdesk backup file (expected v3 export).' });
  }
  if (body.version && body.version !== 3) {
    return res.status(400).json({ error: 'That backup was made with an older shopdesk (SQLite era). It can’t be imported into MongoDB shopdesk.' });
  }
  const missing = ['business', 'users', ...BACKUP_COLLECTIONS].filter((t) => !Array.isArray(body.data[t]));
  if (missing.length) return res.status(400).json({ error: `Backup is missing sections: ${missing.join(', ')}` });

  const id = bId(req);
  try {
    // map old/foreign ids → same ids (kept), but force tenancy back to this workspace
    await models.Session.deleteMany({ businessId: id });
    await Promise.all(BACKUP_COLLECTIONS.map((name) => collectionFor[name].deleteMany({ businessId: id })));
    await models.User.deleteMany({ businessId: id });

    const strip = (doc) => {
      const { _id, __v, businessId, ...rest } = doc;
      return { ...rest, ...(isValidId(_id) || mongoose.Types.ObjectId.isValid(_id) ? { _id: new mongoose.Types.ObjectId(String(_id)) } : {}), businessId: id };
    };
    const [biz] = body.data.business.map((d) => { const { _id, ...rest } = d; return rest; });
    if (biz) await models.Business.findByIdAndUpdate(id, { $set: biz }, { runValidators: false }).catch(() => {});

    if (body.data.users.length) await models.User.insertMany(body.data.users.map((u) => strip(u)), { ordered: false });
    for (const name of BACKUP_COLLECTIONS) {
      const rows = body.data[name];
      if (!rows.length) continue;
      await collectionFor[name].insertMany(rows.map(strip), { ordered: false });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('Restore failed:', err);
    res.status(400).json({ error: 'Restore failed — the backup file looks corrupt. Your current data may have been partly replaced; re-import a good backup if anything looks off.' });
  }
}));

// ============================================================ search (command palette)
app.get('/api/search', requireAuth, asyncRoute(async (req, res) => {
  const search = String(req.query.q || '').trim();
  if (search.length < 2) return res.json({ products: [], customers: [], invoices: [] });
  const id = bId(req);
  const rx = new RegExp(escapeRegExp(search), 'i');
  const [products, customers, invoices] = await Promise.all([
    models.Product.find({ businessId: id, $or: [{ name: rx }, { sku: rx }, { barcode: rx }] }).sort({ name: 1 }).limit(6).select('name sku price stock unit').lean(),
    models.Customer.find({ businessId: id, $or: [{ name: rx }, { phone: rx }] }).sort({ name: 1 }).limit(5).select('name phone').lean(),
    models.Invoice.find({ businessId: id, $or: [{ invoice_no: rx }, { customer_name: rx }] }).sort({ _id: -1 }).limit(5).select('invoice_no customer_name grand_total status date').lean(),
  ]);
  res.json({ products: LAll(products), customers: LAll(customers), invoices: LAll(invoices) });
}));

// ============================================================ UPI QR for billing
const qrCache = new Map();
app.get('/api/pay-qr', requireAuth, asyncRoute(async (req, res) => {
  const amount = Math.max(0, Number(req.query.amount) || 0);
  const note = String(req.query.note || 'Bill').slice(0, 60);
  const business = await models.Business.findById(bId(req)).select('name upi_id').lean();
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

// ============================================================ errors
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  if (err?.type === 'entity.parse.failed' || err?.type === 'entity.too.large') {
    return res.status(400).json({ error: 'Bad request body.' });
  }
  if (err?.name === 'ValidationError' || err?.name === 'CastError') {
    return res.status(400).json({ error: 'Check the submitted data.' });
  }
  console.error('API error:', err);
  res.status(err?.status || 500).json({ error: err?.expose ? err.message : 'Something went wrong on the server.' });
});
