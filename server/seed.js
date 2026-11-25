// shopdesk — deterministic demo seed (per workspace). A "Shivam General Store"-style assortment.
// Safe to re-run for a workspace: wipes tenant data and rebuilds the same dataset.
import mongoose from 'mongoose';
import { models, fmtDateTime, asId } from './db.js';
import { round2, gstSplit } from './billing.js';

// ---------- deterministic RNG ----------
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261125);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const chance = (p) => rand() < p;

const CATEGORIES = [
  { name: 'Grocery & Staples', color: '#fbbf24' },
  { name: 'Snacks & Beverages', color: '#fb7185' },
  { name: 'Dairy & Bakery', color: '#67e8f9' },
  { name: 'Personal Care', color: '#c084fc' },
  { name: 'Household & Cleaning', color: '#34d399' },
  { name: 'Baby & Kids', color: '#f9a8d4' },
];

// [name, unit, price, costRatio, taxRate, reorder, popularity]
const PRODUCTS = [
  // Grocery & Staples
  ['India Gate Basmati Rice 5kg', 'pkt', 475, 0.82, 5, 15, 95],
  ['Aashirvaad Atta 10kg', 'pkt', 445, 0.82, 5, 20, 92],
  ['Tata Sampann Toor Dal 1kg', 'pkt', 148, 0.82, 5, 25, 88],
  ['Chana Dal 1kg', 'kg', 95, 0.82, 5, 20, 55],
  ['Moong Dal 1kg', 'kg', 138, 0.81, 5, 15, 60],
  ['Fortune Sunflower Oil 1L', 'bottle', 142, 0.87, 5, 25, 98],
  ['Patanjali Mustard Oil 1L', 'bottle', 172, 0.86, 5, 15, 70],
  ['Tata Salt 1kg', 'pkt', 24, 0.79, 0, 30, 90],
  ['Madhur Pure Sugar 1kg', 'pkt', 48, 0.85, 0, 30, 85],
  ['Poha Thin 500g', 'pkt', 39, 0.77, 5, 15, 45],
  ['Tata Sampann Besan 1kg', 'pkt', 72, 0.81, 5, 15, 58],
  ['Everest Red Chilli Powder 100g', 'pouch', 32, 0.72, 5, 10, 82],
  ['MDH Garam Masala 100g', 'pouch', 58, 0.75, 5, 10, 76],
  ['Catch Coriander Powder 100g', 'pouch', 26, 0.70, 5, 10, 50],
  ['Saffola Oats 1kg', 'box', 245, 0.85, 18, 10, 40],
  ['Rajdhani Rajma 1kg', 'kg', 128, 0.82, 5, 12, 42],
  // Snacks & Beverages
  ["Lay's Classic Salted 52g", 'pkt', 20, 0.75, 12, 40, 97],
  ["Haldiram's Aloo Bhujia 200g", 'pkt', 55, 0.80, 12, 40, 94],
  ['Parle-G 800g', 'pkt', 70, 0.81, 18, 30, 96],
  ['Britannia Good Day Butter 600g', 'pkt', 150, 0.81, 18, 15, 62],
  ['Coca-Cola 750ml', 'bottle', 40, 0.78, 28, 24, 93],
  ['Thums Up 750ml', 'bottle', 40, 0.78, 28, 24, 91],
  ['Sprite 750ml', 'bottle', 40, 0.78, 28, 20, 66],
  ['Frooti Mango Drink 1L', 'carton', 55, 0.76, 12, 15, 52],
  ['Red Bull Energy Drink 250ml', 'can', 125, 0.81, 28, 10, 38],
  ['Bingo Mad Angles 90g', 'pkt', 30, 0.76, 12, 25, 74],
  ['Kurkure Masala Munch 110g', 'pkt', 20, 0.73, 12, 40, 99],
  ['Cadbury Dairy Milk 50g', 'bar', 50, 0.78, 18, 30, 89],
  ['Nestle KitKat 4F 44.3g', 'bar', 80, 0.79, 18, 20, 71],
  ['Kissan Mixed Fruit Jam 500g', 'bottle', 175, 0.80, 18, 10, 33],
  ['Dabur Honey 250g', 'bottle', 158, 0.82, 18, 12, 47],
  ['Cadbury Bournvita 500g', 'jar', 215, 0.82, 18, 10, 44],
  // Dairy & Bakery
  ['Amul Gold Milk 1L', 'pouch', 68, 0.85, 0, 30, 100],
  ['Amul Butter 500g', 'block', 255, 0.88, 12, 15, 68],
  ['Amul Cheese Slices 200g', 'pack', 145, 0.84, 12, 10, 41],
  ['Mother Dairy Curd 400g', 'cup', 38, 0.79, 0, 20, 84],
  ['Britannia Bread 400g', 'loaf', 48, 0.79, 0, 15, 87],
  ['Amul Taaza Paneer 200g', 'pack', 92, 0.83, 0, 12, 73],
  ['Amul Pure Ghee 500ml', 'jar', 315, 0.85, 12, 10, 77],
  ['Amul Condensed Milk 400g', 'tin', 135, 0.83, 12, 8, 29],
  // Personal Care
  ['Dove Bathing Bar 100g', 'bar', 62, 0.81, 18, 25, 79],
  ['Lifebuoy Total 10 Soap 100g', 'bar', 38, 0.73, 18, 25, 86],
  ['Colgate Strong Teeth 200g', 'tube', 95, 0.78, 18, 20, 81],
  ['Clinic Plus Shampoo 340ml', 'bottle', 285, 0.82, 18, 12, 56],
  ['Head & Shoulders 180ml', 'bottle', 175, 0.81, 18, 10, 48],
  ['Dettol Antiseptic 250ml', 'bottle', 155, 0.82, 18, 10, 51],
  ['Himalaya Neem Face Wash 200ml', 'tube', 150, 0.76, 18, 12, 43],
  ['Whisper Ultra Care XL 10pc', 'pack', 130, 0.81, 12, 15, 63],
  // Household & Cleaning
  ['Surf Excel Matic Top Load 2kg', 'bag', 340, 0.87, 18, 12, 67],
  ['Vim Dishwash Bar 5x155g', 'pack', 70, 0.80, 18, 15, 75],
  ['Harpic Power Plus 500ml', 'bottle', 110, 0.79, 18, 10, 59],
  ['Lizol Disinfectant 975ml', 'bottle', 225, 0.83, 18, 10, 39],
  ['Vim Liquid Gel 750ml', 'bottle', 175, 0.79, 18, 12, 54],
  ['Mortein Spray 225ml', 'can', 165, 0.80, 18, 8, 24],
  ['Colin Glass Cleaner 500ml', 'spray', 130, 0.77, 18, 10, 26],
  // Baby & Kids
  ['Cerelac Stage 2 Wheat 300g', 'tin', 235, 0.83, 18, 8, 31],
  ["Johnson's Baby Powder 200g", 'bottle', 225, 0.79, 18, 10, 37],
  ['Pampers Pants Large 20pc', 'pack', 480, 0.88, 12, 8, 34],
  ["Himalaya Baby Shampoo 200ml", 'bottle', 185, 0.76, 18, 8, 28],
  ['Lactogen Stage 1 400g', 'tin', 395, 0.86, 0, 6, 22],
];
const CAT_OF = [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0, 1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1, 2,2,2,2,2,2,2,2, 3,3,3,3,3,3,3,3, 4,4,4,4,4,4,4, 5,5,5,5,5];

