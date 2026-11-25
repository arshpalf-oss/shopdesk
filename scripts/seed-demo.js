// shopdesk — create or refresh the shared demo workspace (SaaS landing-page demo).
// Usage:
//   MONGODB_URI="mongodb+srv://..." npm run seed
// Result: a "Shivam General Store" workspace owned by aarav@shopdesk.demo / demo1234
// (staff login riya@shopdesk.demo / demo1234), topped up with the full 75-day dataset.
import { connectMongo, disconnectMongo, models } from '../server/db.js';
import { seedBusinessData, clearBusinessData } from '../server/seed.js';
import { hashPassword } from '../server/auth.js';

const DEMO_BUSINESS = {
  name: 'Shivam General Store',
  owner_name: 'Aarav Sharma',
  email: 'aarav@shivamstore.in',
  phone: '0565-2401234',
  address: '27 Nai Sarak, Near Jama Masjid',
  city: 'Mathura',
  state: 'Uttar Pradesh',
  pincode: '281001',
  gstin: '09AAHCS1234A1Z5',
  invoice_prefix: 'INV',
  purchase_prefix: 'PUR',
  upi_id: 'shivamgeneral@ybl',
  currency: 'INR',
  default_tax: 18,
  footer_note: 'GSTIN 09AAHCS1234A1Z5 · Goods once sold will not be taken back · E. & O.E.',
  terms: 'Subject to Mathura jurisdiction.',
  plan: 'pro',
  is_demo: true,
};

try {
  await connectMongo();

  // wipe any previous demo workspace(s) completely
  const previous = await models.Business.find({ is_demo: true }).select('_id').lean();
  for (const p of previous) {
    await clearBusinessData(p._id);
    await models.User.deleteMany({ businessId: p._id });
    await models.Session.deleteMany({ businessId: p._id });
    await models.Business.deleteOne({ _id: p._id });
  }

  const business = await models.Business.create(DEMO_BUSINESS);
  await models.User.create([
    { businessId: business._id, name: 'Aarav Sharma', email: 'aarav@shopdesk.demo', password_hash: hashPassword('demo1234'), role: 'admin' },
    { businessId: business._id, name: 'Riya Verma', email: 'riya@shopdesk.demo', password_hash: hashPassword('demo1234'), role: 'staff' },
  ]);

  const counts = await seedBusinessData(business._id);
  console.log(`Demo workspace ready → ${counts.invoices} invoices · ${counts.products} products · ${counts.customers} customers`);
  console.log('Owner login:  aarav@shopdesk.demo / demo1234');
  console.log('Staff login:  riya@shopdesk.demo  / demo1234');
  await disconnectMongo();
  process.exit(0);
} catch (err) {
  console.error('Demo seed failed:', err);
  process.exit(1);
}
