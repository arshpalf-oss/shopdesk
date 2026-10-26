import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
} from "react";
import {
  X,
  ArrowUpRight,
  Plus,
  Search,
  ChevronDown,
  CheckCircle2,
  AlertCircle,
  LoaderCircle,
  ArrowRight,
  Download,
  PackageOpen,
} from "lucide-react";
import { STATES, money, today } from "../shared.js";
export const DeskContext = createContext(null);
export const useDesk = () => useContext(DeskContext);
export const fmtDate = (d, opts = {}) =>
  d
    ? new Date(d + "T12:00:00").toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
        ...opts,
      })
    : "—";
export const initials = (s) =>
  (s || "Shop Desk")
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
export const lower = (s) => (s || "").toLowerCase();
export const matches = (q, ...values) =>
  values.some((v) => lower(String(v ?? "")).includes(lower(q)));
export async function api(url, options = {}) {
  const token = sessionStorage.getItem("shopdesk_token");
  const res = await fetch("/api" + url, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: "Bearer " + token } : {}),
      ...options.headers,
    },
    body:
      options.body && typeof options.body !== "string"
        ? JSON.stringify(options.body)
        : options.body,
  });
  if (!res.ok) {
    const data = await res
      .json()
      .catch(() => ({ error: "The server could not complete the request" }));
    const error = new Error(data.error);
    error.status = res.status;
    throw error;
  }
  return res.json();
}
export async function download(url, filename) {
  const token = sessionStorage.getItem("shopdesk_token");
  const res = await fetch("/api" + url, {
    headers: token ? { Authorization: "Bearer " + token } : {},
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: "Download failed" }));
    throw new Error(data.error);
  }
  const blob = await res.blob();
  const objectURL = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectURL;
  a.download =
    filename ||
    res.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ||
    "shop-desk-export";
  a.click();
  setTimeout(() => URL.revokeObjectURL(objectURL), 3000);
}
export function localDownload(content, name, type = "text/csv;charset=utf-8") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}
export function useForm(initial) {
  const [form, setForm] = useState(initial);
  const field = (name) => ({
    name,
    value: form[name] ?? "",
    onChange: (e) =>
      setForm((f) => ({
        ...f,
        [name]:
          e.target.type === "checkbox" ? e.target.checked : e.target.value,
      })),
  });
  return [form, setForm, field];
}
export function useTask() {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function run(fn) {
    setError("");
    setBusy(true);
    try {
      return await fn();
    } catch (e) {
      setError(e.message);
      return null;
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, setError, run };
}
export function Button({
  children,
  variant = "primary",
  size = "",
  icon: Icon,
  loading = false,
  className = "",
  ...props
}) {
  return (
    <button
      className={`btn btn-${variant} ${size ? "btn-" + size : ""} ${className}`}
      {...props}
      disabled={props.disabled || loading}
    >
      {loading ? (
        <LoaderCircle size={16} className="spin" />
      ) : (
        Icon && <Icon size={16} strokeWidth={1.8} />
      )}
      <span>{children}</span>
    </button>
  );
}
export function IconButton({ icon: Icon, label, className = "", ...props }) {
  return (
    <button
      className={"icon-btn " + className}
      aria-label={label}
      title={label}
      {...props}
    >
      <Icon size={18} strokeWidth={1.8} />
    </button>
  );
}
export function SearchBox({
  value,
  onChange,
  placeholder = "Search...",
  className = "",
}) {
  return (
    <div className={"search-box " + className}>
      <Search size={16} />
      <input
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <button aria-label="Clear search" onClick={() => onChange("")}>
          <X size={14} />
        </button>
      )}
    </div>
  );
}
function labelControl(child, id) {
  if (!React.isValidElement(child)) return child;
  if (
    ["input", "select", "textarea"].includes(child.type) ||
    child.type === StateSelect
  )
    return React.cloneElement(child, { id: child.props.id || id });
  if (child.props.children)
    return React.cloneElement(
      child,
      {},
      React.Children.map(child.props.children, (c) => labelControl(c, id)),
    );
  return child;
}
export function Field({ label, hint, required, children, className = "" }) {
  const ref = useRef("f-" + Math.random().toString(36).slice(2));
  return (
    <label className={"field " + className} htmlFor={ref.current}>
      <span className="field-label">
        {label}
        {required && <span className="required">*</span>}
      </span>
      {labelControl(children, ref.current)}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}
export function StateSelect(props) {
  return (
    <select {...props}>
      <option value="" disabled>
        Select state / UT
      </option>
      {STATES.map(([code, name]) => (
        <option value={code} key={code}>
          {name} ({code})
        </option>
      ))}
    </select>
  );
}
export function ErrorBox({ children }) {
  return children ? (
    <div className="error-box" role="alert">
      <AlertCircle size={17} />
      <span>{children}</span>
    </div>
  ) : null;
}
export function Notice({ children, tone = "info", icon: Icon = AlertCircle }) {
  return (
    <div className={"notice notice-" + tone}>
      <Icon size={17} />
      <div>{children}</div>
    </div>
  );
}
export function Badge({ children, tone = "neutral", dot = false }) {
  return (
    <span className={"badge badge-" + tone}>
      {dot && <i />}
      {children}
    </span>
  );
}
export function InvoiceBadge({ invoice }) {
  return invoice.status === "draft" ? (
    <Badge>Draft</Badge>
  ) : invoice.status === "credited" ? (
    <Badge tone="purple">Credited</Badge>
  ) : invoice.balance === 0 ? (
    <Badge tone="green" dot>
      Paid
    </Badge>
  ) : invoice.paid > 0 ? (
    <Badge tone="amber" dot>
      Part paid
    </Badge>
  ) : invoice.due_date < today() ? (
    <Badge tone="red" dot>
      Overdue
    </Badge>
  ) : (
    <Badge tone="amber" dot>
      Unpaid
    </Badge>
  );
}
export function PageHeader({ eyebrow, title, description, actions }) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      <div className="page-actions">{actions}</div>
    </div>
  );
}
export function EmptyState({
  icon: Icon = PackageOpen,
  title,
  description,
  action,
  compact = false,
  children,
}) {
  return (
    <div className={"empty-state " + (compact ? "empty-compact" : "")}>
      <div className="empty-icon">
        <Icon size={27} strokeWidth={1.35} />
      </div>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action}
      {children}
    </div>
  );
}
export function Panel({
  title,
  description,
  action,
  children,
  className = "",
}) {
  return (
    <section className={"panel " + className}>
      {(title || action) && (
        <div className="panel-heading">
          <div>
            <h2>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
export function Dialog({
  title,
  subtitle,
  children,
  footer,
  wide = false,
  xwide = false,
  onClose,
  busy = false,
  className = "",
}) {
  const { close } = useDesk();
  const dialogRef = useRef();
  useEffect(() => {
    const old = document.activeElement;
    const timer = setTimeout(() => {
      const el = dialogRef.current;
      const first =
        el?.querySelector(
          "input:not([disabled]),select:not([disabled]),textarea:not([disabled])",
        ) || el?.querySelector("button");
      first?.focus({ preventScroll: true });
    }, 50);
    return () => {
      clearTimeout(timer);
      old?.focus?.({ preventScroll: true });
    };
  }, []);
  const keyboard = (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      if (!busy) (onClose || close)();
    }
    if (e.key === "Tab") {
      const items = [
        ...dialogRef.current.querySelectorAll(
          'input,select,textarea,button,[tabindex="0"]',
        ),
      ].filter((el) => !el.disabled && el.offsetParent !== null);
      if (e.shiftKey && document.activeElement === items[0]) {
        e.preventDefault();
        items.at(-1)?.focus();
      } else if (!e.shiftKey && document.activeElement === items.at(-1)) {
        e.preventDefault();
        items[0]?.focus();
      }
    }
  };
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) (onClose || close)();
      }}
    >
      <section
        ref={dialogRef}
        onKeyDown={keyboard}
        className={`dialog ${wide ? "dialog-wide" : ""} ${xwide ? "dialog-xwide" : ""} ${className}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="dialog-heading">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <IconButton
            icon={X}
            label="Close dialog"
            onClick={onClose || close}
            disabled={busy}
          />
        </header>
        <div className="dialog-body">{children}</div>
        {footer && <footer className="dialog-footer">{footer}</footer>}
      </section>
    </div>
  );
}
export function Table({ head, children, empty }) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            {head.map((h, i) => (
              <th
                key={i}
                className={typeof h === "object" ? h.className || "" : ""}
              >
                {typeof h === "object" ? h.label : h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
      {empty}
    </div>
  );
}
export function Money({ value, className = "" }) {
  return <span className={"money " + className}>{money(value)}</span>;
}
export function StatCard({
  title,
  value,
  note,
  icon: Icon,
  tone = "green",
  tag,
}) {
  return (
    <div className="stat-card">
      <div className="stat-top">
        <span>{title}</span>
        <div className={"stat-icon " + tone}>
          <Icon size={19} strokeWidth={1.65} />
        </div>
      </div>
      <div className="stat-value">{value}</div>
      <div className="stat-note">
        {tag && <span className="mini-dot" />}
        {note}
      </div>
    </div>
  );
}
export function SectionTitle({ children, note }) {
  return (
    <div className="form-section-title">
      <h3>{children}</h3>
      {note && <p>{note}</p>}
    </div>
  );
}
export function Toggle({ checked, onChange, label, description }) {
  return (
    <label className="toggle-row">
      <div>
        <strong>{label}</strong>
        {description && <span>{description}</span>}
      </div>
      <span className={"toggle " + (checked ? "is-on" : "")}>
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span />
      </span>
    </label>
  );
}
export function Segments({ options, value, onChange }) {
  return (
    <div className="segments">
      {options.map((o) => (
        <button
          key={o.value}
          className={o.value === value ? "active" : ""}
          onClick={() => onChange(o.value)}
        >
          {o.label}
          {o.count !== undefined && <span>{o.count}</span>}
        </button>
      ))}
    </div>
  );
}
export function ConfirmDialog({
  title = "Are you sure?",
  description,
  confirm = "Confirm",
  danger = false,
  onConfirm,
}) {
  const { close } = useDesk(),
    task = useTask();
  return (
    <Dialog
      title={title}
      busy={task.busy}
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button
            variant={danger ? "danger" : "primary"}
            loading={task.busy}
            onClick={() =>
              task.run(async () => {
                await onConfirm();
                close();
              })
            }
          >
            {confirm}
          </Button>
        </>
      }
    >
      <p className="confirm-description">{description}</p>
      <ErrorBox>{task.error}</ErrorBox>
    </Dialog>
  );
}
export function Avatar({ name, small = false, tone = "green" }) {
  return (
    <span className={`avatar ${small ? "avatar-sm" : ""} avatar-${tone}`}>
      {initials(name)}
    </span>
  );
}
export function ExportButton({
  type,
  label = "Export",
  variant = "secondary",
}) {
  const { toast, state, open } = useDesk();
  return (
    <Button
      variant={variant}
      icon={Download}
      onClick={() =>
        state.settings
          ? download("/export/" + type).catch((e) => toast(e.message, "error"))
          : open("setup")
      }
    >
      {label}
    </Button>
  );
}
export function SearchSelect({
  items,
  onPick,
  placeholder = "Search items...",
  renderItem,
  empty = "No matches found",
}) {
  const [q, setQ] = useState(""),
    [shown, setShown] = useState(false),
    [active, setActive] = useState(0);
  const ref = useRef(),
    listId = useRef("list-" + Math.random().toString(36).slice(2));
  const filtered = items
    .filter((i) => matches(q, i.name, i.sku, i.barcode, i.hsn))
    .slice(0, 30);
  useEffect(() => {
    const handler = (e) => {
      if (!ref.current?.contains(e.target)) setShown(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);
  const pick = (item) => {
    onPick(item);
    setQ("");
    setShown(false);
    setActive(0);
  };
  const keydown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (filtered.length && q.trim())
        pick(filtered[Math.min(active, filtered.length - 1)]);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setShown(true);
      setActive((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Escape" && shown) {
      e.stopPropagation();
      setShown(false);
    }
  };
  return (
    <div className="search-select" ref={ref}>
      <div className="search-box">
        <Search size={17} />
        <input
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={shown}
          aria-controls={listId.current}
          aria-activedescendant={
            shown && filtered.length
              ? listId.current +
                "-" +
                filtered[Math.min(active, filtered.length - 1)]?.id
              : undefined
          }
          placeholder={placeholder}
          aria-label={placeholder}
          value={q}
          onKeyDown={keydown}
          onFocus={() => setShown(true)}
          onChange={(e) => {
            setQ(e.target.value);
            setShown(true);
            setActive(0);
          }}
        />
      </div>
      {shown && (
        <div className="search-select-menu" id={listId.current} role="listbox">
          {filtered.map((item, index) => (
            <button
              key={item.id}
              id={listId.current + "-" + item.id}
              type="button"
              role="option"
              aria-selected={index === active}
              className={index === active ? "keyboard-active" : ""}
              onMouseEnter={() => setActive(index)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(item)}
            >
              {renderItem ? renderItem(item) : item.name}
            </button>
          ))}
          {!filtered.length && <div className="select-empty">{empty}</div>}
        </div>
      )}
    </div>
  );
}

export { money } from "../shared.js";
