export const STATES = [
  ["01", "Jammu & Kashmir"],
  ["02", "Himachal Pradesh"],
  ["03", "Punjab"],
  ["04", "Chandigarh"],
  ["05", "Uttarakhand"],
  ["06", "Haryana"],
  ["07", "Delhi"],
  ["08", "Rajasthan"],
  ["09", "Uttar Pradesh"],
  ["10", "Bihar"],
  ["11", "Sikkim"],
  ["12", "Arunachal Pradesh"],
  ["13", "Nagaland"],
  ["14", "Manipur"],
  ["15", "Mizoram"],
  ["16", "Tripura"],
  ["17", "Meghalaya"],
  ["18", "Assam"],
  ["19", "West Bengal"],
  ["20", "Jharkhand"],
  ["21", "Odisha"],
  ["22", "Chhattisgarh"],
  ["23", "Madhya Pradesh"],
  ["24", "Gujarat"],
  ["26", "Dadra & Nagar Haveli and Daman & Diu"],
  ["27", "Maharashtra"],
  ["29", "Karnataka"],
  ["30", "Goa"],
  ["31", "Lakshadweep"],
  ["32", "Kerala"],
  ["33", "Tamil Nadu"],
  ["34", "Puducherry"],
  ["35", "Andaman & Nicobar Islands"],
  ["36", "Telangana"],
  ["37", "Andhra Pradesh"],
  ["38", "Ladakh"],
  ["97", "Other territory"],
];
export const CATEGORIES = [
  "Medicines",
  "Vaccines",
  "Pet food",
  "Consumables",
  "Accessories",
  "Services",
  "Other",
];
export const UNITS = [
  "piece",
  "tablet",
  "strip",
  "bottle",
  "vial",
  "dose",
  "bag",
  "pack",
  "box",
  "ml",
  "litre",
  "gram",
  "kg",
  "service",
];
export const PAYMENT_METHODS = [
  "Cash",
  "UPI",
  "Card",
  "Bank transfer",
  "Cheque",
  "Other",
];
export const HSN_CODES = [
  {
    code: "3004",
    type: "HSN",
    category: "Medicines",
    name: "Medicaments in measured doses / retail packs",
    note: "Broad heading. Choose the correct detailed code for the specific medicine.",
  },
  {
    code: "30049085",
    type: "HSN",
    category: "Medicines",
    name: "Veterinary medicinal preparations",
    note: "Not for human use; not elsewhere specified or included. Check formulation-specific headings first.",
  },
  {
    code: "3003",
    type: "HSN",
    category: "Medicines",
    name: "Medicaments not in measured doses or retail packs",
    note: "Mixed therapeutic or prophylactic preparations, excluding specified headings.",
  },
  {
    code: "30024200",
    type: "HSN",
    category: "Vaccines",
    name: "Vaccines for veterinary medicine",
    note: "Veterinary vaccines; confirm the exact product classification.",
  },
  {
    code: "3005",
    type: "HSN",
    category: "Consumables",
    name: "Medical dressings, gauze & bandages",
    note: "Impregnated, coated or packed for medical, surgical, dental or veterinary use.",
  },
  {
    code: "9018",
    type: "HSN",
    category: "Consumables",
    name: "Medical, surgical & veterinary instruments",
    note: "Broad heading; select a more specific subheading where required.",
  },
  {
    code: "90183100",
    type: "HSN",
    category: "Consumables",
    name: "Syringes, with or without needles",
    note: "Medical, surgical, dental or veterinary syringes.",
  },
  {
    code: "901832",
    type: "HSN",
    category: "Consumables",
    name: "Tubular metal needles & needles for sutures",
    note: "Choose the applicable detailed tariff item for the product.",
  },
  {
    code: "23091000",
    type: "HSN",
    category: "Pet food",
    name: "Dog or cat food, put up for retail sale",
    note: "Other feed, supplements and therapeutic preparations may be classified differently.",
  },
  {
    code: "2309",
    type: "HSN",
    category: "Pet food",
    name: "Preparations used in animal feeding",
    note: "Broad heading; exclusions and exemptions vary by feed and use.",
  },
  {
    code: "4201",
    type: "HSN",
    category: "Accessories",
    name: "Animal saddlery, harnesses & leads",
    note: "Includes animal harnesses, leads, muzzles and similar articles, of any material.",
  },
  {
    code: "330510",
    type: "HSN",
    category: "Other",
    name: "Shampoos",
    note: "Non-medicinal shampoos. A medicinal formulation may have a different classification.",
  },
  {
    code: "38089400",
    type: "HSN",
    category: "Other",
    name: "Disinfectants",
    note: "Confirm product composition and applicable notification.",
  },
  {
    code: "998351",
    type: "SAC",
    category: "Services",
    name: "Veterinary services for pet animals",
    note: "Veterinary clinic animal/bird healthcare may be exempt under Entry 46 of Notification 12/2017-CT(R). Separately sold goods and non-healthcare services need their own treatment.",
  },
  {
    code: "998352",
    type: "SAC",
    category: "Services",
    name: "Veterinary services for livestock",
    note: "Animal/bird healthcare exemption may apply. Husbandry and other services can have different classifications.",
  },
  {
    code: "998359",
    type: "SAC",
    category: "Services",
    name: "Other veterinary services, n.e.c.",
    note: "Do not assume an exemption from the code alone. Verify the actual service and applicable notification.",
  },
];
export const SOURCES = [
  {
    title: "CBIC · Scheme of classification of services",
    url: "https://cbic-gst.gov.in/hindi/pdf/central-tax-rate/Notification11-CGST-Annexure.pdf",
  },
  {
    title: "CBIC · Healthcare exemption, Entry 46",
    url: "https://cbic-gst.gov.in/hindi/pdf/central-tax-rate/Notification12-CGST.pdf",
  },
  {
    title: "CBIC · Goods rate notification 9/2025-IGST(R)",
    url: "https://courier.cbic.gov.in/ECCS/advisory/2025/NOTIFICATION%20NO.%209_2025-INTEGRATED%20TAX%20(RATE)%20-1759486719.pdf",
  },
  {
    title: "GST portal · Verify HSN / SAC",
    url: "https://services.gst.gov.in/services/searchhsnsac",
  },
];
export const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export const paise = (n) => Math.round((Number(n) + Number.EPSILON) * 100);
export const money = (n = 0) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  }).format(n / 100);
export const quantity = (n) =>
  Math.round((Number(n) + Number.EPSILON) * 1000) / 1000;