const CUSTOMERS = [
  ['Rohit Agarwal', '9837051234', 'rohit.agarwal@gmail.com', '', '14 Nayee Basi, Mathura', 'Mathura'],
  ['Priya Sharma', '9412266789', 'priya.sharma88@gmail.com', '', '2/45 Shantinagar, Mathura', 'Mathura'],
  ['Sanjay Verma', '9758214455', '', '', '68 Govind Nagar, Mathura', 'Mathura'],
  ['Meena Devi', '9639011122', '', '', 'Bara Bazaar, Mathura', 'Mathura'],
  ['Rakesh Gupta', '9927012345', 'rakeshg@outlook.com', '09AAPFG8821K1Z2', 'Gupta Electronics, Nai Sarak, Mathura', 'Mathura'],
  ['Anil Kumar', '8476098765', '', '', '22 Deeg Darwaza, Mathura', 'Mathura'],
  ['Sunita Yadav', '9557801234', '', '', 'Vrindavan Colony, Mathura', 'Mathura'],
  ['Deepak Jain', '9412345678', 'deepak.jain@jainbrothers.in', '09AABJC4411M1Z5', 'Jain Brothers, Hathi Gali, Mathura', 'Mathura'],
  ['Kamla Prasad', '7017456789', '', '', 'Kosi Kalan, Mathura', 'Mathura'],
  ['Nikita Singh', '7983123456', 'nikitasi@gmail.com', '', '5 Krishna Vihar, Mathura', 'Mathura'],
  ['Mohd. Iqbal', '9026345678', '', '', 'Kabir Nagar, Mathura', 'Mathura'],
  ['Rekha Sharma', '8709456781', 'rekhasharma22@gmail.com', '', 'C-9 Vraj Vihar, Mathura', 'Mathura'],
  ['Pawan Dubey', '9887654321', '', '', 'Sadar Bazaar, Mathura', 'Mathura'],
  ['Sai Medical & General Store', '9412347890', 'sai@saimedical.in', '09AAQFS9921P1Z8', 'Sai Medical, Junction Road, Mathura', 'Mathura'],
];

