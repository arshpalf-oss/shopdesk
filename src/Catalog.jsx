import React, { useState } from "react";
import {
  Plus,
  Upload,
  Download,
  Boxes,
  Package,
  PackagePlus,
  Stethoscope,
  BookOpen,
  ArrowUpRight,
  ChevronDown,
  Search,
  ArrowRight,
  ArrowDownUp,
  CalendarClock,
  Check,
  FileSpreadsheet,
  Info,
  History,
  Archive,
  ShieldCheck,
  Copy,
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
  Segments,
  Field,
  Dialog,
  ErrorBox,
  Notice,
  SectionTitle,
  Toggle,
  useForm,
  useTask,
  ExportButton,
  fmtDate,
  matches,
  localDownload,
} from "./ui.jsx";
import {
  CATEGORIES,
  UNITS,
  HSN_CODES,
  SOURCES,
  money,
  today,
} from "../shared.js";
export function Catalog() {
  const { state, open, lowStock, expiring } = useDesk(),
    [tab, setTab] = useState("product"),
    [q, setQ] = useState(""),
    [category, setCategory] = useState(""),
    [archived, setArchived] = useState(false);
  const products = state.products.filter(
    (p) =>
      p.type === tab &&
      p.active !== archived &&
      (!category || p.category === category) &&
      matches(q, p.name, p.sku, p.barcode, p.hsn),
  );
  const movements = state.movements.filter((m) =>
    matches(
      q,
      state.products.find((p) => p.id === m.product_id)?.name,
      m.reference,
      m.note,
    ),
  );
  return (
    <>
      <PageHeader
        title="Inventory"
        description="Everything on your shelves. Nothing left to guess."
        actions={
          <>
            <Button
              variant="secondary"
              icon={Upload}
              onClick={() => open("import")}
            >
              Import CSV
            </Button>
            <Button icon={Plus} onClick={() => open("product")}>
              Add item
            </Button>
          </>
        }
      />
      <div className="inventory-summary">
        <div>
          <span className="soft-icon">
            <Boxes size={20} />
          </span>
          <span>
            <strong>
              {
                state.products.filter((p) => p.type === "product" && p.active)
                  .length
              }
            </strong>
            <small>Active products</small>
          </span>
        </div>
        <div>
          <span className="soft-icon amber">
            <Package size={20} />
          </span>
          <span>
            <strong>{lowStock.length}</strong>
            <small>Low-stock items</small>
          </span>
        </div>
        <div>
          <span className="soft-icon blue">
            <CalendarClock size={20} />
          </span>
          <span>
            <strong>{expiring.length}</strong>
            <small>Expiry alerts · next 30 days</small>
          </span>
        </div>
        <div>
          <span className="soft-icon purple">
            <Stethoscope size={20} />
          </span>
          <span>
            <strong>
              {
                state.products.filter((p) => p.type === "service" && p.active)
                  .length
              }
            </strong>
            <small>Billable services</small>
          </span>
        </div>
      </div>
      <Panel className="catalog-panel">
        <div className="list-toolbar">
          <Segments
            options={[
              {
                value: "product",
                label: "Products",
                count: state.products.filter(
                  (p) => p.type === "product" && p.active,
                ).length,
              },
              {
                value: "service",
                label: "Services",
                count: state.products.filter(
                  (p) => p.type === "service" && p.active,
                ).length,
              },
              { value: "history", label: "Stock history" },
            ]}
            value={tab}
            onChange={setTab}
          />
          <ExportButton type="inventory" />
        </div>
        <div className="filter-toolbar">
          <SearchBox
            value={q}
            onChange={setQ}
            placeholder={
              tab === "history"
                ? "Search stock history…"
                : "Search by name, SKU, barcode, or HSN…"
            }
          />
          {tab !== "history" && (
            <>
              <select
                aria-label="Filter category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="">All categories</option>
                {CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
              <button
                className={"archive-filter " + (archived ? "selected" : "")}
                onClick={() => setArchived(!archived)}
              >
                <Archive size={15} />
                Archived
              </button>
            </>
          )}
        </div>
        {tab === "history" ? (
          <Table
            head={[
              "DATE & TIME",
              "ITEM",
              "TYPE",
              "QUANTITY",
              "REFERENCE / REASON",
            ]}
            empty={
              !movements.length && (
                <EmptyState
                  icon={History}
                  title={
                    q ? "No movements found" : "A clear trail for every item"
                  }
                  description={
                    q
                      ? "Try a different search."
                      : "Opening stock, purchases, sales, returns, and adjustments will be recorded here."
                  }
                />
              )
            }
          >
            {movements.map((m) => (
              <tr key={m.id}>
                <td>
                  <strong className="table-primary">
                    {new Date(m.created_at).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </strong>
                  <span className="table-secondary">
                    {new Date(m.created_at).toLocaleTimeString("en-IN", {
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZone: "Asia/Kolkata",
                    })}{" "}
                    IST
                  </span>
                </td>
                <td>
                  {state.products.find((p) => p.id === m.product_id)?.name}
                  <span className="table-secondary">
                    Batch{" "}
                    {state.batches.find((b) => b.id === m.batch_id)?.batch_no ||
                      "—"}
                  </span>
                </td>
                <td>
                  <Badge tone={m.qty > 0 ? "green" : "neutral"}>
                    {m.type.replace("_", " ")}
                  </Badge>
                </td>
                <td className={m.qty > 0 ? "text-green" : "text-red"}>
                  {m.qty > 0 ? "+" : ""}
                  {m.qty}
                </td>
                <td>
                  {m.reference}
                  <span className="table-secondary">{m.note}</span>
                </td>
              </tr>
            ))}
          </Table>
        ) : (
          <Table
            head={[
              "ITEM",
              "HSN / SAC",
              "STOCK ON HAND",
              "SELLING PRICE",
              "STATUS",
              "",
            ]}
            empty={
              !products.length && (
                <EmptyState
                  icon={tab === "service" ? Stethoscope : Boxes}
                  title={
                    q || category
                      ? "No matching items"
                      : archived
                        ? "No archived items"
                        : tab === "service"
                          ? "Care deserves a place in your catalogue"
                          : "Good care starts with a well-stocked shelf"
                  }
                  description={
                    q || category
                      ? "Try adjusting your search or category."
                      : archived
                        ? "Archived products and services will appear here."
                        : tab === "service"
                          ? "Add your consultations, procedures, and other billable services."
                          : "Add your own medicines, vaccines, pet food, and supplies. Your inventory starts with you."
                  }
                  action={
                    !q &&
                    !category &&
                    !archived && (
                      <div className="empty-actions">
                        <Button
                          icon={Plus}
                          onClick={() => open("product", { initialType: tab })}
                        >
                          Add your first{" "}
                          {tab === "service" ? "service" : "product"}
                        </Button>
                        {tab === "product" && (
                          <Button
                            variant="secondary"
                            icon={Upload}
                            onClick={() => open("import")}
                          >
                            Import inventory
                          </Button>
                        )}
                      </div>
                    )
                  }
                />
              )
            }
          >
            {products.map((p) => (
              <tr
                key={p.id}
                className="clickable"
                onClick={() => open("product", { id: p.id })}
              >
                <td>
                  <div className="item-cell">
                    <span
                      className={
                        "item-icon " + (p.type === "service" ? "purple" : "")
                      }
                    >
                      {p.type === "service" ? (
                        <Stethoscope size={19} />
                      ) : (
                        <Package size={19} />
                      )}
                    </span>
                    <div>
                      <strong className="table-primary">{p.name}</strong>
                      <span className="table-secondary">
                        {p.category}
                        {p.sku ? " · " + p.sku : ""}
                      </span>
                    </div>
                  </div>
                </td>
                <td>
                  <code>{p.hsn}</code>
                  <span className="table-secondary">
                    {p.tax_treatment === "taxable"
                      ? p.gst_rate + "% GST"
                      : p.tax_treatment === "nil"
                        ? "Nil rated"
                        : p.tax_treatment === "exempt"
                          ? "Exempt"
                          : "Non-GST"}
                  </span>
                </td>
                <td>
                  {p.type === "service" ? (
                    <span className="muted">Not tracked</span>
                  ) : (
                    <>
                      <strong>{p.stock}</strong>{" "}
                      <span className="muted">{p.unit}</span>
                      {p.available < p.stock && (
                        <span className="table-secondary text-red">
                          {p.stock - p.available} expired
                        </span>
                      )}
                    </>
                  )}
                </td>
                <td>
                  <Money value={p.sale_price} />
                  <span className="table-secondary">Before GST / {p.unit}</span>
                </td>
                <td>
                  {!p.active ? (
                    <Badge>Archived</Badge>
                  ) : p.type === "service" ? (
                    <Badge tone="green">Available</Badge>
                  ) : p.available === 0 ? (
                    <Badge tone="red" dot>
                      Out of stock
                    </Badge>
                  ) : p.available <= p.low_stock ? (
                    <Badge tone="amber" dot>
                      Low stock
                    </Badge>
                  ) : (
                    <Badge tone="green" dot>
                      In stock
                    </Badge>
                  )}
                </td>
                <td>
                  {p.type === "product" && (
                    <IconButton
                      icon={ArrowDownUp}
                      label={"Adjust stock for " + p.name}
                      onClick={(e) => {
                        e.stopPropagation();
                        open("adjust", { id: p.id });
                      }}
                    />
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}
        <div className="table-footer">
          <span>
            {tab === "history"
              ? `${movements.length} stock movements shown (latest 500)`
              : `${products.length} ${products.length === 1 ? "item" : "items"}`}
          </span>
          <span>
            <ShieldCheck size={13} /> Stock updates only when you save
          </span>
        </div>
      </Panel>
      <div className="inline-tip">
        <BookOpen size={16} />
        <span>
          Not sure which code to use? Find common veterinary classifications in
          the{" "}
          <button onClick={() => goToReference()}>HSN & SAC reference.</button>
        </span>
      </div>
    </>
  );
  function goToReference() {
    location.hash = "/hsn";
  }
}
export function ProductForm({ id, initialType = "product" }) {
  const { state, refresh, close, toast } = useDesk(),
    p = state.products.find((p) => p.id === id);
  const [form, setForm, field] = useForm(
    p
      ? {
          ...p,
          sale_price: p.sale_price / 100,
          cost_price: p.cost_price / 100,
          opening_stock: 0,
          batch_no: "",
          expiry: "",
        }
      : {
          name: "",
          type: initialType,
          category: initialType === "service" ? "Services" : "Medicines",
          hsn: "",
          unit: initialType === "service" ? "service" : "piece",
          sale_price: "",
          cost_price: "",
          gst_rate: "",
          tax_treatment: "",
          sku: "",
          barcode: "",
          low_stock: 5,
          active: true,
          opening_stock: "",
          batch_no: "",
          expiry: "",
        },
  );
  const [showCodes, setShowCodes] = useState(false),
    [codeQ, setCodeQ] = useState(""),
    task = useTask();
  const codes = HSN_CODES.filter(
    (c) =>
      (form.type === "service" ? c.type === "SAC" : c.type === "HSN") &&
      matches(codeQ, c.code, c.name, c.category),
  );
  const save = (e) => {
    e.preventDefault();
    task.run(async () => {
      await api("/products" + (id ? "/" + id : ""), {
        method: id ? "PUT" : "POST",
        body: {
          ...form,
          gst_rate:
            form.tax_treatment === "taxable" ? Number(form.gst_rate) : 0,
        },
      });
      await refresh();
      close();
      toast(
        id
          ? "Item updated. Your invoice history stays unchanged."
          : "Item added to your catalogue.",
      );
    });
  };
  return (
    <Dialog
      title={id ? "Edit item" : "Add an item"}
      subtitle={
        id
          ? "Changes apply to new invoices only."
          : "A product on your shelf, or a service in your care."
      }
      wide
      busy={task.busy}
      footer={
        <>
          <span className="footer-hint">All prices are in INR.</span>
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button loading={task.busy} type="submit" form="product-form">
            {id ? "Save changes" : "Add item"}
          </Button>
        </>
      }
    >
      <form id="product-form" onSubmit={save}>
        <div className="type-choice">
          {[
            {
              value: "product",
              icon: Package,
              label: "Product",
              note: "Track stock & batches",
            },
            {
              value: "service",
              icon: Stethoscope,
              label: "Service",
              note: "Bill for your care",
            },
          ].map((t) => (
            <button
              type="button"
              key={t.value}
              className={form.type === t.value ? "selected" : ""}
              onClick={() =>
                setForm((f) => ({
                  ...f,
                  type: t.value,
                  category: t.value === "service" ? "Services" : "Medicines",
                  unit: t.value === "service" ? "service" : "piece",
                  opening_stock: 0,
                  hsn: "",
                }))
              }
            >
              <t.icon size={20} />
              <span>
                <strong>{t.label}</strong>
                <small>{t.note}</small>
              </span>
              <span className="radio-mark">
                {form.type === t.value && <span />}
              </span>
            </button>
          ))}
        </div>
        <SectionTitle>Item details</SectionTitle>
        <div className="form-grid">
          <Field
            label={form.type === "service" ? "Service name" : "Product name"}
            required
            className="span-2"
          >
            <input
              {...field("name")}
              placeholder={
                form.type === "service"
                  ? "Enter the name of your service"
                  : "Enter the name of your product"
              }
              required
              maxLength={200}
            />
          </Field>
          <Field label="Category" required>
            <select {...field("category")}>
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="Billing unit" required>
            <select {...field("unit")}>
              {UNITS.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field
            label={form.type === "service" ? "SAC code" : "HSN code"}
            required
            hint="Verify the exact code against your supplier invoice or with your accountant."
          >
            <input
              {...field("hsn")}
              placeholder={
                form.type === "service" ? "6-digit SAC" : "4, 6 or 8 digits"
              }
              required
              pattern={
                form.type === "service"
                  ? "[0-9]{6}"
                  : "([0-9]{4}|[0-9]{6}|[0-9]{8})"
              }
            />
          </Field>
          <div className="field code-browse-field">
            <span className="field-label">Need a hand?</span>
            <Button
              variant="secondary"
              type="button"
              icon={BookOpen}
              onClick={() => setShowCodes(!showCodes)}
            >
              {showCodes ? "Hide reference" : "Browse HSN / SAC codes"}
            </Button>
          </div>
        </div>
        {showCodes && (
          <div className="code-picker">
            <SearchBox
              value={codeQ}
              onChange={setCodeQ}
              placeholder="Search codes or descriptions…"
            />
            <div className="code-picker-list">
              {codes.map((c) => (
                <button
                  type="button"
                  key={c.code}
                  onClick={() => {
                    setForm((f) => ({
                      ...f,
                      hsn: c.code,
                      category: c.category,
                    }));
                    setShowCodes(false);
                  }}
                >
                  <code>{c.code}</code>
                  <span>
                    <strong>{c.name}</strong>
                    <small>
                      {c.type} · {c.category}
                    </small>
                  </span>
                  <Plus size={15} />
                </button>
              ))}
            </div>
            <small>
              Reference only. Choosing a code does not set a tax rate.
            </small>
          </div>
        )}
        <SectionTitle note="Choose the tax treatment explicitly; GST is charged only if your clinic is registered.">
          Pricing & tax
        </SectionTitle>
        <div className="form-grid">
          <Field label="Selling price (before GST)" required>
            <div className="input-affix">
              <span>₹</span>
              <input
                type="number"
                min="0"
                max="100000000"
                step="0.01"
                {...field("sale_price")}
                placeholder="0.00"
                required
              />
            </div>
          </Field>
          <Field label="Cost price (before GST)">
            <div className="input-affix">
              <span>₹</span>
              <input
                type="number"
                min="0"
                max="100000000"
                step="0.01"
                {...field("cost_price")}
                placeholder="0.00"
              />
            </div>
          </Field>
          <Field label="Tax treatment" required>
            <select
              {...field("tax_treatment")}
              required
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  tax_treatment: e.target.value,
                  gst_rate: e.target.value === "taxable" ? "" : 0,
                }))
              }
            >
              <option value="" disabled>
                Select tax treatment
              </option>
              <option value="taxable">Taxable</option>
              <option value="exempt">Exempt</option>
              <option value="nil">Nil rated</option>
              <option value="non_gst">Non-GST</option>
            </select>
          </Field>
          <Field
            label="GST rate (%)"
            required={form.tax_treatment === "taxable"}
          >
            <input
              type="number"
              min={form.tax_treatment === "taxable" ? 0.01 : 0}
              max="40"
              step="0.01"
              {...field("gst_rate")}
              disabled={form.tax_treatment !== "taxable"}
              placeholder="Confirm applicable rate"
              required={form.tax_treatment === "taxable"}
            />
          </Field>
        </div>
        {form.type === "service" && form.hsn.startsWith("99835") && (
          <Notice>
            Veterinary clinic healthcare for animals or birds may be exempt
            under Entry 46, Notification 12/2017-CT(R). Grooming, boarding, and
            separately sold goods need separate tax consideration. Confirm your
            treatment.
          </Notice>
        )}
        <SectionTitle>Tracking</SectionTitle>
        <div className="form-grid">
          <Field label="SKU (optional)">
            <input
              {...field("sku")}
              placeholder="Your internal item code"
              maxLength={80}
            />
          </Field>
          <Field label="Barcode (optional)">
            <input
              {...field("barcode")}
              placeholder="Scan or enter barcode"
              maxLength={100}
            />
          </Field>
          {form.type === "product" && (
            <Field
              label="Low-stock alert at"
              hint="An alert appears when usable stock reaches this quantity."
            >
              <input
                type="number"
                min="0"
                max="10000000"
                step="0.001"
                {...field("low_stock")}
              />
            </Field>
          )}
        </div>
        {!id && form.type === "product" && (
          <>
            <SectionTitle note="Optional. Leave quantity empty if you will receive stock through a purchase.">
              Opening stock
            </SectionTitle>
            <div className="form-grid">
              <Field label="Opening quantity">
                <input
                  type="number"
                  min="0"
                  max="10000000"
                  step="0.001"
                  {...field("opening_stock")}
                  placeholder="0"
                />
              </Field>
              <Field
                label="Batch number"
                required={
                  Number(form.opening_stock) > 0 &&
                  ["Medicines", "Vaccines"].includes(form.category)
                }
              >
                <input
                  {...field("batch_no")}
                  placeholder="Manufacturer batch / lot"
                  required={
                    Number(form.opening_stock) > 0 &&
                    ["Medicines", "Vaccines"].includes(form.category)
                  }
                />
              </Field>
              <Field
                label="Expiry date"
                required={
                  Number(form.opening_stock) > 0 &&
                  ["Medicines", "Vaccines"].includes(form.category)
                }
                hint="For month-only expiry, enter the last day of that month."
              >
                <input
                  type="date"
                  {...field("expiry")}
                  min={today()}
                  required={
                    Number(form.opening_stock) > 0 &&
                    ["Medicines", "Vaccines"].includes(form.category)
                  }
                />
              </Field>
            </div>
          </>
        )}
        {id && (
          <Toggle
            checked={form.active}
            onChange={(active) => setForm((f) => ({ ...f, active }))}
            label="Available for billing"
            description="Turn off to archive this item. Its stock and transaction history are retained."
          />
        )}
        <ErrorBox>{task.error}</ErrorBox>
      </form>
    </Dialog>
  );
}
export function AdjustForm({ id, batchId }) {
  const { state, refresh, close, toast } = useDesk(),
    p = state.products.find((p) => p.id === id);
  const [mode, setMode] = useState("add"),
    [f, setF, field] = useForm({
      qty: "",
      batch_id: batchId || "",
      batch_no: "",
      expiry: "",
      cost: p.cost_price / 100,
      reason: "",
    }),
    task = useTask();
  const batches = state.batches.filter((b) => b.product_id === id && b.qty > 0);
  const save = (e) => {
    e.preventDefault();
    task.run(async () => {
      await api("/products/" + id + "/adjust", {
        method: "POST",
        body: { ...f, qty: Number(f.qty) * (mode === "remove" ? -1 : 1) },
      });
      await refresh();
      close();
      toast("Stock adjusted. A record was added to the stock history.");
    });
  };
  return (
    <Dialog
      title="Adjust stock"
      subtitle={p.name}
      wide
      busy={task.busy}
      footer={
        <>
          <span className="footer-hint">Every adjustment is recorded.</span>
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button loading={task.busy} type="submit" form="adjust-form">
            Save adjustment
          </Button>
        </>
      }
    >
      <div className="stock-balance-card">
        <div>
          <span>Stock on hand</span>
          <strong>
            {p.stock} <small>{p.unit}</small>
          </strong>
        </div>
        <div>
          <span>Usable stock</span>
          <strong>
            {p.available} <small>{p.unit}</small>
          </strong>
        </div>
        <div>
          <span>Low-stock alert</span>
          <strong>
            {p.low_stock} <small>{p.unit}</small>
          </strong>
        </div>
      </div>
      <form id="adjust-form" onSubmit={save}>
        <Segments
          value={mode}
          onChange={setMode}
          options={[
            { value: "add", label: "Add stock" },
            { value: "remove", label: "Remove stock" },
          ]}
        />
        <div className="form-grid mt-20">
          <Field label="Quantity" required>
            <input
              type="number"
              {...field("qty")}
              min="0.001"
              step="0.001"
              max="1000000"
              required
              placeholder="0"
            />
          </Field>
          <Field label="Batch" required={mode === "remove"}>
            <select {...field("batch_id")} required={mode === "remove"}>
              <option value="">
                {mode === "add"
                  ? "Create a new batch"
                  : "Select batch to remove from"}
              </option>
              {batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.batch_no || "Unlabelled"} · {b.qty} {p.unit}
                  {b.expiry ? " · " + fmtDate(b.expiry) : ""}
                </option>
              ))}
            </select>
          </Field>
          {mode === "add" && !f.batch_id && (
            <>
              <Field
                label="Batch number"
                required={["Medicines", "Vaccines"].includes(p.category)}
              >
                <input
                  {...field("batch_no")}
                  required={["Medicines", "Vaccines"].includes(p.category)}
                />
              </Field>
              <Field
                label="Expiry date"
                required={["Medicines", "Vaccines"].includes(p.category)}
              >
                <input
                  type="date"
                  {...field("expiry")}
                  min={today()}
                  required={["Medicines", "Vaccines"].includes(p.category)}
                />
              </Field>
              <Field label="Cost per unit (before GST)" required>
                <input
                  type="number"
                  {...field("cost")}
                  min="0"
                  step="0.01"
                  required
                />
              </Field>
            </>
          )}
          <Field label="Reason for adjustment" required className="span-2">
            <textarea
              {...field("reason")}
              required
              maxLength={500}
              rows={2}
              placeholder={
                mode === "remove"
                  ? "For example: damaged, expired, or stock count correction"
                  : "Explain why stock is being added"
              }
            />
          </Field>
        </div>
        <ErrorBox>{task.error}</ErrorBox>
      </form>
      {batches.length > 0 && (
        <>
          <SectionTitle>Batch details</SectionTitle>
          <div className="batch-table">
            <Table head={["BATCH", "EXPIRY", "QUANTITY", "COST / UNIT"]}>
              {batches.map((b) => (
                <tr key={b.id}>
                  <td>{b.batch_no || "—"}</td>
                  <td
                    className={b.expiry && b.expiry < today() ? "text-red" : ""}
                  >
                    {b.expiry ? fmtDate(b.expiry) : "No expiry"}
                  </td>
                  <td>
                    {b.qty} {p.unit}
                  </td>
                  <td>
                    <Money value={b.cost_price} />
                  </td>
                </tr>
              ))}
            </Table>
          </div>
        </>
      )}
    </Dialog>
  );
}
function parseCSV(text) {
  const rows = [];
  let row = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (ch === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((v) => v.trim())) rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (quoted) throw new Error("The CSV contains an unclosed quoted field.");
  row.push(cell);
  if (row.some((v) => v.trim())) rows.push(row);
  return rows;
}
export function ImportForm() {
  const { close, refresh, toast } = useDesk(),
    [file, setFile] = useState(null),
    [rows, setRows] = useState([]),
    task = useTask();
  async function choose(file) {
    setFile(file);
    setRows([]);
    task.setError("");
    if (!file) return;
    try {
      if (file.size > 5 * 1024 * 1024)
        throw new Error("Use a CSV file smaller than 5 MB");
      const data = parseCSV((await file.text()).replace(/^\uFEFF/, ""));
      if (data.length < 2)
        throw new Error(
          "Add your own item rows below the header before importing",
        );
      const headers = data[0].map((h) => h.trim().toLowerCase());
      for (const key of [
        "name",
        "type",
        "category",
        "hsn",
        "unit",
        "sale_price",
        "gst_rate",
        "tax_treatment",
      ])
        if (!headers.includes(key))
          throw new Error("Missing required column: " + key);
      const parsed = data
        .slice(1)
        .map((r, i) => {
          if (r.length !== headers.length)
            throw new Error(
              "Row " + (i + 2) + " has a different number of columns",
            );
          return Object.fromEntries(headers.map((h, j) => [h, r[j].trim()]));
        })
        .map((r) => ({
          ...r,
          active: true,
          low_stock: r.low_stock || 5,
          cost_price: r.cost_price || 0,
          opening_stock: r.opening_stock || 0,
        }));
      if (parsed.length > 2000)
        throw new Error("Import at most 2,000 items at a time");
      setRows(parsed);
    } catch (e) {
      task.setError(e.message);
    }
  }
  return (
    <Dialog
      title="Bring your inventory with you"
      subtitle="Import your own products and services from a CSV file."
      wide
      busy={task.busy}
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button
            icon={Upload}
            loading={task.busy}
            disabled={!rows.length}
            onClick={() =>
              task.run(async () => {
                const result = await api("/products/import", {
                  method: "POST",
                  body: { rows },
                });
                await refresh();
                close();
                toast(
                  result.count + " items imported. No sample records added.",
                );
              })
            }
          >
            Import {rows.length ? rows.length + " items" : "inventory"}
          </Button>
        </>
      }
    >
      <div className="import-step">
        <span>1</span>
        <div>
          <strong>Start with a blank template</strong>
          <p>Headers only. Fill it with the items you actually use.</p>
          <Button
            variant="secondary"
            size="sm"
            icon={Download}
            onClick={() =>
              download("/export/template").catch((e) =>
                task.setError(e.message),
              )
            }
          >
            Download blank template
          </Button>
        </div>
      </div>
      <div className="import-instructions">
        <strong>Before you upload</strong>
        <ul>
          <li>
            <code>type</code>: product or service. Categories:{" "}
            {CATEGORIES.join(", ")}.
          </li>
          <li>
            <code>tax_treatment</code>: taxable, exempt, nil, or non_gst. For
            taxable items, enter the confirmed <code>gst_rate</code>.
          </li>
          <li>
            Prices are in rupees, before GST. Dates use <code>YYYY-MM-DD</code>.
          </li>
          <li>
            Opening stock for medicines and vaccines requires{" "}
            <code>batch_no</code> and <code>expiry</code>.
          </li>
          <li>
            SKU and barcode must be unique if provided. Existing records are not
            overwritten.
          </li>
        </ul>
      </div>
      <div className="import-step">
        <span>2</span>
        <div>
          <strong>Upload your completed file</strong>
          <p>Up to 2,000 rows · CSV only · 5 MB maximum</p>
        </div>
      </div>
      <label className="upload-zone">
        <FileSpreadsheet size={28} strokeWidth={1.4} />
        <strong>{file ? file.name : "Choose your CSV file"}</strong>
        <span>
          {rows.length
            ? rows.length + " rows ready to import"
            : "Click to browse your files"}
        </span>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => choose(e.target.files[0])}
        />
      </label>
      {rows.length > 0 && (
        <div className="import-preview">
          <Table head={["NAME", "HSN / SAC", "TYPE", "PRICE"]}>
            {rows.slice(0, 4).map((r, i) => (
              <tr key={i}>
                <td>{r.name}</td>
                <td>{r.hsn}</td>
                <td>{r.type}</td>
                <td>{r.sale_price}</td>
              </tr>
            ))}
          </Table>
          {rows.length > 4 && (
            <p className="muted tiny">And {rows.length - 4} more items.</p>
          )}
        </div>
      )}
      <Notice>
        Imports are all-or-nothing: if any row is invalid, nothing is added.
        Your file is not sent to a third-party service.
      </Notice>
      <ErrorBox>{task.error}</ErrorBox>
    </Dialog>
  );
}
export function HSNPage() {
  const { open, toast } = useDesk(),
    [q, setQ] = useState(""),
    [type, setType] = useState("all"),
    [category, setCategory] = useState("");
  const codes = HSN_CODES.filter(
    (c) =>
      (type === "all" || c.type === type) &&
      (!category || c.category === category) &&
      matches(q, c.code, c.name, c.category, c.note),
  );
  return (
    <>
      <PageHeader
        title="HSN & SAC reference"
        description="The right code, a little easier to find."
        actions={<Badge tone="green">India · Veterinary reference</Badge>}
      />
      <div className="reference-banner">
        <div className="reference-icon">
          <BookOpen size={27} strokeWidth={1.4} />
        </div>
        <div>
          <h2>Classification, without the guesswork.</h2>
          <p>
            Common codes for veterinary goods and services. Use these as a
            starting point—not as an automatic tax decision.
          </p>
        </div>
        <span>
          {HSN_CODES.length}
          <small>reference codes</small>
        </span>
      </div>
      <Notice>
        HSN/SAC does not uniquely determine GST. Rates, exemptions, code depth,
        and conditions depend on the exact supply and current notifications.
        Confirm against the supplier invoice and with your accountant. No GST
        rates are prefilled from this library.
      </Notice>
      <Panel>
        <div className="list-toolbar">
          <Segments
            value={type}
            onChange={setType}
            options={[
              { value: "all", label: "All codes", count: HSN_CODES.length },
              { value: "HSN", label: "Goods · HSN" },
              { value: "SAC", label: "Services · SAC" },
            ]}
          />
        </div>
        <div className="filter-toolbar">
          <SearchBox
            value={q}
            onChange={setQ}
            placeholder="Search by code, product, or service…"
          />
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            aria-label="Filter code category"
          >
            <option value="">All categories</option>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <Table
          head={["CODE", "CLASSIFICATION", "CATEGORY", ""]}
          empty={
            !codes.length && (
              <EmptyState
                icon={Search}
                title="No matching classifications"
                description="Try a broader term or enter a custom code when adding an item."
              />
            )
          }
        >
          {codes.map((c) => (
            <tr key={c.code}>
              <td>
                <strong className="code-value">{c.code}</strong>
                <span className="table-secondary">{c.type}</span>
              </td>
              <td className="reference-description">
                <strong className="table-primary">{c.name}</strong>
                <span className="table-secondary">{c.note}</span>
              </td>
              <td>
                <Badge>{c.category}</Badge>
              </td>
              <td>
                <IconButton
                  icon={Copy}
                  label={"Copy " + c.code}
                  onClick={() =>
                    navigator.clipboard
                      .writeText(c.code)
                      .then(() => toast("Code " + c.code + " copied."))
                      .catch(() => toast("Code: " + c.code))
                  }
                />
              </td>
            </tr>
          ))}
        </Table>
        <div className="table-footer">
          <span>{codes.length} reference classifications</span>
          <span>Reference data only · Not inventory</span>
        </div>
      </Panel>
      <div className="source-section">
        <h3>Check at the source</h3>
        <p>
          Verify the latest notification and exact tariff description before
          billing.
        </p>
        <div>
          {SOURCES.map((s) => (
            <a key={s.url} href={s.url} target="_blank" rel="noreferrer">
              <BookOpen size={15} />
              {s.title}
              <ArrowUpRight size={14} />
            </a>
          ))}
        </div>
      </div>
    </>
  );
}
