// shopdesk — pure billing math & shared helpers (no I/O, unit-tested)

export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export function computeLine({ qty, price, discount = 0, tax_rate = 0 }) {
  const gross = qty * price;
  const taxable = round2(gross * (1 - discount / 100));
  const tax = round2((taxable * tax_rate) / 100);
  return { gross: round2(gross), taxable, tax, lineTotal: round2(taxable + tax) };
}

export function invoiceStatus(paid, grandTotal) {
  if (paid >= grandTotal - 0.5) return 'paid';
  if (paid > 0) return 'partial';
  return 'unpaid';
}

/** Split a whole-bill CGST/SGST/IGST split for Indian GST. */
export function gstSplit(taxSum, isInterstate) {
  if (isInterstate) return { cgst: 0, sgst: 0, igst: round2(taxSum) };
  const cgst = round2(taxSum / 2);
  return { cgst, sgst: round2(taxSum - cgst), igst: 0 };
}
