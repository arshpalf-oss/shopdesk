// shopdesk — deterministic demo seed. A "Shivam General Store" on Nai Sarak, Mathura.
// Safe to re-run: resets every table and rebuilds the same dataset.
import { db, q, transaction, nextCounter, fmtDateTime } from './db.js';
import crypto from 'node:crypto';

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
const round2 = (n) => Math.round(n * 100) / 100;

// ---------- password hashing (must match auth.js) ----------
export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt.toString('hex')}$${derived.toString('hex')}`;
}

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

export function clearAll() {
  for (const t of ['payments','invoice_items','invoices','purchase_items','purchases','expenses','stock_movements','products','categories','customers','suppliers','sessions','users','business','counters']) {
    db.exec(`DELETE FROM ${t}`);
  }
  db.exec("INSERT OR IGNORE INTO counters(key, value) VALUES ('invoice', 0), ('purchase', 0)");
}

export function seedDatabase() {
  transaction(() => {
    clearAll();

    // ---------- business profile ----------
    db.prepare(`INSERT INTO business(id, name, owner_name, email, phone, address, city, state, pincode, gstin, invoice_prefix, purchase_prefix, upi_id, currency, default_tax, footer_note, terms)
      VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'INV', 'PUR', ?, 'INR', 18, ?, ?)`).run(
      'Shivam General Store', 'Aarav Sharma', 'aarav@shivamstore.in', '0565-2401234',
      '27 Nai Sarak, Near Jama Masjid', 'Mathura', 'Uttar Pradesh', '281001', '09AAHCS1234A1Z5', 'shivamgeneral@ybl',
      'GSTIN 09AAHCS1234A1Z5 · Goods once sold will not be taken back · E. & O.E.',
      'Subject to Mathura jurisdiction.' );

    // ---------- users ----------
    db.prepare('INSERT INTO users(name, email, password_hash, role) VALUES (?,?,?,?)')
      .run('Aarav Sharma', 'aarav@shopdesk.demo', hashPassword('demo1234'), 'admin');
    db.prepare('INSERT INTO users(name, email, password_hash, role) VALUES (?,?,?,?)')
      .run('Riya Verma', 'riya@shopdesk.demo', hashPassword('demo1234'), 'staff');

    // ---------- categories ----------
    const catIds = [];
    for (const c of CATEGORIES) {
      const r = db.prepare('INSERT INTO categories(name, color) VALUES (?,?)').run(c.name, c.color);
      catIds.push(Number(r.lastInsertRowid));
    }

    // ---------- products ----------
    const productRows = [];
    PRODUCTS.forEach(([name, unit, price, costRatio, tax, reorder], i) => {
      const sku = `SD-${String(i + 1).padStart(3, '0')}`;
      const barcode = String(8901234500000 + i * 137 + Math.floor(rand() * 90));
      const cost = round2(price * costRatio * 0.82);
      const r = db.prepare(`INSERT INTO products(sku, barcode, name, category_id, unit, price, cost, tax_rate, stock, reorder_level, favorite)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
        .run(sku, barcode, name, catIds[CAT_OF[i]], unit, price, cost, tax, 100, reorder, i % 17 === 0 ? 1 : 0);
      productRows.push({ id: Number(r.lastInsertRowid), name, price, cost, tax, index: i });
    });

    // ---------- customers & suppliers ----------
    const customerIds = [];
    for (const [name, phone, email, gstin, address, city] of CUSTOMERS) {
      const r = db.prepare('INSERT INTO customers(name, phone, email, gstin, address, city) VALUES (?,?,?,?,?,?)')
        .run(name, phone, email, gstin, address, city);
      customerIds.push(Number(r.lastInsertRowid));
    }
    const supplierIds = [];
    for (const [name, phone, email, gstin, address, city] of SUPPLIERS) {
      const r = db.prepare('INSERT INTO suppliers(name, phone, email, gstin, address, city) VALUES (?,?,?,?,?,?)')
        .run(name, phone, email, gstin, address, city);
      supplierIds.push(Number(r.lastInsertRowid));
    }

    // ---------- sales history (75 days) ----------
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let invoiceSeq = 0;
    let creditPool = 0;
    const payUsage = { cash: 0, upi: 0, card: 0, bank: 0, credit: 0 };

    for (let d = 74; d >= 0; d--) {
      const day = new Date(today);
      day.setDate(day.getDate() - d);
      const wd = day.getDay();
      const seasonal = 0.9 + Math.sin((74 - d) * 0.42) * 0.18 + rand() * 0.25;
      const bills = Math.max(3, Math.round((8 + rand() * 6) * WEEKDAY_FACTOR[wd] * seasonal));
      const isToday = d === 0;
      const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();

      for (let b = 0; b < bills; b++) {
        const hour = 8 + Math.floor(rand() * 13) + (rand() < 0.35 ? 0 : 0); // 8..20
        const minute = Math.floor(rand() * 60);
        if (isToday && hour * 60 + minute > nowMinutes - 10) continue; // never in the future
        const when = new Date(day);
        when.setHours(Math.min(hour, 21), minute, Math.floor(rand() * 60), 0);

        const itemCount = 1 + Math.floor(Math.pow(rand(), 1.6) * 5); // weighted toward small baskets
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
          const tax = round2(taxable * p.tax / 100);
          gross = round2(gross + qty * p.price);
          taxableSum = round2(taxableSum + taxable);
          taxSum = round2(taxSum + tax);
          lines.push({ p, qty, lineDisc, taxable, tax, total: round2(taxable + tax) });
        }

        const cgst = round2(taxSum / 2), sgst = round2(taxSum - cgst);
        const billDiscount = gross > 400 && chance(0.18) ? pick([10, 20, 25]) : 0;
        const grand = Math.max(0, round2(taxableSum + taxSum - billDiscount));

        // payment mix: UPI leads, cash solid, card rare, some credit
        const r = rand();
        const method = r < 0.33 ? 'cash' : r < 0.71 ? 'upi' : r < 0.83 ? 'card' : r < 0.88 ? 'bank' : 'credit';
        payUsage[method]++;
        let paid = grand;
        let status = 'paid';
        if (method === 'credit') {
          if (chance(0.45)) { paid = 0; status = 'unpaid'; }
          else { paid = round2(grand * (0.3 + rand() * 0.5)); status = 'partial'; }
          creditPool = round2(creditPool + (grand - paid));
        }

        invoiceSeq++;
        const invoiceNo = `INV-${String(invoiceSeq).padStart(4, '0')}`;
        const isRegistered = chance(0.45);
        const cId = isRegistered ? pick(customerIds) : null;
        const cName = cId ? CUSTOMERS[customerIds.indexOf(cId)][0] : 'Walk-in Customer';
        const ts = fmtDateTime(when);
        const ir = db.prepare(`INSERT INTO invoices(invoice_no, customer_id, customer_name, is_interstate, date, subtotal, discount, taxable, cgst, sgst, igst, tax_total, grand_total, paid, payment_method, status, notes, created_by, created_at)
          VALUES (?,?,?,0,?,?,?,?,?,?,0,?,?,?,?,?,?,'Seed',?)`)
          .run(invoiceNo, cId, cName, ts, gross, billDiscount, taxableSum, cgst, sgst, taxSum, grand, paid, method, status, '', ts);
        const invoiceId = Number(ir.lastInsertRowid);
        for (const l of lines) {
          db.prepare(`INSERT INTO invoice_items(invoice_id, product_id, name, qty, price, discount, tax_rate, taxable, tax_amount, line_total)
            VALUES (?,?,?,?,?,?,?,?,?,?)`)
            .run(invoiceId, l.p.id, l.p.name, l.qty, l.p.price, l.lineDisc, l.p.tax, l.taxable, l.tax, l.total);
        }
        if (paid > 0) {
          db.prepare('INSERT INTO payments(invoice_id, amount, method, note, date) VALUES (?,?,?,?,?)')
            .run(invoiceId, paid, method === 'credit' ? 'cash' : method, 'Seed', ts);
        }
      }
    }
    db.prepare("UPDATE counters SET value = ? WHERE key = 'invoice'").run(invoiceSeq);

    // ---------- purchases (stock-in) ----------
    let purchaseSeq = 0;
    const purchaseDates = [70, 56, 41, 27, 12, 3];
    for (const d of purchaseDates) {
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
        const tax = round2(taxable * p.tax / 100);
        subtotal = round2(subtotal + taxable);
        taxTotal = round2(taxTotal + tax);
        lines.push({ p, qty, taxable, tax, total: round2(taxable + tax) });
      }
      const grand = round2(subtotal + taxTotal);
      purchaseSeq++;
      const purchaseNo = `PUR-${String(purchaseSeq).padStart(4, '0')}`;
      const paid = d <= 3 ? grand : round2(grand * (chance(0.75) ? 1 : 0.6));
      const pr = db.prepare(`INSERT INTO purchases(purchase_no, supplier_id, supplier_name, date, subtotal, tax_total, grand_total, paid, status, notes, created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
        .run(purchaseNo, supplierIds[supplierIdx], SUPPLIERS[supplierIdx][0], ts, subtotal, taxTotal, grand, paid, 'received', '', ts);
      const purchaseId = Number(pr.lastInsertRowid);
      for (const l of lines) {
        db.prepare(`INSERT INTO purchase_items(purchase_id, product_id, name, qty, cost, tax_rate, taxable, tax_amount, line_total)
          VALUES (?,?,?,?,?,?,?,?,?)`)
          .run(purchaseId, l.p.id, l.p.name, l.qty, l.p.cost, l.p.tax, l.taxable, l.tax, l.total);
      }
    }
    db.prepare("UPDATE counters SET value = ? WHERE key = 'purchase'").run(purchaseSeq);

    // ---------- expenses ----------
    const expSeeds = [];
    for (let m = 2; m >= 0; m--) {
      const d = new Date(today.getFullYear(), today.getMonth() - m, 5, 10, 0, 0, 0);
      if (d <= today) expSeeds.push(['Rent (Shop + Godown)', 7500, d]);
      const s1 = new Date(today.getFullYear(), today.getMonth() - m, 1, 10, 0, 0, 0);
      if (s1 <= today) expSeeds.push(['Salary — Riya (Billing)', 8000, s1]);
      const s15 = new Date(today.getFullYear(), today.getMonth() - m, 15, 10, 0, 0, 0);
      if (s15 <= today) expSeeds.push(['Salary — Riya (Billing)', 8000, s15]);
      const e = new Date(today.getFullYear(), today.getMonth() - m, 10, 10, 0, 0, 0);
      if (e <= today) expSeeds.push(['Electricity (PVVNL)', 2400 + Math.round(rand() * 1100), e]);
      const net = new Date(today.getFullYear(), today.getMonth() - m, 18, 10, 0, 0, 0);
      if (net <= today) expSeeds.push(['Internet & Billing Software', 1299, net]);
    }
    for (let i = 0; i < 22; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - Math.floor(rand() * 74));
      d.setHours(9 + Math.floor(rand() * 11), Math.floor(rand() * 60), 0, 0);
      expSeeds.push([pick(['Transport / Dharmkata', 'Packaging (Bags & Labels)', 'Chai & Refreshment', 'Repair & Maintenance', 'Stationery & Printing', 'Miscellaneous']), Math.round(80 + rand() * 700), d]);
    }
    for (const [category, amount, when] of expSeeds) {
      db.prepare('INSERT INTO expenses(category, amount, date, payment_method, notes, created_at) VALUES (?,?,?,?,?,?)')
        .run(category, amount, fmtDateTime(when), chance(0.6) ? 'cash' : 'upi', '', fmtDateTime(when));
    }

    // ---------- curated stock levels (healthy + low + one out) ----------
    const healthy = (i, v) => { const p = productRows[i]; db.prepare('UPDATE products SET stock = ? WHERE id = ?').run(v, p.id); };
    const LOW = { 16: 18, 26: 9, 8: 11, 37: 6, 33: 14, 58: 3, 12: 6, 36: 8 };  // Kurkure, Dairy Milk, Tata Salt, Bread, Amul Gold, Pampers, Chilli, Curd
    productRows.forEach((p) => {
      if (LOW[p.index] !== undefined) {
        db.prepare('UPDATE products SET stock = ? WHERE id = ?').run(LOW[p.index], p.id);
      } else {
        healthy(p.index, 30 + Math.floor(rand() * 190));
      }
    });
    db.prepare('UPDATE products SET stock = 0 WHERE id = ?').run(productRows[55].id); // Mortein spray — out of stock

    // opening stock movements
    const mv = db.prepare('INSERT INTO stock_movements(product_id, delta, reason, ref, created_at) VALUES (?,?,?,?,?)');
    const nowTs = fmtDateTime(new Date());
    for (const p of productRows) {
      const row = q.get('SELECT stock FROM products WHERE id = ?', p.id);
      mv.run(p.id, Number(row.stock), 'opening', 'Opening stock', nowTs);
    }
  });

  const counts = q.get('SELECT (SELECT COUNT(*) FROM invoices) AS invoices, (SELECT COUNT(*) FROM products) AS products, (SELECT COUNT(*) FROM customers) AS customers');
  console.log(`Seeded demo business: ${counts.invoices} invoices · ${counts.products} products · ${counts.customers} customers`);
}

// CLI entry: node server/seed.js
if (process.argv[1] && process.argv[1].endsWith('seed.js')) {
  seedDatabase();
  process.exit(0);
}
