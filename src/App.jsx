import React, { useState, useEffect, useCallback } from "react";
import {
  LayoutDashboard,
  ReceiptText,
  Boxes,
  UsersRound,
  Truck,
  Building2,
  ChartNoAxesCombined,
  BookOpen,
  Settings2,
  Plus,
  Search,
  Bell,
  ChevronDown,
  ChevronRight,
  ArrowUpRight,
  Check,
  CheckCircle2,
  TriangleAlert,
  PawPrint,
  LogOut,
  Menu,
  LifeBuoy,
  ShieldCheck,
  Command,
  ArrowRight,
  Package,
  CalendarDays,
  LoaderCircle,
  Stethoscope,
  X,
  Download,
  Info,
  Undo2,
} from "lucide-react";
import {
  DeskContext,
  useDesk,
  api,
  download,
  Button,
  IconButton,
  Dialog,
  SearchBox,
  EmptyState,
  ErrorBox,
  useTask,
  Avatar,
  Badge,
  ConfirmDialog,
  fmtDate,
  matches,
  money,
} from "./ui.jsx";
import { today } from "../shared.js";
import Overview from "./Overview.jsx";
import SidebarMenu from "./SidebarMenu.jsx";
import {
  Catalog,
  ProductForm,
  AdjustForm,
  ImportForm,
  HSNPage,
} from "./Catalog.jsx";
import {
  Clients,
  Suppliers,
  ClientForm,
  PetForm,
  SupplierForm,
  ClientView,
} from "./People.jsx";
import {
  Billing,
  InvoiceForm,
  InvoiceView,
  PaymentForm,
  CreditForm,
} from "./Billing.jsx";
import { Purchases, PurchaseForm, PurchaseView } from "./Purchases.jsx";
import { Returns, ReturnForm, ReturnView } from "./Returns.jsx";
import Reports from "./Reports.jsx";
import { Settings, SetupForm, RestoreForm } from "./Settings.jsx";
const initial = {
  settings: null,
  products: [],
  batches: [],
  clients: [],
  pets: [],
  suppliers: [],
  invoices: [],
  purchases: [],
  payments: [],
  credits: [],
  returns: [],
  movements: [],
  server_date: today(),
  backup_at: null,
};
const nav = [
  {
    group: "WORKSPACE",
    items: [
      ["overview", "Overview", LayoutDashboard],
      ["billing", "Billing & invoices", ReceiptText],
      ["returns", "Customer returns", Undo2],
      ["inventory", "Inventory", Boxes],
      ["clients", "Clients & pets", UsersRound],
      ["purchases", "Purchases", Truck],
      ["suppliers", "Suppliers", Building2],
    ],
  },
  { group: "INSIGHTS", items: [["reports", "Reports", ChartNoAxesCombined]] },
  {
    group: "TOOLS",
    items: [
      ["hsn", "HSN & SAC codes", BookOpen],
      ["settings", "Settings", Settings2],
    ],
  },
];
const pageNames = Object.fromEntries(
  nav.flatMap((g) => g.items.map((i) => [i[0], i[1]])),
);
function Logo({ light = false }) {
  return (
    <div className={"brand " + (light ? "brand-light" : "")}>
      <span className="brand-mark">
        <svg viewBox="0 0 32 32" aria-hidden="true">
          <path
            d="M12.9 6.5h6.2v6.4h6.4v6.2h-6.4v6.4h-6.2v-6.4H6.5v-6.2h6.4z"
            fill="currentColor"
          />
          <circle cx="22.9" cy="8.6" r="3" fill="#b9d4a9" />
        </svg>
      </span>
      <span>
        shop desk<span className="brand-period">.</span>
      </span>
    </div>
  );
}
function Login({ clinic, onLogin }) {
  const [password, setPassword] = useState(""),
    task = useTask();
  return (
    <div className="login-page">
      <div className="login-aside">
        <Logo light />
        <div className="login-copy">
          <span className="eyebrow">A LITTLE LESS ADMIN</span>
          <h1>
            More time for
            <br />
            the ones in
            <br />
            your care.
          </h1>
          <p>
            A thoughtful workspace for your inventory,
            <br />
            billing, and everything in between.
          </p>
          <div className="login-paw">
            <PawPrint size={130} strokeWidth={0.7} />
          </div>
        </div>
        <span className="login-footer">
          Built for independent veterinary clinics.
        </span>
      </div>
      <div className="login-main">
        <div className="login-form">
          <div className="soft-icon">
            <ShieldCheck size={27} />
          </div>
          <h2>Welcome back.</h2>
          <p>Sign in to {clinic || "your clinic"}’s workspace.</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              task.run(async () => {
                const r = await api("/login", {
                  method: "POST",
                  body: { password },
                });
                sessionStorage.setItem("shopdesk_token", r.token);
                onLogin();
              });
            }}
          >
            <label className="field">
              <span className="field-label">Owner password</span>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
                autoFocus
              />
            </label>
            <ErrorBox>{task.error}</ErrorBox>
            <Button
              loading={task.busy}
              className="full-width"
              icon={ArrowRight}
              type="submit"
            >
              Sign in to shop desk
            </Button>
          </form>
          <div className="secure-note">
            <ShieldCheck size={14} /> Private workspace · Owner access
          </div>
        </div>
      </div>
    </div>
  );
}
export default function App() {
  const [state, setState] = useState(initial),
    [loading, setLoading] = useState(true),
    [login, setLogin] = useState(false),
    [clinic, setClinic] = useState(""),
    [networkError, setNetworkError] = useState("");
  const [page, setPage] = useState(
      () => location.hash.replace("#/", "") || "overview",
    ),
    [stack, setStack] = useState([]),
    [toastMessage, setToastMessage] = useState(null),
    [mobile, setMobile] = useState(false),
    [accountMenu, setAccountMenu] = useState(false);
  const toast = useCallback((text, tone = "success") => {
    setToastMessage({ text, tone });
  }, []);
  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 4500);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);
  const refresh = useCallback(async () => {
    try {
      const s = await api("/state");
      setState(s);
      setLogin(false);
      return s;
    } catch (e) {
      if (e.status === 401) {
        sessionStorage.removeItem("shopdesk_token");
        setLogin(true);
      }
      throw e;
    }
  }, []);
  const bootstrap = useCallback(async () => {
    setLoading(true);
    setNetworkError("");
    try {
      const s = await api("/status");
      setClinic(s.clinic_name);
      if (
        s.ready &&
        !s.authenticated &&
        !sessionStorage.getItem("shopdesk_token")
      )
        setLogin(true);
      else await refresh();
    } catch (e) {
      if (e.status !== 401) setNetworkError(e.message);
    } finally {
      setLoading(false);
    }
  }, [refresh]);
  useEffect(() => {
    bootstrap();
  }, [bootstrap]);
  const navigate = useCallback((value) => {
    setPage(value);
    location.hash = "/" + value;
    setMobile(false);
    window.scrollTo(0, 0);
  }, []);
  useEffect(() => {
    const handler = () => {
      const v = location.hash.replace("#/", "") || "overview";
      setPage(pageNames[v] ? v : "overview");
    };
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);
  const open = useCallback(
    (type, props = {}) => {
      const canView = ["setup", "help", "search", "alerts", "confirm"];
      if (!state.settings && !canView.includes(type))
        setStack((s) => [
          ...s,
          {
            type: "setup",
            props: { next: { type, props } },
            key: crypto.randomUUID(),
          },
        ]);
      else setStack((s) => [...s, { type, props, key: crypto.randomUUID() }]);
      setAccountMenu(false);
    },
    [state.settings],
  );
  const close = useCallback(() => setStack((s) => s.slice(0, -1)), []);
  const closeAll = useCallback(() => setStack([]), []);
  useEffect(() => {
    document.body.style.overflow = stack.length ? "hidden" : "";
    const fn = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        if (!login) open("search");
      }
      if (e.key === "Escape") close();
      if (e.altKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        if (!login) open("invoice");
      }
    };
    window.addEventListener("keydown", fn);
    return () => {
      window.removeEventListener("keydown", fn);
      document.body.style.overflow = "";
    };
  }, [stack.length, login, open, close]);
  const lowStock = state.products.filter(
    (p) => p.active && p.type === "product" && p.available <= p.low_stock,
  );
  const in30 = new Date(today() + "T12:00:00Z");
  in30.setUTCDate(in30.getUTCDate() + 30);
  const expiring = state.batches.filter(
    (b) => b.qty > 0 && b.expiry && b.expiry <= in30.toISOString().slice(0, 10),
  );
  const alerts = lowStock.length + expiring.length;
  const exportBackup = async () => {
    if (!state.settings) return open("setup");
    try {
      await download("/backup");
      await refresh();
      toast("Backup downloaded. Keep it somewhere safe.");
    } catch (e) {
      toast(e.message, "error");
    }
  };
  const value = {
    state,
    refresh,
    open,
    close,
    closeAll,
    navigate,
    toast,
    lowStock,
    expiring,
    exportBackup,
    setStack,
  };
  const views = {
    overview: <Overview />,
    billing: <Billing />,
    returns: <Returns />,
    inventory: <Catalog />,
    clients: <Clients />,
    purchases: <Purchases />,
    suppliers: <Suppliers />,
    reports: <Reports />,
    hsn: <HSNPage />,
    settings: <Settings />,
  };
  if (loading)
    return (
      <div className="app-loading">
        <Logo />
        <LoaderCircle className="spin" size={23} />
        <span>Opening your workspace…</span>
      </div>
    );
  if (networkError)
    return (
      <div className="app-loading">
        <Logo />
        <ErrorBox>{networkError}</ErrorBox>
        <Button onClick={bootstrap}>Try again</Button>
      </div>
    );
  if (login) return <Login clinic={clinic} onLogin={bootstrap} />;
  return (
    <DeskContext.Provider value={value}>
      <div className="app-shell">
        <div
          className={"mobile-scrim " + (mobile ? "show" : "")}
          onClick={() => setMobile(false)}
        />
        <aside className={"sidebar " + (mobile ? "is-open" : "")}>
          <div className="sidebar-header">
            <a
              className="brand-link"
              href="#/overview"
              onClick={() => navigate("overview")}
            >
              <Logo />
            </a>
            <button
              className="clinic-switcher"
              onClick={() =>
                state.settings ? navigate("settings") : open("setup")
              }
            >
              <span className="clinic-icon">
                <Stethoscope size={20} strokeWidth={1.6} />
              </span>
              <span>
                <strong>{state.settings?.name || "Your clinic"}</strong>
                <small>
                  {state.settings ? "Clinic workspace" : "Let’s make it yours"}
                </small>
              </span>
              <ChevronDown size={14} />
            </button>
          </div>
          <SidebarMenu>
            <nav className="sidebar-nav" aria-label="Main navigation">
              {nav.map((g) => (
                <div className="nav-group" key={g.group}>
                  <div className="nav-label">{g.group}</div>
                  {g.items.map(([key, label, Icon]) => (
                    <button
                      key={key}
                      className={"nav-item " + (page === key ? "active" : "")}
                      onClick={() => navigate(key)}
                    >
                      <Icon size={18} strokeWidth={1.7} />
                      <span>{label}</span>
                      {key === "billing" &&
                        state.invoices.some((i) => i.status === "draft") && (
                          <small>
                            {
                              state.invoices.filter((i) => i.status === "draft")
                                .length
                            }
                          </small>
                        )}
                      {key === "inventory" && lowStock.length > 0 && (
                        <i className="nav-dot" />
                      )}
                    </button>
                  ))}
                </div>
              ))}
            </nav>
          </SidebarMenu>
          <div className="sidebar-bottom">
            <div className="care-card">
              <div className="care-paw">
                <PawPrint size={20} strokeWidth={1.5} />
              </div>
              <strong>Less admin. More care.</strong>
              <p>A little help getting started?</p>
              <button onClick={() => open("help")}>
                Explore the quick guide <ArrowUpRight size={14} />
              </button>
            </div>
            <div className="connection-status">
              <span />
              <span>Workspace connected</span>
              <Info size={13} />
            </div>
            <div className="sidebar-version">
              shop desk <span>v1.0</span>
            </div>
          </div>
        </aside>
        <div className="main-shell">
          <header className="topbar">
            <div className="breadcrumb">
              <IconButton
                className="mobile-toggle"
                icon={Menu}
                label="Open navigation"
                onClick={() => setMobile(true)}
              />
              <span className="breadcrumb-home">Workspace</span>
              <ChevronRight size={13} />
              <strong>{pageNames[page] || "Overview"}</strong>
            </div>
            <div className="topbar-actions">
              <button className="global-search" onClick={() => open("search")}>
                <Search size={16} />
                <span>Search your workspace</span>
                <kbd>⌘ K</kbd>
              </button>
              <div className="topbar-divider" />
              <IconButton
                icon={LifeBuoy}
                label="Quick guide"
                onClick={() => open("help")}
              />
              <div className="notification-wrap">
                <IconButton
                  icon={Bell}
                  label="Stock notifications"
                  onClick={() => open("alerts")}
                />
                {alerts > 0 && <i />}
              </div>
              <div className="account-wrap">
                <button
                  className="account-button"
                  onClick={() => setAccountMenu(!accountMenu)}
                  aria-label="Owner menu"
                >
                  <Avatar
                    name={state.settings?.owner_name || "Shop Desk"}
                    small
                  />
                  <ChevronDown size={12} />
                </button>
                {accountMenu && (
                  <>
                    <div
                      className="menu-scrim"
                      onClick={() => setAccountMenu(false)}
                    />
                    <div className="dropdown-menu account-dropdown">
                      <div className="dropdown-user">
                        <strong>
                          {state.settings?.owner_name || "Your workspace"}
                        </strong>
                        <span>
                          {state.settings?.name ||
                            "Set up your clinic to begin"}
                        </span>
                      </div>
                      <button
                        onClick={() => {
                          navigate("settings");
                          setAccountMenu(false);
                        }}
                      >
                        <Settings2 size={15} />
                        Workspace settings
                      </button>
                      <button onClick={exportBackup}>
                        <Download size={15} />
                        Download backup
                      </button>
                      {state.settings && (
                        <button
                          onClick={async () => {
                            await api("/logout", { method: "POST" }).catch(
                              () => {},
                            );
                            sessionStorage.removeItem("shopdesk_token");
                            setLogin(true);
                            setAccountMenu(false);
                            closeAll();
                          }}
                        >
                          <LogOut size={15} />
                          Sign out
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </header>
          <main className="workspace-main">
            {views[page] || views.overview}
            <footer className="workspace-footer">
              <span>
                <PawPrint size={13} /> Thoughtfully made for veterinary care.
              </span>
              <span>
                INR · India <span className="footer-dot">·</span>{" "}
                {state.settings
                  ? "Your data. Your workspace."
                  : "A clean slate. No sample data."}
              </span>
            </footer>
          </main>
        </div>
      </div>
      {stack.map((modal, i) => (
        <div
          key={modal.key}
          className={
            "modal-layer " + (i < stack.length - 1 ? "modal-hidden" : "")
          }
          aria-hidden={i < stack.length - 1 ? true : undefined}
        >
          <ModalRouter type={modal.type} props={modal.props} />
        </div>
      ))}
      {toastMessage && (
        <div className={"toast toast-" + toastMessage.tone} role="status">
          {toastMessage.tone === "error" ? (
            <TriangleAlert size={18} />
          ) : (
            <CheckCircle2 size={18} />
          )}
          <span>{toastMessage.text}</span>
          <button
            aria-label="Dismiss notification"
            onClick={() => setToastMessage(null)}
          >
            <X size={14} />
          </button>
        </div>
      )}
    </DeskContext.Provider>
  );
}
function ModalRouter({ type, props }) {
  const map = {
    setup: SetupForm,
    product: ProductForm,
    adjust: AdjustForm,
    import: ImportForm,
    client: ClientForm,
    pet: PetForm,
    supplier: SupplierForm,
    clientView: ClientView,
    invoice: InvoiceForm,
    invoiceView: InvoiceView,
    payment: PaymentForm,
    credit: CreditForm,
    purchase: PurchaseForm,
    purchaseView: PurchaseView,
    return: ReturnForm,
    returnView: ReturnView,
    restore: RestoreForm,
    confirm: ConfirmDialog,
    help: HelpDialog,
    search: SearchDialog,
    alerts: AlertsDialog,
  };
  const Component = map[type];
  return Component ? <Component {...props} /> : null;
}
function HelpDialog() {
  const { navigate, close, exportBackup } = useDesk();
  const steps = [
    [
      "01",
      "Make it your clinic",
      "Add your legal clinic details, GST status, invoice terms, and payment details.",
      "settings",
    ],
    [
      "02",
      "Bring in your own inventory",
      "Add products and services individually, or use the blank CSV import template. Add batch numbers and expiry dates for medicines.",
      "inventory",
    ],
    [
      "03",
      "A home for every patient",
      "Save a client, then add their pets. Choose them while creating an invoice.",
      "clients",
    ],
    [
      "04",
      "Bill, collect, and keep track",
      "Save a draft or issue a numbered invoice. Issuing deducts stock; payments are recorded separately. If something comes back, use Return items on the issued invoice.",
      "billing",
    ],
    [
      "05",
      "Take returns without the guesswork",
      "Record what came back, whether it is resellable, and restock the original batch. Refunds are recorded separately once paid.",
      "returns",
    ],
  ];
  return (
    <Dialog
      title="A calmer way to run your clinic"
      subtitle="A few small steps. Then you’re ready for the day."
      wide
      footer={
        <>
          <span className="muted tiny">
            Need to move your data? Use a workspace backup.
          </span>
          <Button onClick={close}>Got it</Button>
        </>
      }
    >
      <div className="help-steps">
        {steps.map(([n, title, text, page]) => (
          <button
            key={n}
            onClick={() => {
              close();
              navigate(page);
            }}
          >
            <span>{n}</span>
            <div>
              <strong>{title}</strong>
              <p>{text}</p>
            </div>
            <ChevronRight size={17} />
          </button>
        ))}
      </div>
      <div className="shortcut-grid">
        <div>
          <kbd>Ctrl / ⌘</kbd> <kbd>K</kbd>
          <span>Search workspace</span>
        </div>
        <div>
          <kbd>Alt</kbd> <kbd>N</kbd>
          <span>New invoice</span>
        </div>
        <div>
          <kbd>Esc</kbd>
          <span>Close dialog</span>
        </div>
      </div>
      <div className="notice notice-info">
        <ShieldCheck size={18} />
        <div>
          Data is saved to this server’s SQLite database, not just your browser.
          Keep regular backups. Online payment processing, GST return filing,
          and GST IRN/e-invoice submission are not connected.
        </div>
      </div>
    </Dialog>
  );
}
function AlertsDialog() {
  const { lowStock, expiring, state, open, navigate, close } = useDesk();
  return (
    <Dialog
      title="Stock watch"
      subtitle="A heads-up, so you can stay a step ahead."
      wide
    >
      <div className="alert-section">
        <h3>
          Low stock <Badge>{lowStock.length}</Badge>
        </h3>
        {lowStock.length ? (
          lowStock.map((p) => (
            <button
              className="alert-row"
              key={p.id}
              onClick={() => open("adjust", { id: p.id })}
            >
              <span className="soft-icon amber">
                <Package size={18} />
              </span>
              <div>
                <strong>{p.name}</strong>
                <small>
                  {p.available} {p.unit} available · Reorder at {p.low_stock}
                </small>
              </div>
              <ChevronRight size={16} />
            </button>
          ))
        ) : (
          <p className="muted">No low-stock items to show.</p>
        )}
      </div>
      <div className="alert-section">
        <h3>
          Expiring within 30 days <Badge>{expiring.length}</Badge>
        </h3>
        {expiring.length ? (
          expiring.map((b) => (
            <button
              className="alert-row"
              key={b.id}
              onClick={() =>
                open("adjust", { id: b.product_id, batchId: b.id })
              }
            >
              <span
                className={
                  "soft-icon " + (b.expiry < today() ? "red" : "amber")
                }
              >
                <CalendarDays size={18} />
              </span>
              <div>
                <strong>
                  {state.products.find((p) => p.id === b.product_id)?.name}
                </strong>
                <small>
                  Batch {b.batch_no || "—"} · {b.qty} units ·{" "}
                  {b.expiry < today() ? "Expired" : "Expires"}{" "}
                  {fmtDate(b.expiry)}
                </small>
              </div>
              <ChevronRight size={16} />
            </button>
          ))
        ) : (
          <p className="muted">No upcoming or expired batches to show.</p>
        )}
      </div>
      {!state.products.length && (
        <EmptyState
          icon={Boxes}
          title="A little peace of mind, built in."
          description="Add your inventory to keep an eye on stock and expiry dates."
          compact
          action={
            <Button
              variant="secondary"
              onClick={() => {
                close();
                navigate("inventory");
              }}
            >
              Go to inventory
            </Button>
          }
        />
      )}
    </Dialog>
  );
}
function SearchDialog() {
  const { state, open, navigate, close } = useDesk(),
    [q, setQ] = useState("");
  const results = [
    ...state.products
      .filter((p) => matches(q, p.name, p.sku, p.barcode))
      .map((p) => ({
        type: "Product",
        name: p.name,
        sub: p.hsn,
        icon: Package,
        fn: () => open("product", { id: p.id }),
      })),
    ...state.clients
      .filter((c) => matches(q, c.name, c.phone))
      .map((c) => ({
        type: "Client",
        name: c.name,
        sub: c.phone,
        icon: UsersRound,
        fn: () => open("clientView", { id: c.id }),
      })),
    ...state.invoices
      .filter((i) => matches(q, i.number, i.customer.name, i.pet.name))
      .map((i) => ({
        type: "Invoice",
        name: i.number || "Draft invoice",
        sub: i.customer.name || "Walk-in client",
        icon: ReceiptText,
        fn: () => open("invoiceView", { id: i.id }),
      })),
    ...state.returns
      .filter((r) =>
        matches(q, r.number, r.invoice_number, r.client_name, r.reason),
      )
      .map((r) => ({
        type: "Return",
        name: r.number,
        sub: `${r.client_name || "Walk-in client"} · ${money(r.total)}`,
        icon: Undo2,
        fn: () => open("returnView", { id: r.id }),
      })),
  ].slice(0, 20);
  return (
    <Dialog title="Search your workspace" className="search-dialog">
      <SearchBox
        value={q}
        onChange={setQ}
        placeholder="Find a product, client, or invoice…"
      />
      {q ? (
        results.length ? (
          <div className="search-results">
            {results.map((r, i) => (
              <button
                key={i}
                onClick={() => {
                  close();
                  r.fn();
                }}
              >
                <r.icon size={18} />
                <span>
                  <strong>{r.name}</strong>
                  <small>{r.sub}</small>
                </span>
                <Badge>{r.type}</Badge>
                <ArrowUpRight size={15} />
              </button>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Search}
            title="No matches this time"
            description="Try a different name, phone number, SKU, or invoice number."
            compact
          />
        )
      ) : (
        <div className="search-shortcuts">
          <div className="eyebrow">JUMP TO</div>
          {[
            ["inventory", "Inventory", Boxes],
            ["billing", "Billing & invoices", ReceiptText],
            ["clients", "Clients & pets", UsersRound],
            ["hsn", "HSN & SAC reference", BookOpen],
          ].map(([p, t, I]) => (
            <button
              key={p}
              onClick={() => {
                close();
                navigate(p);
              }}
            >
              <I size={17} />
              {t}
              <ArrowUpRight size={14} />
            </button>
          ))}
        </div>
      )}
    </Dialog>
  );
}
