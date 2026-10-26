import React, { useState, useRef } from "react";
import {
  Plus,
  ReceiptText,
  Wallet,
  IndianRupee,
  FilePenLine,
  Search,
  Trash2,
  ChevronDown,
  ArrowRight,
  Download,
  Printer,
  PenLine,
  UserRoundPlus,
  Package,
  Stethoscope,
  CheckCircle2,
  Undo2,
  ArrowUpRight,
  Clock3,
  PawPrint,
  FileCheck2,
  ShieldCheck,
  History,
  Check,
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
  Segments,
  Field,
  StateSelect,
  Dialog,
  ErrorBox,
  Notice,
  SectionTitle,
  InvoiceBadge,
  Avatar,
  useForm,
  useTask,
  ExportButton,
  fmtDate,
  matches,
} from "./ui.jsx";
import {
  money,
  today,
  calculateTotals,
  PAYMENT_METHODS,
  stateName,
  amountWords,
} from "../shared.js";
import { DocumentPreview, printDocument } from "./Documents.jsx";
import { printPreferences, INVOICE_TEMPLATES } from "../printing.js";
export function Billing() {
  const { state, open } = useDesk(),
    [q, setQ] = useState(""),
    [tab, setTab] = useState("all");
  const invoices = state.invoices.filter(
    (i) =>
      matches(q, i.number, i.customer.name, i.pet.name) &&
      (tab === "all" ||
        (tab === "draft" && i.status === "draft") ||
        (tab === "credited" && i.status === "credited") ||
        (tab === "unpaid" && i.balance > 0) ||
        (tab === "paid" && i.status === "issued" && i.balance === 0)),
  );
  return (
    <>
      <PageHeader
        title="Billing & invoices"
        description="From the first consultation to the final receipt. All in order."
        actions={
          <>
            <ExportButton type="invoices" />
            <Button
              variant="secondary"
              icon={ReceiptText}
              onClick={() => open("invoice", { pos: true })}
            >
              New POS bill
            </Button>
            <Button icon={Plus} onClick={() => open("invoice")}>
              New invoice
            </Button>
          </>
        }
      />
      <div className="billing-summary">
        <div>
          <span className="soft-icon">
            <IndianRupee size={21} />
          </span>
          <div>
            <span>Net billed · all time</span>
            <strong>
              {money(
                state.invoices
                  .filter((i) => i.status !== "draft")
                  .reduce((n, i) => n + i.total, 0) -
                  state.credits.reduce((n, c) => n + c.total, 0),
              )}
            </strong>
          </div>
        </div>
        <div>
          <span className="soft-icon amber">
            <Wallet size={21} />
          </span>
          <div>
            <span>Outstanding balance</span>
            <strong>
              {money(state.invoices.reduce((n, i) => n + i.balance, 0))}
            </strong>
          </div>
        </div>
        <div>
          <span className="soft-icon blue">
            <FilePenLine size={21} />
          </span>
          <div>
            <span>Draft invoices</span>
            <strong>
              {state.invoices.filter((i) => i.status === "draft").length}
              <small> waiting for your review</small>
            </strong>
          </div>
        </div>
      </div>
      <Panel>
        <div className="list-toolbar">
          <Segments
            options={[
              {
                value: "all",
                label: "All invoices",
                count: state.invoices.length,
              },
              { value: "unpaid", label: "Unpaid" },
              { value: "paid", label: "Paid" },
              { value: "draft", label: "Drafts" },
              { value: "credited", label: "Credited" },
            ]}
            value={tab}
            onChange={setTab}
          />
        </div>
        <div className="filter-toolbar">
          <SearchBox
            value={q}
            onChange={setQ}
            placeholder="Search invoice number, client, or patient…"
          />
          <span className="tiny muted">
            {invoices.length} {invoices.length === 1 ? "invoice" : "invoices"}
          </span>
        </div>
        <Table
          head={[
            "INVOICE",
            "CLIENT / PATIENT",
            "ISSUED",
            "TOTAL",
            "BALANCE",
            "STATUS",
            "",
          ]}
          empty={
            !invoices.length && (
              <EmptyState
                icon={ReceiptText}
                title={
                  q || tab !== "all"
                    ? "No invoices to show here"
                    : "Good care. Clear bills."
                }
                description={
                  q || tab !== "all"
                    ? "Try another search or switch to All invoices."
                    : "Create your first invoice for consultations, medicines, and supplies. Stock, tax, and balances stay in sync."
                }
                action={
                  !q &&
                  tab === "all" && (
                    <Button icon={Plus} onClick={() => open("invoice")}>
                      Create your first invoice
                    </Button>
                  )
                }
              />
            )
          }
        >
          {invoices.map((i) => (
            <tr
              key={i.id}
              className="clickable"
              onClick={() => open("invoiceView", { id: i.id })}
            >
              <td>
                <strong className="table-primary invoice-number">
                  {i.number || "Draft invoice"}
                </strong>
                <span className="table-secondary">{i.document_type}</span>
              </td>
              <td>
                <strong className="table-primary">
                  {i.customer.name || "Walk-in client"}
                </strong>
                {i.pet.name && (
                  <span className="table-secondary">
                    <PawPrint size={11} />
                    {i.pet.name}
                  </span>
                )}
              </td>
              <td>
                {fmtDate(i.date)}
                <span className="table-secondary">
                  Due {fmtDate(i.due_date)}
                </span>
              </td>
              <td>
                <Money value={i.total} />
              </td>
              <td>
                {i.status === "credited" && i.refund_due > 0 ? (
                  <>
                    <Money className="text-amber" value={i.refund_due} />
                    <span className="table-secondary">Refund due</span>
                  </>
                ) : (
                  <Money value={i.balance} />
                )}
              </td>
              <td>
                <InvoiceBadge invoice={i} />
              </td>
              <td>
                <IconButton
                  icon={ArrowUpRight}
                  label={"View " + (i.number || "draft")}
                  onClick={(e) => {
                    e.stopPropagation();
                    open("invoiceView", { id: i.id });
                  }}
                />
              </td>
            </tr>
          ))}
        </Table>
        <div className="table-footer">
          <span>
            Issued invoices are locked. Use a credit note for reversals.
          </span>
          <span>
            <ShieldCheck size={13} /> Consecutive financial-year numbering
          </span>
        </div>
      </Panel>
      <div className="inline-tip">
        <Wallet size={16} />
        <span>
          Payments are recorded in shop desk. No payment gateway is connected,
          and no money is moved automatically.
        </span>
      </div>
    </>
  );
}
export function InvoiceForm({ id, clientId, pos = false }) {
  const { state, open, close, refresh, toast } = useDesk(),
    inv = state.invoices.find((i) => i.id === id),
    clinic = state.settings,
    client = state.clients.find((c) => c.id === (clientId || inv?.client_id));
  const [form, setForm, field] = useForm(
    inv
      ? {
          ...inv,
          client_id: inv.client_id || "",
          pet_id: inv.pet_id || "",
          inclusive: !!inv.inclusive,
          round_off: !!inv.round_off,
          payment_amount: "",
          payment_method: "Cash",
          payment_reference: "",
        }
      : {
          date: today(),
          due_date: today(),
          client_id: clientId || "",
          pet_id: "",
          place_of_supply: client?.state || clinic.state,
          inclusive: false,
          round_off: clinic.round_off,
          notes: "",
          terms: clinic.terms,
          payment_amount: "",
          payment_method: "Cash",
          payment_reference: "",
        },
  );
  const [lines, setLines] = useState(
      inv ? inv.lines.map((l) => ({ ...l, rate: l.rate / 100 })) : [],
    ),
    [paymentMode, setPaymentMode] = useState("unpaid"),
    [notesOpen, setNotesOpen] = useState(!!inv?.notes),
    task = useTask(),
    ref = useRef();
  const selectedClient = state.clients.find((c) => c.id === form.client_id),
    pets = state.pets.filter((p) => p.client_id === form.client_id),
    products = state.products.filter((p) => p.active);
  const totals = calculateTotals(lines, {
    registered: clinic.gst_registered,
    interstate: clinic.state !== form.place_of_supply,
    inclusive: form.inclusive,
    roundOff: form.round_off,
  });
  const add = (p) => {
    const mult =
      form.inclusive && clinic.gst_registered && p.tax_treatment === "taxable"
        ? 1 + p.gst_rate / 100
        : 1;
    setLines((ls) => [
      ...ls,
      {
        product_id: p.id,
        name: p.name,
        hsn: p.hsn,
        type: p.type,
        unit: p.unit,
        tax_treatment: p.tax_treatment,
        gst_rate: p.gst_rate,
        qty: 1,
        rate: Math.round(p.sale_price * mult) / 100,
        discount: 0,
      },
    ]);
  };
  const update = (index, key, value) =>
    setLines((ls) =>
      ls.map((l, i) => (i === index ? { ...l, [key]: value } : l)),
    );
  const setInclusive = (value) => {
    setLines((ls) =>
      ls.map((l) => ({
        ...l,
        rate:
          Math.round(
            Number(l.rate) *
              (clinic.gst_registered && l.tax_treatment === "taxable"
                ? value
                  ? 1 + l.gst_rate / 100
                  : 1 / (1 + l.gst_rate / 100)
                : 1) *
              100,
          ) / 100,
      })),
    );
    setForm((f) => ({ ...f, inclusive: value }));
  };
  const save = (action) => {
    if (!ref.current.reportValidity()) return;
    if (!lines.length) {
      task.setError("Add at least one product or service to this invoice.");
      return;
    }
    task.run(async () => {
      const r = await api("/invoices" + (id ? "/" + id : ""), {
        method: id ? "PUT" : "POST",
        body: {
          ...form,
          action,
          lines: lines.map((l) => ({
            product_id: l.product_id,
            qty: Number(l.qty),
            rate: Number(l.rate),
            discount: Number(l.discount || 0),
          })),
          payment_amount:
            action === "draft" || paymentMode === "unpaid"
              ? 0
              : paymentMode === "full"
                ? totals.total / 100
                : Number(form.payment_amount),
        },
      });
      await refresh();
      close();
      open("invoiceView", {
        id: r.id,
        initialFormat: pos
          ? "thermal-" + printPreferences(clinic).thermal_width
          : undefined,
      });
      toast(
        action === "issue"
          ? pos
            ? "Bill issued. Ready to print on your thermal printer."
            : "Invoice issued. Stock and balances updated."
          : "Draft saved. Stock has not been deducted.",
      );
    });
  };
  return (
    <Dialog
      title={
        id ? "Edit draft invoice" : pos ? "New POS bill" : "Create an invoice"
      }
      subtitle={
        pos
          ? "Counter billing · Search or scan items, record money actually received, then issue and print."
          : "A clear bill for the care you give."
      }
      xwide
      busy={task.busy}
      className="invoice-form-dialog"
      footer={
        <>
          <span className="footer-hint">
            <ShieldCheck size={13} /> Stock changes only when issued.
          </span>
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button
            variant="secondary"
            loading={task.busy}
            onClick={() => save("draft")}
          >
            Save draft
          </Button>
          <Button
            icon={FileCheck2}
            loading={task.busy}
            onClick={() => save("issue")}
          >
            {pos ? "Issue bill" : "Issue invoice"}
          </Button>
        </>
      }
    >
      <form ref={ref} onSubmit={(e) => e.preventDefault()}>
        <div className="invoice-create-heading">
          <div>
            <span className="eyebrow">{clinic.name}</span>
            <h3>
              {clinic.gst_registered ? "Invoice details" : "Clinic invoice"}
            </h3>
          </div>
          <Badge>Number assigned on issue</Badge>
        </div>
        <div className="invoice-top-fields">
          <div className="invoice-client-fields">
            <div className="label-with-action">
              <label htmlFor="invoice-client">Bill to</label>
              <button
                type="button"
                onClick={() =>
                  open("client", {
                    onSaved: (client_id, c) =>
                      setForm((f) => ({
                        ...f,
                        client_id,
                        pet_id: "",
                        place_of_supply: c.state,
                      })),
                  })
                }
              >
                <Plus size={12} />
                Add client
              </button>
            </div>
            <select
              id="invoice-client"
              value={form.client_id}
              onChange={(e) => {
                const c = state.clients.find((c) => c.id === e.target.value);
                setForm((f) => ({
                  ...f,
                  client_id: e.target.value,
                  pet_id: "",
                  place_of_supply: c?.state || clinic.state,
                }));
              }}
            >
              <option value="">Walk-in client (unregistered)</option>
              {state.clients.map((c) => (
                <option value={c.id} key={c.id}>
                  {c.name}
                  {c.phone ? " · " + c.phone : ""}
                </option>
              ))}
            </select>
            {selectedClient && (
              <p className="selected-client-info">
                {selectedClient.address || "No billing address added"}
                {selectedClient.gstin && (
                  <span>GSTIN {selectedClient.gstin}</span>
                )}
              </p>
            )}
            <div className="label-with-action mt-12">
              <label htmlFor="invoice-pet">Patient (optional)</label>
              {form.client_id && (
                <button
                  type="button"
                  onClick={() =>
                    open("pet", {
                      clientId: form.client_id,
                      onSaved: (pet_id) => setForm((f) => ({ ...f, pet_id })),
                    })
                  }
                >
                  <Plus size={12} />
                  Add patient
                </button>
              )}
            </div>
            <select
              id="invoice-pet"
              {...field("pet_id")}
              disabled={!form.client_id}
            >
              <option value="">
                {form.client_id ? "Select patient" : "Select a client first"}
              </option>
              {pets.map((p) => (
                <option value={p.id} key={p.id}>
                  {p.name} · {p.species}
                </option>
              ))}
            </select>
          </div>
          <div className="form-grid">
            <Field label="Invoice date" required>
              <input type="date" {...field("date")} max={today()} required />
            </Field>
            <Field label="Due date" required>
              <input
                type="date"
                {...field("due_date")}
                min={form.date}
                required
              />
            </Field>
            <Field label="Place of supply" required className="span-2">
              <StateSelect {...field("place_of_supply")} required />
            </Field>
          </div>
        </div>
        {!clinic.gst_registered && (
          <Notice tone="neutral">
            Your clinic is not set as GST-registered. No GST will be charged,
            regardless of the catalogue rate.
          </Notice>
        )}
        <div className="invoice-items-heading">
          <h3>Products & services</h3>
          <div className="price-mode">
            <span>Prices are</span>
            <select
              value={form.inclusive ? "inclusive" : "exclusive"}
              onChange={(e) => setInclusive(e.target.value === "inclusive")}
              aria-label="Price tax mode"
            >
              <option value="exclusive">GST exclusive</option>
              <option value="inclusive">GST inclusive</option>
            </select>
          </div>
        </div>
        <div className="item-search-row">
          <SearchSelect
            items={products}
            onPick={add}
            placeholder="Find a product, service, SKU, or scan barcode…"
            empty="No matching items. Add one to your catalogue first."
            renderItem={(p) => (
              <>
                <span
                  className={
                    "item-icon " + (p.type === "service" ? "purple" : "")
                  }
                >
                  {p.type === "service" ? (
                    <Stethoscope size={17} />
                  ) : (
                    <Package size={17} />
                  )}
                </span>
                <span className="pick-item-name">
                  <strong>{p.name}</strong>
                  <small>
                    {p.hsn} ·{" "}
                    {p.type === "service"
                      ? "Service"
                      : `${p.available} ${p.unit} usable`}
                  </small>
                </span>
                <span className="pick-price">
                  {money(p.sale_price)}
                  <small>before GST</small>
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
            New item
          </Button>
        </div>
        {!products.length && (
          <Notice>
            Your catalogue is empty. Add your first product or service using
            “New item”, then select it here.
          </Notice>
        )}
        <div className="invoice-lines-table">
          <Table
            head={[
              "ITEM",
              "QTY",
              "RATE (₹)",
              "DISCOUNT %",
              "GST",
              "AMOUNT",
              "",
            ]}
            empty={
              !lines.length && (
                <div className="invoice-lines-empty">
                  <ReceiptText size={23} strokeWidth={1.3} />
                  <span>Add an item to begin your invoice.</span>
                </div>
              )
            }
          >
            {lines.map((l, i) => (
              <tr key={i}>
                <td>
                  <strong className="table-primary">{l.name}</strong>
                  <span className="table-secondary">
                    {l.hsn} · {l.unit}
                    {l.type === "product"
                      ? " · " +
                        (state.products.find((p) => p.id === l.product_id)
                          ?.available || 0) +
                        " usable"
                      : ""}
                  </span>
                </td>
                <td>
                  <input
                    aria-label={"Quantity for " + l.name}
                    type="number"
                    value={l.qty}
                    onChange={(e) => update(i, "qty", e.target.value)}
                    min="0.001"
                    max="10000000"
                    step="0.001"
                    required
                  />
                </td>
                <td>
                  <input
                    aria-label={"Rate for " + l.name}
                    type="number"
                    value={l.rate}
                    onChange={(e) => update(i, "rate", e.target.value)}
                    min="0"
                    max="100000000"
                    step="0.01"
                    required
                  />
                </td>
                <td>
                  <input
                    aria-label={"Discount for " + l.name}
                    type="number"
                    value={l.discount}
                    onChange={(e) => update(i, "discount", e.target.value)}
                    min="0"
                    max="100"
                    step="0.01"
                  />
                </td>
                <td>
                  <span className="line-tax">
                    {l.tax_treatment === "taxable"
                      ? `${clinic.gst_registered ? l.gst_rate : 0}%`
                      : l.tax_treatment === "exempt"
                        ? "Exempt"
                        : l.tax_treatment === "nil"
                          ? "Nil"
                          : "Non-GST"}
                  </span>
                </td>
                <td>
                  <Money value={totals.lines[i]?.total || 0} />
                </td>
                <td>
                  <IconButton
                    icon={Trash2}
                    label={"Remove " + l.name}
                    onClick={() =>
                      setLines((ls) => ls.filter((_, index) => index !== i))
                    }
                    type="button"
                  />
                </td>
              </tr>
            ))}
          </Table>
        </div>
        <div className="invoice-bottom-fields">
          <div>
            <SectionTitle>Payment received</SectionTitle>
            <div className="payment-mode-select">
              <select
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value)}
                aria-label="Payment status"
              >
                <option value="unpaid">Unpaid · collect later</option>
                <option value="full">Paid in full</option>
                <option value="partial">Part payment received</option>
              </select>
            </div>
            {paymentMode !== "unpaid" && (
              <div className="form-grid mt-12">
                {paymentMode === "partial" && (
                  <Field label="Amount received (₹)" required>
                    <input
                      type="number"
                      {...field("payment_amount")}
                      min="0.01"
                      max={totals.total / 100}
                      step="0.01"
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
                <Field
                  label="Reference (optional)"
                  className={paymentMode === "full" ? "" : "span-2"}
                >
                  <input
                    {...field("payment_reference")}
                    placeholder="Transaction / receipt reference"
                    maxLength={200}
                  />
                </Field>
              </div>
            )}
            <p className="field-hint">
              Recording only. No online payment is collected.
            </p>
            <button
              type="button"
              className="text-button notes-toggle"
              onClick={() => setNotesOpen(!notesOpen)}
            >
              <Plus size={14} />
              {notesOpen ? "Hide notes & terms" : "Add notes & terms"}
            </button>
            {notesOpen && (
              <div className="form-grid mt-12">
                <Field label="Notes for the client" className="span-2">
                  <textarea {...field("notes")} rows={2} maxLength={2000} />
                </Field>
                <Field label="Terms & conditions" className="span-2">
                  <textarea {...field("terms")} rows={3} maxLength={1200} />
                </Field>
              </div>
            )}
          </div>
          <div className="invoice-totals">
            <div>
              <span>Subtotal {form.inclusive ? "(incl. GST)" : ""}</span>
              <Money value={totals.subtotal} />
            </div>
            {totals.discount > 0 && (
              <div>
                <span>Discount</span>
                <Money value={-totals.discount} />
              </div>
            )}
            <div>
              <span>Supply value</span>
              <Money value={totals.taxable} />
            </div>
            {clinic.gst_registered &&
              (clinic.state === form.place_of_supply ? (
                <>
                  <div>
                    <span>CGST</span>
                    <Money value={totals.cgst} />
                  </div>
                  <div>
                    <span>SGST / UTGST</span>
                    <Money value={totals.sgst} />
                  </div>
                </>
              ) : (
                <div>
                  <span>IGST</span>
                  <Money value={totals.igst} />
                </div>
              ))}
            <label className="round-off-check">
              <input
                type="checkbox"
                checked={form.round_off}
                onChange={(e) =>
                  setForm((f) => ({ ...f, round_off: e.target.checked }))
                }
              />
              <span>Round to nearest rupee</span>
              <Money value={totals.rounding} />
            </label>
            <div className="grand-total">
              <span>Total</span>
              <Money value={totals.total} />
            </div>
            <div className="balance-preview">
              <span>Balance due</span>
              <Money
                value={Math.max(
                  0,
                  totals.total -
                    (paymentMode === "full"
                      ? totals.total
                      : paymentMode === "partial"
                        ? Math.round(Number(form.payment_amount || 0) * 100)
                        : 0),
                )}
              />
            </div>
          </div>
        </div>
        <ErrorBox>{task.error}</ErrorBox>
      </form>
    </Dialog>
  );
}
export function InvoiceView({ id, initialFormat }) {
  const { state, open, close, refresh, toast } = useDesk(),
    inv = state.invoices.find((i) => i.id === id),
    task = useTask();
  const preferences = printPreferences(state.settings);
  const [output, setOutput] = useState(
    initialFormat ||
      (preferences.default_print_format === "thermal"
        ? "thermal-" + preferences.thermal_width
        : "a4"),
  );
  const [template, setTemplate] = useState(preferences.invoice_template);
  if (!inv) return null;
  const payments = state.payments.filter((p) => p.invoice_id === id);
  const printOptions = {
    settings: state.settings,
    format: output === "a4" ? "a4" : "thermal",
    width: output === "thermal-58" ? "58" : "80",
    template,
    payments,
  };
  const getPDF = (credit) =>
    task.run(async () => {
      const query = new URLSearchParams({
        format: printOptions.format,
        width: printOptions.width,
        template,
      });
      if (credit) query.set("credit", "1");
      await download("/invoices/" + id + "/pdf?" + query.toString());
    });
  return (
    <Dialog
      title={inv.number || "Draft invoice"}
      subtitle={
        inv.status === "draft"
          ? "Not issued. No stock has been deducted."
          : inv.document_type
      }
      xwide
      className="invoice-view-dialog"
      footer={
        <>
          <div className="invoice-footer-status">
            <InvoiceBadge invoice={inv} />
            {inv.status === "issued" && (
              <span>
                Balance <Money value={inv.balance} />
              </span>
            )}
          </div>
          <Button variant="secondary" onClick={close}>
            Close
          </Button>
          {inv.status === "draft" ? (
            <>
              <Button
                variant="danger-ghost"
                icon={Trash2}
                onClick={() =>
                  open("confirm", {
                    title: "Delete this draft?",
                    description:
                      "The draft will be permanently removed. No stock or payments will change.",
                    confirm: "Delete draft",
                    danger: true,
                    onConfirm: async () => {
                      await api("/invoices/" + id, { method: "DELETE" });
                      await refresh();
                      close();
                      toast("Draft deleted.");
                    },
                  })
                }
              >
                Delete
              </Button>
              <Button icon={PenLine} onClick={() => open("invoice", { id })}>
                Edit / issue draft
              </Button>
            </>
          ) : inv.status === "issued" && inv.balance > 0 ? (
            <Button icon={Plus} onClick={() => open("payment", { id })}>
              Record payment
            </Button>
          ) : inv.status === "credited" && inv.refund_due > 0 ? (
            <Button
              icon={Undo2}
              onClick={() => open("payment", { id, refund: true })}
            >
              Record refund
            </Button>
          ) : null}
        </>
      }
    >
      <div className="document-actions">
        <div>
          <InvoiceBadge invoice={inv} />
          {inv.status === "issued" && (
            <button
              className="text-button muted"
              onClick={() => open("credit", { id })}
            >
              <Undo2 size={14} />
              Create credit note
            </button>
          )}
        </div>
        <div>
          <Button
            variant="secondary"
            size="sm"
            icon={Printer}
            onClick={() => printDocument(inv, printOptions, toast)}
          >
            Print
          </Button>
          <Button
            variant="secondary"
            size="sm"
            loading={task.busy}
            icon={Download}
            onClick={() => getPDF(false)}
          >
            Download PDF
          </Button>
        </div>
      </div>
      {inv.cgst !== inv.sgst && (
        <Notice tone="warning">
          {inv.status === "draft" ? (
            <>
              This draft was saved using the earlier GST rounding rule. Open
              “Edit draft” and save or issue it to apply the equal CGST/SGST
              rule.
            </>
          ) : (
            <>
              This invoice was issued using the earlier GST rounding rule. Its
              saved amounts have not been changed. If a correction is required,
              use the credit-note and reissue workflow; reprinting must retain
              the original figures.
            </>
          )}
        </Notice>
      )}
      <div className="document-format-bar">
        <Field label="Output format">
          <select
            aria-label="Output format"
            value={output}
            onChange={(event) => setOutput(event.target.value)}
          >
            <option value="a4">A4 invoice</option>
            <option value="thermal-80">Thermal / POS · 80 mm</option>
            <option value="thermal-58">Thermal / POS · 58 mm</option>
          </select>
        </Field>
        {output === "a4" && (
          <Field label="A4 template">
            <select
              aria-label="A4 template"
              value={template}
              onChange={(event) => setTemplate(event.target.value)}
            >
              {INVOICE_TEMPLATES.map((choice) => (
                <option key={choice.id} value={choice.id}>
                  {choice.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <p>
          Same bill, different paper. Printing or downloading does not create
          another sale.
        </p>
      </div>
      {output !== "a4" && (
        <p className="thermal-print-hint">
          <Printer size={14} /> Select the matching thermal roll in your printer
          dialog. Scale 100%; browser headers and footers off.
        </p>
      )}
      {inv.status === "credited" && (
        <div className="credit-notice">
          <Undo2 size={18} />
          <div>
            <strong>Credited in full · {inv.credit?.number}</strong>
            <p>
              {inv.credit?.reason}
              {inv.refund_due > 0
                ? " · Refund due: " + money(inv.refund_due)
                : ""}
            </p>
          </div>
          <Button
            size="sm"
            variant="secondary"
            icon={Download}
            onClick={() => getPDF(true)}
          >
            Credit PDF
          </Button>
        </div>
      )}
      <ErrorBox>{task.error}</ErrorBox>
      <DocumentPreview
        invoice={inv}
        options={printOptions}
        title="Invoice print preview"
      />
      <div className="payment-history-heading">
        <h3>Payment history</h3>
        <span>{payments.length} records</span>
      </div>
      {payments.length ? (
        <Table head={["DATE", "TYPE", "METHOD / REFERENCE", "AMOUNT"]}>
          {payments.map((p) => (
            <tr key={p.id}>
              <td>{fmtDate(p.date)}</td>
              <td>
                <Badge tone={p.direction === "refund" ? "amber" : "green"}>
                  {p.direction === "refund" ? "Refund" : "Receipt"}
                </Badge>
              </td>
              <td>
                {p.method}
                <span className="table-secondary">{p.reference}</span>
              </td>
              <td>
                <Money value={p.amount} />
              </td>
            </tr>
          ))}
        </Table>
      ) : (
        <div className="payment-history-empty">
          <Wallet size={16} />
          <span>
            No payments recorded
            {inv.status === "draft" ? " for this draft." : "."}
          </span>
        </div>
      )}
    </Dialog>
  );
}
export function PaymentForm({ id, purchase = false, refund = false }) {
  const { state, close, refresh, toast } = useDesk(),
    record = (purchase ? state.purchases : state.invoices).find(
      (i) => i.id === id,
    ),
    balance = purchase
      ? record.total - record.paid
      : refund
        ? record.refund_due
        : record.balance;
  const [form, setForm, field] = useForm({
      amount: (balance / 100).toFixed(2),
      method: purchase ? "Bank transfer" : "Cash",
      reference: "",
      date: today(),
    }),
    task = useTask();
  const title = refund
    ? "Record a refund"
    : purchase
      ? "Record supplier payment"
      : "Record a payment";
  return (
    <Dialog
      title={title}
      subtitle={
        (purchase ? record.invoice_no : record.number) +
        " · " +
        (purchase
          ? "Supplier payment"
          : record.customer.name || "Walk-in client")
      }
      busy={task.busy}
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button loading={task.busy} type="submit" form="payment-form">
            {refund ? "Record refund" : "Record payment"}
          </Button>
        </>
      }
    >
      <div className="payment-balance">
        <span>
          {refund
            ? "Refundable amount"
            : purchase
              ? "Amount payable"
              : "Outstanding balance"}
        </span>
        <strong>{money(balance)}</strong>
      </div>
      <form
        id="payment-form"
        onSubmit={(e) => {
          e.preventDefault();
          task.run(async () => {
            await api(
              `/${purchase ? "purchases" : "invoices"}/${id}/${refund ? "refund" : "payment"}`,
              { method: "POST", body: form },
            );
            await refresh();
            close();
            toast(
              refund
                ? "Refund recorded. No money was transferred automatically."
                : "Payment recorded. Balance updated.",
            );
          });
        }}
      >
        <div className="form-grid">
          <Field
            label={refund ? "Amount refunded (₹)" : "Amount paid (₹)"}
            required
          >
            <input
              type="number"
              {...field("amount")}
              min="0.01"
              max={balance / 100}
              step="0.01"
              required
            />
          </Field>
          <Field label="Payment date" required>
            <input
              type="date"
              {...field("date")}
              min={refund ? record.credit.date : record.date}
              max={today()}
              required
            />
          </Field>
          <Field label="Payment method" required>
            <select {...field("method")}>
              {PAYMENT_METHODS.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </Field>
          <Field label="Transaction reference">
            <input
              {...field("reference")}
              placeholder="Optional reference"
              maxLength={200}
            />
          </Field>
        </div>
        <Notice>
          Record this only after you have actually{" "}
          {refund ? "refunded" : "received or paid"} the money. shop desk does
          not initiate payments or refunds.
        </Notice>
        <ErrorBox>{task.error}</ErrorBox>
      </form>
    </Dialog>
  );
}
export function CreditForm({ id }) {
  const { state, close, refresh, toast } = useDesk(),
    inv = state.invoices.find((i) => i.id === id);
  const [form, setForm, field] = useForm({ date: today(), reason: "" }),
    [confirmed, setConfirmed] = useState(false),
    task = useTask();
  return (
    <Dialog
      title="Create a full credit note"
      subtitle={inv.number + " · " + money(inv.total)}
      busy={task.busy}
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button
            loading={task.busy}
            disabled={!confirmed}
            form="credit-form"
            type="submit"
            icon={Undo2}
          >
            Issue credit note
          </Button>
        </>
      }
    >
      <Notice tone="warning">
        This credits the entire invoice and returns all sold quantities to their
        original batches. For damaged or expired returns, remove the stock
        separately with a recorded adjustment. This action cannot be undone.
      </Notice>
      <form
        id="credit-form"
        onSubmit={(e) => {
          e.preventDefault();
          task.run(async () => {
            await api("/invoices/" + id + "/credit", {
              method: "POST",
              body: form,
            });
            await refresh();
            close();
            toast(
              "Credit note issued. Any refund must be recorded separately.",
            );
          });
        }}
      >
        <div className="form-grid">
          <Field label="Credit note date" required>
            <input
              type="date"
              {...field("date")}
              min={inv.date}
              max={today()}
              required
            />
          </Field>
          <Field label="Reason" required className="span-2">
            <textarea
              {...field("reason")}
              required
              maxLength={1000}
              rows={3}
              placeholder="Why is this invoice being credited?"
            />
          </Field>
        </div>
        {inv.paid > 0 && (
          <p className="refund-explanation">
            {money(inv.paid)} in net payments will become refundable. Issuing
            this credit note does not transfer the money.
          </p>
        )}
        <label className="check-label">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          <span>I understand this is a full credit and stock reversal.</span>
        </label>
        <ErrorBox>{task.error}</ErrorBox>
      </form>
    </Dialog>
  );
}
// Backwards-compatible helper for callers outside this module.
export function printInvoice(invoice, toast, options = {}) {
  return printDocument(invoice, options, toast);
}