const SUPPLIERS = [
  ['Shri Mahadev Distribution Co.', '9837011223', 'mahadev@mahadevdist.in', '09AAHFM5521C1Z3', '12 Katra Road, Mathura', 'Mathura'],
  ['Mathura FMCG Distributors', '9412255001', 'sales@mathurafmcg.com', '09AAWFM1187D1Z6', '45 Industrial Estate, Mathura', 'Mathura'],
  ['Radha Kishan Traders', '9758299887', 'rk.traders@gmail.com', '', 'Station Road, Hathras', 'Hathras'],
  ['Baba Traders', '9219567889', 'babatraders@yahoo.in', '09AALFB7734E1Z1', 'A-14 Transport Nagar, Agra', 'Agra'],
  ['Krishna Cold Storage & Dairy', '9639055667', 'krishna.dairy@gmail.com', '09AASFK2101F1Z9', 'Chhata Road, Vrindavan', 'Vrindavan'],
  ['Hathras Sales Corporation', '8476123456', 'hsc@hathrassales.in', '09AAFFH6655G1Z2', 'Aligarh Road, Hathras', 'Hathras'],
  ['Bharat Wholesale Mart', '11-29876543', 'bharat@bharatmart.in', '07AAGFB3321H1Z7', 'Sadar Bazar, Delhi', 'Delhi'],
  ['Gupta Agencies', '9410981234', 'gupta@guptaagencies.in', '09AACFG2210J1Z4', 'Sanjay Place, Agra', 'Agra'],
];

const WEEKDAY_FACTOR = [0.55, 0.95, 1.05, 1.1, 1.15, 1.3, 1.45]; // Sun..Sat

function weightedProduct() {
  const total = PRODUCTS.reduce((s, p) => s + p[6], 0);
  let r = rand() * total;
  for (let i = 0; i < PRODUCTS.length; i++) {
    r -= PRODUCTS[i][6];
    if (r <= 0) return i;
  }
  return PRODUCTS.length - 1;
}


const EMPTY_TENANT = (businessId) => ([
  [models.Payment, {}],
  [models.InvoiceItem, {}],
  [models.Invoice, {}],
  [models.PurchaseItem, {}],
  [models.Purchase, {}],
  [models.Expense, {}],
  [models.StockMovement, {}],
  [models.Product, {}],
  [models.Category, {}],
  [models.Customer, {}],
  [models.Supplier, {}],
  [models.Counter, {}],
]);

/** Wipe every tenant-owned document for a workspace. Users and the business profile survive. */
export async function clearBusinessData(businessId) {
  const ops = EMPTY_TENANT().map(([Model]) => Model.deleteMany({ businessId }));
  await Promise.all(ops);
}

/**
 * Fill a workspace with the lively demo dataset (Shivam-style assortment,
 * 75 days of GST bills, purchases, expenses). Caller owns the business doc.
 */