export const stateName = (code) => STATES.find((s) => s[0] === code)?.[1] || "";
export const fiscalYear = (date) => {
  const d = new Date(date + "T12:00:00Z");
  const y = d.getUTCFullYear() - (d.getUTCMonth() < 3 ? 1 : 0);
  return `${String(y).slice(2)}-${String(y + 1).slice(2)}`;
};
export function calculateTotals(
  lines,
  {
    registered = false,
    interstate = false,
    inclusive = false,
    roundOff = false,
  } = {},
) {
  let subtotal = 0,
    discount = 0,
    taxable = 0,
    cgst = 0,
    sgst = 0,
    igst = 0,
    tax = 0;
  const calculated = lines.map((line) => {
    const rate = paise(line.rate),
      qty = quantity(line.qty),
      gross = Math.round(rate * qty),
      disc = Math.round((gross * Number(line.discount || 0)) / 100);
    const gst =
      registered && line.tax_treatment === "taxable"
        ? Number(line.gst_rate)
        : 0;
    const net = gross - disc;
    let base,
      c = 0,
      s = 0,
      i = 0;
    if (interstate) {
      // IGST remains a single component, with the existing inclusive/exclusive rule.
      base = inclusive && gst ? Math.round(net / (1 + gst / 100)) : net;
      i = inclusive ? net - base : Math.round((base * gst) / 100);
    } else {
      // Round each equal half-rate liability, rather than splitting an already
      // rounded total and assigning its odd paise to only one component.
      const component = inclusive
        ? Math.round((net * gst) / (200 + 2 * gst))
        : Math.round((net * gst) / 200);
      c = component;
      s = component;
      // Inclusive prices are the amount the client entered/agreed to pay.
      // Derive the supply value after both components so that amount stays exact.
      base = inclusive ? net - c - s : net;
    }
    const lineTax = c + s + i;
    subtotal += gross;
    discount += disc;
    taxable += base;
    tax += lineTax;
    cgst += c;
    sgst += s;
    igst += i;
    return {
      ...line,
      rate,
      qty,
      gst_rate: gst,
      gross,
      discount_amount: disc,
      taxable: base,
      tax: lineTax,
      cgst: c,
      sgst: s,
      igst: i,
      total: base + lineTax,
    };
  });
  const before_round = taxable + tax;
  const rounding = roundOff
    ? Math.round(before_round / 100) * 100 - before_round
    : 0;
  return {
    lines: calculated,
    subtotal,
    discount,
    taxable,
    cgst,
    sgst,
    igst,
    tax,
    rounding,
    total: before_round + rounding,
  };
}
export function amountWords(p) {
  const n = Math.floor(Math.abs(p) / 100),
    dec = Math.abs(p) % 100;
  const ones = [
    "",
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen",
  ];
  const tens = [
    "",
    "",
    "Twenty",
    "Thirty",
    "Forty",
    "Fifty",
    "Sixty",
    "Seventy",
    "Eighty",
    "Ninety",
  ];
  const part = (x) =>
    x < 20
      ? ones[x]
      : x < 100
        ? tens[Math.floor(x / 10)] + (x % 10 ? " " + ones[x % 10] : "")
        : ones[Math.floor(x / 100)] +
          " Hundred" +
          (x % 100 ? " " + part(x % 100) : "");
  let v = n,
    s = "";
  for (const [size, label] of [
    [10000000, "Crore"],
    [100000, "Lakh"],
    [1000, "Thousand"],
  ]) {
    if (v >= size) {
      s += part(Math.floor(v / size)) + " " + label + " ";
      v %= size;
    }
  }
  return (
    "Rupees " +
    (s + part(v) || "Zero").trim() +
    (dec ? " and " + part(dec) + " Paise" : "") +
    " Only"
  );
}
