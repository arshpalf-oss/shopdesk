// Test-only objects. Never imported by the application or inserted in a clinic database.
import { calculateTotals, today } from "../shared.js";
export function documentFixture(count = 2) {
  const lines = Array.from({ length: count }, (_, index) => ({
    name:
      index % 2
        ? "Veterinary consultation"
        : "Veterinary medicine with a longer item description",
    product_id: `test-item-${index}`,
    hsn: index % 2 ? "998351" : "30049085",
    unit: index % 2 ? "service" : "bottle",
    qty: index % 2 ? 1 : 2,
    rate: index % 2 ? 500 : 100,
    discount: index % 2 ? 0 : 10,
    gst_rate: index % 2 ? 0 : 5,
    tax_treatment: index % 2 ? "exempt" : "taxable",
    batches:
      index % 2
        ? []
        : [{ batch_no: "TEST-BATCH", expiry: "2030-12-31", qty: 2 }],
  }));
  const totals = calculateTotals(lines, { registered: true });
  return {
    id: "test-document",
    number: "SD/26-27/00001",
    status: "issued",
    date: today(),
    due_date: today(),
    document_type: "Invoice-cum-Bill of Supply",
    inclusive: false,
    place_of_supply: "09",
    ...totals,
    paid: 20000,
    balance: totals.total - 20000,
    refund_due: 0,
    notes: "Test-only document. No business record is created.",
    terms: "Terms supplied by the clinic appear here.",
    clinic: {
      name: "Document test clinic",
      address: "Test clinic address",
      city: "Test city",
      state: "09",
      phone: "9000000000",
      email: "clinic@example.invalid",
      gst_registered: true,
      gstin: "09ABCDE1234F1Z5",
      registration_no: "TEST-VET",
      drug_license: "TEST-LICENCE",
      bank_name: "Test bank",
      account_name: "Document test clinic",
      account_number: "0000000000",
      ifsc: "TEST0000001",
      upi_id: "test@example",
    },
    customer: {
      name: "Document test customer",
      address: "Test billing address",
      phone: "9000000001",
      state: "09",
      gstin: "",
    },
    pet: { name: "Test patient", species: "Dog" },
  };
}