export async function seedBusinessData(businessId) {
  await clearBusinessData(businessId);
  const bId = asId(businessId);

  // ---------- categories ----------
  const catDocs = CATEGORIES.map((c) => ({ businessId: bId, name: c.name, color: c.color }));
  const catInserted = await models.Category.insertMany(catDocs);
  const catIds = catInserted.map((d) => d._id);

  // ---------- products ----------
  const productDocs = PRODUCTS.map(([name, unit, price, costRatio, tax, reorder], i) => {
    const sku = `SD-${String(i + 1).padStart(3, '0')}`;
    const barcode = String(8901234500000 + i * 137 + Math.floor(rand() * 90));
    const cost = round2(price * costRatio * 0.82);
    return {
      _id: new mongoose.Types.ObjectId(),
      businessId: bId, sku, barcode, name,
      category_id: catIds[CAT_OF[i]],
      unit, price, cost, tax_rate: tax,
      stock: 100, reorder_level: reorder, favorite: i % 17 === 0,
    };
  });
  await models.Product.insertMany(productDocs);
  const productRows = productDocs.map((p, i) => ({ id: p._id, name: p.name, price: p.price, cost: p.cost, tax: p.tax_rate, index: i }));

  // ---------- customers & suppliers ----------
  const customerDocs = CUSTOMERS.map(([name, phone, email, gstin, address, city]) => ({ businessId: bId, name, phone, email, gstin, address, city }));
  const customerInserted = await models.Customer.insertMany(customerDocs);
  const customerIds = customerInserted.map((d) => d._id);

  const supplierDocs = SUPPLIERS.map(([name, phone, email, gstin, address, city]) => ({ businessId: bId, name, phone, email, gstin, address, city }));
  const supplierInserted = await models.Supplier.insertMany(supplierDocs);
  const supplierIds = supplierInserted.map((d) => d._id);

  // ---------- sales history (75 days) ----------
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const invoiceDocs = [];
  const itemDocs = [];
  const paymentDocs = [];
  let invoiceSeq = 0;

  for (let d = 74; d >= 0; d--) {
    const day = new Date(today);
    day.setDate(day.getDate() - d);
    const wd = day.getDay();
    const seasonal = 0.9 + Math.sin((74 - d) * 0.42) * 0.18 + rand() * 0.25;
    const bills = Math.max(3, Math.round((8 + rand() * 6) * WEEKDAY_FACTOR[wd] * seasonal));
    const isToday = d === 0;
    const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();

    for (let b = 0; b < bills; b++) {
      const hour = 8 + Math.floor(rand() * 13);
      const minute = Math.floor(rand() * 60);
      if (isToday && hour * 60 + minute > nowMinutes - 10) continue;
      const when = new Date(day);
      when.setHours(Math.min(hour, 21), minute, Math.floor(rand() * 60), 0);

      const itemCount = 1 + Math.floor(Math.pow(rand(), 1.6) * 5);
      const chosen = new Map();
      for (let k = 0; k < itemCount; k++) {
        const pIdx = weightedProduct();
        chosen.set(pIdx, (chosen.get(pIdx) || 0) + 1);
      }

      let gross = 0, taxableSum = 0, taxSum = 0;
      const lines = [];
      for (const [pIdx, qtyRaw] of chosen) {
        const p = productRows[pIdx];
        const qty = p.price < 60 ? qtyRaw + Math.floor(rand() * 2) : qtyRaw;
        const lineDisc = chance(0.12) ? (chance(0.5) ? 5 : 10) : 0;
        const taxable = round2(qty * p.price * (1 - lineDisc / 100));
        const tax = round2((taxable * p.tax) / 100);
        gross = round2(gross + qty * p.price);
        taxableSum = round2(taxableSum + taxable);
        taxSum = round2(taxSum + tax);
        lines.push({ p, qty, lineDisc, taxable, tax, total: round2(taxable + tax) });
      }

      const { cgst, sgst } = gstSplit(taxSum, false);
      const billDiscount = gross > 400 && chance(0.18) ? pick([10, 20, 25]) : 0;
      const grand = Math.max(0, round2(taxableSum + taxSum - billDiscount));

      const r = rand();
      const method = r < 0.33 ? 'cash' : r < 0.71 ? 'upi' : r < 0.83 ? 'card' : r < 0.88 ? 'bank' : 'credit';
      let paid = grand;
      let status = 'paid';
      if (method === 'credit') {
        if (chance(0.45)) { paid = 0; status = 'unpaid'; }
        else { paid = round2(grand * (0.3 + rand() * 0.5)); status = 'partial'; }
      }

      invoiceSeq++;
      const invoiceNo = `INV-${String(invoiceSeq).padStart(4, '0')}`;
      const isRegistered = chance(0.45);
      const cIdx = isRegistered ? Math.floor(rand() * customerIds.length) : -1;
      const customerId = cIdx >= 0 ? customerIds[cIdx] : null;
      const cName = cIdx >= 0 ? CUSTOMERS[cIdx][0] : 'Walk-in Customer';
      const ts = fmtDateTime(when);
      const invoiceId = new mongoose.Types.ObjectId();
      invoiceDocs.push({
        _id: invoiceId, businessId: bId, invoice_no: invoiceNo,
        customer_id: customerId, customer_name: cName, is_interstate: false,
        date: ts, subtotal: gross, discount: billDiscount, taxable: taxableSum,
        cgst, sgst, igst: 0, tax_total: taxSum, grand_total: grand, paid,
        payment_method: method, status, notes: '', created_by: 'Seed', created_at: ts,
      });
      for (const l of lines) {
        itemDocs.push({
          businessId: bId, invoice_id: invoiceId, product_id: l.p.id, name: l.p.name,
          qty: l.qty, price: l.p.price, cost: l.p.cost, discount: l.lineDisc, tax_rate: l.p.tax,
          taxable: l.taxable, tax_amount: l.tax, line_total: l.total, date: ts,
        });
      }
      if (paid > 0) {
        paymentDocs.push({ businessId: bId, invoice_id: invoiceId, amount: paid, method: method === 'credit' ? 'cash' : method, note: 'Seed', date: ts });
      }
    }
  }
  if (invoiceDocs.length) await models.Invoice.insertMany(invoiceDocs, { ordered: false });
  if (itemDocs.length) await models.InvoiceItem.insertMany(itemDocs, { ordered: false });
  if (paymentDocs.length) await models.Payment.insertMany(paymentDocs, { ordered: false });

  // ---------- purchases (stock-in) ----------
  const purchaseDocs = [];
  const purchaseItemDocs = [];
  let purchaseSeq = 0;
  for (const d of [70, 56, 41, 27, 12, 3]) {
    const day = new Date(today);
    day.setDate(day.getDate() - d);
    day.setHours(11, 30, 0, 0);
    const ts = fmtDateTime(day);
    const supplierIdx = Math.floor(rand() * supplierIds.length);
    const nLines = 3 + Math.floor(rand() * 4);
    const chosen = new Map();
    while (chosen.size < nLines) {
      chosen.set(Math.floor(rand() * PRODUCTS.length), 0.6 + rand() * 1.6);
    }
    let subtotal = 0, taxTotal = 0;
    const lines = [];
    for (const [pIdx, qtyFactor] of chosen) {
      const p = productRows[pIdx];
      const qty = Math.round(qtyFactor * 24);
      const taxable = round2(qty * p.cost);
      const tax = round2((taxable * p.tax) / 100);
      subtotal = round2(subtotal + taxable);
      taxTotal = round2(taxTotal + tax);
      lines.push({ p, qty, taxable, tax, total: round2(taxable + tax) });
    }
    const grand = round2(subtotal + taxTotal);
    purchaseSeq++;
    const purchaseNo = `PUR-${String(purchaseSeq).padStart(4, '0')}`;
    const paid = purchaseSeq <= 3 ? grand : round2(grand * (chance(0.75) ? 1 : 0.6));
    const purchaseId = new mongoose.Types.ObjectId();
    purchaseDocs.push({
      _id: purchaseId, businessId: bId, purchase_no: purchaseNo,
      supplier_id: supplierIds[supplierIdx], supplier_name: SUPPLIERS[supplierIdx][0],
      date: ts, subtotal, tax_total: taxTotal, grand_total: grand, paid,
      status: 'received', notes: '', created_at: ts,
    });
    for (const l of lines) {
      purchaseItemDocs.push({
        businessId: bId, purchase_id: purchaseId, product_id: l.p.id, name: l.p.name,
        qty: l.qty, cost: l.p.cost, tax_rate: l.p.tax, taxable: l.taxable, tax_amount: l.tax, line_total: l.total,
      });
    }
  }
  if (purchaseDocs.length) await models.Purchase.insertMany(purchaseDocs, { ordered: false });
  if (purchaseItemDocs.length) await models.PurchaseItem.insertMany(purchaseItemDocs, { ordered: false });

  // ---------- expenses ----------
  const expenseDocs = [];
  for (let m = 2; m >= 0; m--) {
    const d = new Date(today.getFullYear(), today.getMonth() - m, 5, 10, 0, 0, 0);
    if (d <= today) expenseDocs.push(['Rent (Shop + Godown)', 7500, d]);
    const s1 = new Date(today.getFullYear(), today.getMonth() - m, 1, 10, 0, 0, 0);
    if (s1 <= today) expenseDocs.push(['Salary — Riya (Billing)', 8000, s1]);
    const s15 = new Date(today.getFullYear(), today.getMonth() - m, 15, 10, 0, 0, 0);
    if (s15 <= today) expenseDocs.push(['Salary — Riya (Billing)', 8000, s15]);
    const e = new Date(today.getFullYear(), today.getMonth() - m, 10, 10, 0, 0, 0);
    if (e <= today) expenseDocs.push(['Electricity (PVVNL)', 2400 + Math.round(rand() * 1100), e]);
    const net = new Date(today.getFullYear(), today.getMonth() - m, 18, 10, 0, 0, 0);
    if (net <= today) expenseDocs.push(['Internet & Billing Software', 1299, net]);
  }
  for (let i = 0; i < 22; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - Math.floor(rand() * 74));
    d.setHours(9 + Math.floor(rand() * 11), Math.floor(rand() * 60), 0, 0);
    expenseDocs.push([pick(['Transport / Dharmkata', 'Packaging (Bags & Labels)', 'Chai & Refreshment', 'Repair & Maintenance', 'Stationery & Printing', 'Miscellaneous']), Math.round(80 + rand() * 700), d]);
  }
  await models.Expense.insertMany(expenseDocs.map(([category, amount, when]) => ({
    businessId: bId, category, amount, date: fmtDateTime(when),
    payment_method: chance(0.6) ? 'cash' : 'upi', notes: '', created_at: fmtDateTime(when),
  })));

  // ---------- curated stock levels (healthy + low + one out) ----------
  const LOW = { 16: 18, 26: 9, 8: 11, 37: 6, 33: 14, 58: 3, 12: 6, 36: 8 };
  const stockWrites = productRows.map((p) => ({
    updateOne: {
      filter: { _id: p.id },
      update: { $set: { stock: LOW[p.index] !== undefined ? LOW[p.index] : 30 + Math.floor(rand() * 190) } },
    },
  }));
  stockWrites.push({ updateOne: { filter: { _id: productRows[55].id }, update: { $set: { stock: 0 } } } });
  await models.Product.bulkWrite(stockWrites);

  // ---------- opening stock movements ----------
  const refreshed = await models.Product.find({ businessId: bId }).select('stock').lean();
  const nowTs = fmtDateTime(new Date());
  await models.StockMovement.insertMany(refreshed.map((p) => ({
    businessId: bId, product_id: p._id, delta: p.stock, reason: 'opening', ref: 'Opening stock', created_at: nowTs,
  })));

  // ---------- counters ----------
  await models.Counter.findOneAndUpdate({ businessId: bId, key: 'invoice' }, { $set: { value: invoiceSeq } }, { upsert: true });
  await models.Counter.findOneAndUpdate({ businessId: bId, key: 'purchase' }, { $set: { value: purchaseSeq } }, { upsert: true });

  const [invoiceCount, productCount, customerCount] = await Promise.all([
    models.Invoice.countDocuments({ businessId: bId }),
    models.Product.countDocuments({ businessId: bId }),
    models.Customer.countDocuments({ businessId: bId }),
  ]);
  return { invoices: invoiceCount, products: productCount, customers: customerCount };
}
