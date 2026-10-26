import React, { useState, useRef } from "react";
import {
  Plus,
  Truck,
  Package,
  Wallet,
  ReceiptText,
  Trash2,
  ArrowDownToLine,
  Building2,
  ArrowUpRight,
  ShieldCheck,
  CheckCircle2,
  Download,
} from "lucide-react";
import {
  useDesk,
  api,
  download,
  Button,
  IconButton,
  PageHeader,
  Panel,
  EmptyState,
  Table,
  Money,
  Badge,
  SearchBox,
  SearchSelect,
  Field,
  Dialog,
  ErrorBox,
  Notice,
  SectionTitle,
  Avatar,
  useForm,
  useTask,
  fmtDate,
  matches,
} from "./ui.jsx";
import { money, paise, today, PAYMENT_METHODS } from "../shared.js";
export function Purchases() {
  const { state, open } = useDesk(),
    [q, setQ] = useState("");
  const purchases = state.purchases.filter((p) =>
    matches(
      q,
      p.invoice_no,
      state.suppliers.find((s) => s.id === p.supplier_id)?.name,
    ),
  );
  return (
    <>
      <PageHeader
        title="Purchases"
        description="Receive stock. Record the bill. Keep everything connected."
        actions={
          <Button icon={Plus} onClick={() => open("purchase")}>
            Record purchase
          </Button>
        }
      />
      <div className="billing-summary">
        <div>
          <span className="soft-icon blue">
            <Truck size={21} />
          </span>
          <div>
            <span>Total purchases</span>
            <strong>
              {money(state.purchases.reduce((n, p) => n + p.total, 0))}
            </strong>
          </div>
        </div>
        <div>
          <span className="soft-icon amber">
            <Wallet size={21} />
          </span>
          <div>
            <span>Payable to suppliers</span>
            <strong>
              {money(state.purchases.reduce((n, p) => n + p.total - p.paid, 0))}
            </strong>
          </div>
        </div>
        <div>
          <span className="soft-icon">
            <ReceiptText size={21} />
          </span>
          <div>
            <span>Supplier bills recorded</span>
            <strong>{state.purchases.length}</strong>
          </div>
        </div>
      </div>
      <Panel>
        <div className="list-toolbar">
          <SearchBox
            value={q}
            onChange={setQ}
            placeholder="Search supplier or bill number…"
          />
          <span className="tiny muted">
            Stock is received when you save a purchase.
          </span>
        </div>
        <Table
          head={[
            "SUPPLIER BILL",
            "SUPPLIER",
            "DATE",
            "TOTAL",
            "PAYABLE",
            "STATUS",
            "",
          ]}
          empty={
            !purchases.length && (
              <EmptyState
                icon={Truck}
                title={
                  q
                    ? "No purchases found"
                    : "New stock, with a clear paper trail"
                }
                description={
                  q
                    ? "Try a different supplier or bill number."
                    : "Record your supplier’s invoice to receive products into the right batches and track what you owe."
                }
                action={
                  !q && (
                    <Button icon={Plus} onClick={() => open("purchase")}>
                      Record your first purchase
                    </Button>
                  )
                }
              />
            )
          }
        >
          {purchases.map((p) => (
            <tr
              key={p.id}
              className="clickable"
              onClick={() => open("purchaseView", { id: p.id })}
            >
              <td>
                <strong className="table-primary">{p.invoice_no}</strong>
                <span className="table-secondary">
                  {p.lines.length} line items
                </span>
              </td>
              <td>
                {state.suppliers.find((s) => s.id === p.supplier_id)?.name}
              </td>
              <td>{fmtDate(p.date)}</td>
              <td>
                <Money value={p.total} />
              </td>
              <td>
                <Money value={p.total - p.paid} />
              </td>
              <td>
                {p.paid === p.total ? (
                  <Badge tone="green" dot>
                    Paid
                  </Badge>
                ) : p.paid > 0 ? (
                  <Badge tone="amber" dot>
                    Part paid
                  </Badge>
                ) : (
                  <Badge tone="amber" dot>
                    Unpaid
                  </Badge>
                )}
              </td>
              <td>
                <IconButton
                  icon={ArrowUpRight}
                  label={"View purchase " + p.invoice_no}
                  onClick={(e) => {
                    e.stopPropagation();
                    open("purchaseView", { id: p.id });
                  }}
                />
              </td>
            </tr>
          ))}
        </Table>
        <div className="table-footer">
          <span>{purchases.length} purchases</span>
          <span>
            <ShieldCheck size={13} /> Batch-level receiving
          </span>
        </div>
      </Panel>
      <div className="inline-tip">
        <Package size={16} />
        <span>
          Recorded purchases are permanent stock receipts. Use a reasoned stock
          adjustment for any correction, waste, or return.
        </span>
      </div>
    </>
  );
}
export function PurchaseForm({ supplierId }) {
  const { state, open, refresh, close, toast } = useDesk();
  const [form, setForm, field] = useForm({
      supplier_id: supplierId || "",
      invoice_no: "",
      date: today(),
      notes: "",
      payment_amount: "",
      payment_method: "Bank transfer",
      payment_reference: "",
    }),
    [lines, setLines] = useState([]),
    [payMode, setPayMode] = useState("unpaid"),
    task = useTask(),
    ref = useRef();
  const products = state.products.filter(
    (p) => p.type === "product" && p.active,
  );
  const calculated = lines.map((l) => {
    const base = Math.round(paise(l.cost) * Number(l.qty)),
      tax = Math.round((base * Number(l.gst_rate)) / 100);
    return { ...l, base, tax, total: base + tax };
  });
  const subtotal = calculated.reduce((n, l) => n + l.base, 0),
    tax = calculated.reduce((n, l) => n + l.tax, 0),
    total = subtotal + tax;
  const update = (i, key, value) =>
    setLines((ls) =>
      ls.map((l, index) => (i === index ? { ...l, [key]: value } : l)),
    );
  const save = () => {
    if (!ref.current.reportValidity()) return;
    if (!lines.length) {
      task.setError("Add at least one inventory product to receive.");
      return;
    }
    task.run(async () => {
      const r = await api("/purchases", {
        method: "POST",
        body: {
          ...form,
          lines: lines.map((l) => ({
            product_id: l.product_id,
            qty: Number(l.qty),
            cost: Number(l.cost),
            gst_rate: Number(l.gst_rate),
            batch_no: l.batch_no,
            expiry: l.expiry,
          })),
          payment_amount:
            payMode === "full"
              ? total / 100
              : payMode === "partial"
                ? Number(form.payment_amount)
                : 0,
        },
      });
      await refresh();
      close();
      open("purchaseView", { id: r.id });
      toast("Purchase recorded. Your stock is up to date.");
    });
  };
  return (
    <Dialog
      title="Record a purchase"
      subtitle="One supplier bill. A complete stock receipt."
      xwide
      busy={task.busy}
      footer={
        <>
          <span className="footer-hint">
            <ArrowDownToLine size={14} /> Saving receives stock immediately.
          </span>
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button loading={task.busy} icon={CheckCircle2} onClick={save}>
            Save & receive stock
          </Button>
        </>
      }
    >
      <form ref={ref} onSubmit={(e) => e.preventDefault()}>
        <div className="purchase-top-fields">
          <div>
            <div className="label-with-action">
              <label htmlFor="purchase-supplier">
                Supplier <span className="required">*</span>
              </label>
              <button
                type="button"
                onClick={() =>
                  open("supplier", {
                    onSaved: (supplier_id) =>
                      setForm((f) => ({ ...f, supplier_id })),
                  })
                }
              >
                <Plus size={12} />
                Add supplier
              </button>
            </div>
            <select id="purchase-supplier" {...field("supplier_id")} required>
              <option value="" disabled>
                Select supplier
              </option>
              {state.suppliers.map((s) => (
                <option value={s.id} key={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <Field label="Supplier invoice number" required>
            <input
              {...field("invoice_no")}
              placeholder="Number on the supplier’s bill"
              required
              maxLength={100}
            />
          </Field>
          <Field label="Purchase date" required>
            <input type="date" {...field("date")} max={today()} required />
          </Field>
        </div>
        <SectionTitle note="Enter prices before GST. Use the net unit cost shown on the supplier bill.">
          Products received
        </SectionTitle>
        <div className="item-search-row">
          <SearchSelect
            items={products}
            placeholder="Find products by name, SKU, or barcode…"
            onPick={(p) =>
              setLines((ls) => [
                ...ls,
                {
                  product_id: p.id,
                  name: p.name,
                  unit: p.unit,
                  hsn: p.hsn,
                  category: p.category,
                  qty: 1,
                  cost: p.cost_price / 100,
                  gst_rate: p.tax_treatment === "taxable" ? p.gst_rate : 0,
                  batch_no: "",
                  expiry: "",
                },
              ])
            }
            renderItem={(p) => (
              <>
                <span className="item-icon">
                  <Package size={17} />
                </span>
                <span className="pick-item-name">
                  <strong>{p.name}</strong>
                  <small>
                    {p.hsn} · {p.unit}
                  </small>
                </span>
                <span className="pick-price">
                  {money(p.cost_price)}
                  <small>last cost price</small>
                </span>
              </>
            )}
          />
          <Button
            variant="secondary"
            type="button"
            icon={Plus}
            onClick={() => open("product")}
          >
            New product
          </Button>
        </div>
        {!products.length && (
          <Notice>
            Add your own products to the catalogue first. You can leave opening
            stock empty, then receive it through this purchase.
          </Notice>
        )}
        <div className="purchase-lines">
          {!lines.length ? (
            <div className="purchase-lines-empty">
              <Truck size={30} strokeWidth={1.3} />
              <strong>What arrived at your clinic?</strong>
              <p>
                Select a product above to add its quantity, batch, and cost.
              </p>
            </div>
          ) : (
            lines.map((l, i) => (
              <div className="purchase-line" key={i}>
                <div className="purchase-line-heading">
                  <div>
                    <span className="line-number">{i + 1}</span>
                    <strong>{l.name}</strong>
                    <Badge>{l.hsn}</Badge>
                  </div>
                  <div>
                    <Money value={calculated[i].total} />
                    <IconButton
                      type="button"
                      icon={Trash2}
                      label={"Remove " + l.name}
                      onClick={() =>
                        setLines((ls) => ls.filter((_, index) => index !== i))
                      }
                    />
                  </div>
                </div>
                <div className="purchase-line-fields">
                  <Field label={"Quantity · " + l.unit} required>
                    <input
                      type="number"
                      value={l.qty}
                      onChange={(e) => update(i, "qty", e.target.value)}
                      min="0.001"
                      step="0.001"
                      max="10000000"
                      required
                    />
                  </Field>
                  <Field label="Unit cost (₹)" required>
                    <input
                      type="number"
                      value={l.cost}
                      onChange={(e) => update(i, "cost", e.target.value)}
                      min="0"
                      max="100000000"
                      step="0.01"
                      required
                    />
                  </Field>
                  <Field label="GST (%)" required>
                    <input
                      type="number"
                      value={l.gst_rate}
                      onChange={(e) => update(i, "gst_rate", e.target.value)}
                      min="0"
                      max="40"
                      step="0.01"
                      required
                    />
                  </Field>
                  <Field
                    label="Batch number"
                    required={["Medicines", "Vaccines"].includes(l.category)}
                  >
                    <input
                      value={l.batch_no}
                      onChange={(e) => update(i, "batch_no", e.target.value)}
                      required={["Medicines", "Vaccines"].includes(l.category)}
                      placeholder="Batch / lot"
                      maxLength={100}
                    />
                  </Field>
                  <Field
                    label="Expiry date"
                    required={["Medicines", "Vaccines"].includes(l.category)}
                  >
                    <input
                      type="date"
                      value={l.expiry}
                      onChange={(e) => update(i, "expiry", e.target.value)}
                      min={today()}
                      required={["Medicines", "Vaccines"].includes(l.category)}
                    />
                  </Field>
                </div>
              </div>
            ))
          )}
        </div>
        <div className="invoice-bottom-fields">
          <div>
            <SectionTitle>Supplier payment</SectionTitle>
            <select
              value={payMode}
              onChange={(e) => setPayMode(e.target.value)}
              aria-label="Supplier payment status"
            >
              <option value="unpaid">Unpaid · record payment later</option>
              <option value="full">Paid in full</option>
              <option value="partial">Part payment made</option>
            </select>
            {payMode !== "unpaid" && (
              <div className="form-grid mt-12">
                {payMode === "partial" && (
                  <Field label="Amount paid (₹)" required>
                    <input
                      type="number"
                      {...field("payment_amount")}
                      min="0.01"
                      step="0.01"
                      max={total / 100}
                      required
                    />
                  </Field>
                )}
                <Field label="Payment method">
                  <select {...field("payment_method")}>
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m}>{m}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Reference">
                  <input
                    {...field("payment_reference")}
                    placeholder="Payment reference (optional)"
                  />
                </Field>
              </div>
            )}
            <Field label="Purchase notes" className="mt-20">
              <textarea
                {...field("notes")}
                rows={2}
                maxLength={1500}
                placeholder="Optional internal notes"
              />
            </Field>
          </div>
          <div className="invoice-totals">
            <div>
              <span>Subtotal</span>
              <Money value={subtotal} />
            </div>
            <div>
              <span>GST on purchase</span>
              <Money value={tax} />
            </div>
            <div className="grand-total">
              <span>Purchase total</span>
              <Money value={total} />
            </div>
            <div className="balance-preview">
              <span>Amount payable</span>
              <Money
                value={Math.max(
                  0,
                  total -
                    (payMode === "full"
                      ? total
                      : payMode === "partial"
                        ? paise(form.payment_amount)
                        : 0),
                )}
              />
            </div>
          </div>
        </div>
        <Notice>
          Confirm every line against the supplier’s bill. Recorded input GST is
          for your purchase register only; it is not a claim of input-tax-credit
          eligibility.
        </Notice>
        <ErrorBox>{task.error}</ErrorBox>
      </form>
    </Dialog>
  );
}
export function PurchaseView({ id }) {
  const { state, open, close } = useDesk(),
    p = state.purchases.find((p) => p.id === id);
  if (!p) return null;
  const supplier = state.suppliers.find((s) => s.id === p.supplier_id),
    payments = state.payments.filter((x) => x.purchase_id === id);
  return (
    <Dialog
      title={"Supplier bill · " + p.invoice_no}
      subtitle={fmtDate(p.date) + " · Stock received"}
      xwide
      footer={
        <>
          <span className="footer-hint">
            Posted purchases cannot be edited.
          </span>
          <Button variant="secondary" onClick={close}>
            Close
          </Button>
          {p.total > p.paid && (
            <Button
              icon={Plus}
              onClick={() => open("payment", { id, purchase: true })}
            >
              Record supplier payment
            </Button>
          )}
        </>
      }
    >
      <div className="purchase-view-heading">
        <div className="item-cell">
          <span className="soft-icon blue">
            <Building2 size={24} />
          </span>
          <div>
            <h3>{supplier?.name}</h3>
            <p>
              {[supplier?.phone, supplier?.gstin].filter(Boolean).join(" · ")}
            </p>
          </div>
        </div>
        {p.paid === p.total ? (
          <Badge tone="green">Paid in full</Badge>
        ) : (
          <Badge tone="amber">{p.paid > 0 ? "Part paid" : "Unpaid"}</Badge>
        )}
      </div>
      <Table
        head={[
          "PRODUCT",
          "BATCH / EXPIRY",
          "QTY",
          "UNIT COST",
          "GST",
          "AMOUNT",
        ]}
      >
        {p.lines.map((l, i) => (
          <tr key={i}>
            <td>
              <strong className="table-primary">{l.name}</strong>
              <span className="table-secondary">{l.hsn}</span>
            </td>
            <td>
              {l.batch_no || "—"}
              <span className="table-secondary">
                {l.expiry ? fmtDate(l.expiry) : "No expiry"}
              </span>
            </td>
            <td>{l.qty}</td>
            <td>
              <Money value={l.cost} />
            </td>
            <td>
              {l.gst_rate}%
              <span className="table-secondary">{money(l.tax)}</span>
            </td>
            <td>
              <Money value={l.total} />
            </td>
          </tr>
        ))}
      </Table>
      <div className="paper-summary">
        <div>
          {p.notes && (
            <>
              <strong className="tiny">PURCHASE NOTES</strong>
              <p className="muted">{p.notes}</p>
            </>
          )}
          <p className="field-hint">
            Inventory batches were created automatically when this purchase was
            saved.
          </p>
        </div>
        <div className="invoice-totals">
          <div>
            <span>Subtotal</span>
            <Money value={p.subtotal} />
          </div>
          <div>
            <span>Purchase GST</span>
            <Money value={p.tax} />
          </div>
          <div className="grand-total">
            <span>Total</span>
            <Money value={p.total} />
          </div>
          <div>
            <span>Payments made</span>
            <Money value={p.paid} />
          </div>
          <div className="balance-preview">
            <span>Payable</span>
            <Money value={p.total - p.paid} />
          </div>
        </div>
      </div>
      <div className="payment-history-heading">
        <h3>Supplier payments</h3>
        <span>{payments.length} records</span>
      </div>
      <Table
        head={["DATE", "METHOD", "REFERENCE", "AMOUNT"]}
        empty={
          !payments.length && (
            <div className="payment-history-empty">
              <Wallet size={16} />
              No payments recorded.
            </div>
          )
        }
      >
        {payments.map((x) => (
          <tr key={x.id}>
            <td>{fmtDate(x.date)}</td>
            <td>{x.method}</td>
            <td>{x.reference || "—"}</td>
            <td>
              <Money value={x.amount} />
            </td>
          </tr>
        ))}
      </Table>
    </Dialog>
  );
}
