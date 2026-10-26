// End-to-end checks always use a disposable database outside the application workspace.
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { today } from "../shared.js";
import { checkReadability } from "./readability-check.mjs";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "shop-desk-browser-"));
const child = spawn(process.execPath, ["server/index.js"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    NODE_ENV: "production",
    PORT: "3198",
    DB_PATH: path.join(tmp, "e2e.sqlite"),
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let browser;
const errors = [];
const responseErrors = [];
let log = "";
child.stderr.on("data", (b) => (log += b.toString()));
const future = () => {
  const d = new Date(today() + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + 100);
  return d.toISOString().slice(0, 10);
};
try {
  await new Promise((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error("Test server did not start: " + log)),
      10000,
    );
    child.stdout.on("data", (b) => {
      if (b.toString().includes("ready")) {
        clearTimeout(t);
        resolve();
      }
    });
    child.on("exit", (code) => {
      if (code) reject(new Error("Test server failed: " + log));
    });
  });
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", async (response) => {
    if (response.status() >= 400)
      responseErrors.push(
        `${response.status()} ${response.url()} ${await response.text().catch(() => "")}`,
      );
  });
  const dialog = () =>
    page.locator('.modal-layer:not(.modal-hidden) [role="dialog"]');
  const byLabel = (name) => dialog().getByLabel(name, { exact: false });
  const click = async (name) =>
    dialog().getByRole("button", { name, exact: true }).first().click();
  const closeAll = async () => {
    for (let n = 0; n < 20 && (await page.locator(".modal-layer").count()); n++)
      await dialog()
        .getByRole("button", { name: "Close dialog", exact: true })
        .click();
  };
  const navigate = async (pageName) => {
    await closeAll();
    await page
      .locator(".sidebar .nav-item")
      .filter({ hasText: pageName })
      .click();
  };
  const currentState = () =>
    page.evaluate(async () => {
      const r = await fetch("/api/state", {
        headers: {
          Authorization: "Bearer " + sessionStorage.getItem("shopdesk_token"),
        },
      });
      return r.json();
    });
  await page.goto("http://127.0.0.1:3198");
  await page.waitForSelector("h1");
  assert.equal(await page.locator("h1").textContent(), "Overview");
  for (const [name, title] of [
    ["Billing & invoices", "Billing & invoices"],
    ["Customer returns", "Customer returns"],
    ["Inventory", "Inventory"],
    ["Clients & pets", "Clients & pets"],
    ["Purchases", "Purchases"],
    ["Suppliers", "Suppliers"],
    ["Reports", "Reports"],
    ["HSN & SAC codes", "HSN & SAC reference"],
    ["Settings", "Settings"],
  ]) {
    await navigate(name);
    assert.equal(await page.locator("h1").textContent(), title);
    await checkReadability(page, "Empty " + name);
  }
  console.log(
    "PASS: every empty-state page renders with readable text and no errors",
  );

  // Regression: fixed navigation must remain scrollable on short viewports.
  for (const viewport of [
    { width: 1280, height: 560 },
    { width: 1024, height: 480 },
    { width: 1280, height: 360 },
    { width: 1280, height: 280 },
    { width: 844, height: 390 },
    { width: 390, height: 560 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("http://127.0.0.1:3198/#/overview");
    await page.waitForSelector("h1");
    await page.evaluate(() => window.scrollTo(0, 0));
    if (viewport.width <= 760) {
      await page.getByRole("button", { name: "Open navigation" }).click();
      await page.waitForFunction(
        () =>
          document.querySelector(".sidebar").getBoundingClientRect().x >= -0.5,
      );
    }
    const sidebar = page.locator(".sidebar");
    const menu = page.locator(".sidebar-scroll");
    const headerBefore = await page.locator(".sidebar-header").boundingBox();
    assert.ok(
      await menu.evaluate((el) => el.scrollHeight > el.clientHeight),
      "Short-screen navigation should have a scrollable overflow area",
    );
    await menu.focus();
    await page.keyboard.press("Home");
    const downTarget = await menu.evaluate((el) =>
      Math.min(
        el.scrollHeight - el.clientHeight,
        Math.max(80, el.clientHeight - 45),
      ),
    );
    await page
      .getByRole("button", { name: "Scroll menu down", exact: true })
      .click();
    await page.waitForFunction(
      (target) =>
        Math.abs(document.querySelector(".sidebar-scroll").scrollTop - target) <
        1,
      downTarget,
    );
    await page
      .getByRole("button", { name: "Scroll menu up", exact: true })
      .click();
    await page.waitForFunction(
      () => document.querySelector(".sidebar-scroll").scrollTop < 1,
    );
    const menuBox = await menu.boundingBox();
    await page.mouse.move(
      menuBox.x + 65,
      menuBox.y + Math.min(60, menuBox.height / 2),
    );
    await page.mouse.wheel(0, 1400);
    await page.waitForFunction(() => {
      const menu = document.querySelector(".sidebar-scroll");
      return (
        menu.scrollTop > 0 &&
        // Wheel positions can be quantized to a whole CSS pixel while text layout is fractional.
        Math.abs(menu.scrollTop - (menu.scrollHeight - menu.clientHeight)) <= 2
      );
    });
    assert.equal(
      await page.evaluate(() => window.scrollY),
      0,
      "Scrolling the left menu must not scroll the main workspace",
    );
    const headerAfter = await page.locator(".sidebar-header").boundingBox();
    assert.equal(
      headerAfter.y,
      headerBefore.y,
      "The clinic header must stay fixed",
    );
    assert.equal(
      headerAfter.height,
      headerBefore.height,
      "The clinic header must not shrink",
    );
    assert.ok(
      await page
        .getByRole("button", { name: "Scroll menu down", exact: true })
        .isDisabled(),
    );
    await menu.focus();
    await page.keyboard.press("Home");
    assert.equal(await menu.evaluate((el) => el.scrollTop), 0);
    await page.keyboard.press("End");
    await page.waitForFunction(() => {
      const el = document.querySelector(".sidebar-scroll");
      return Math.abs(el.scrollTop - (el.scrollHeight - el.clientHeight)) <= 2;
    });
    const settingsButton = sidebar
      .locator(".nav-item")
      .filter({ hasText: /^Settings$/ });
    let bounds = await settingsButton.boundingBox();
    const scrollBounds = await menu.boundingBox();
    assert.ok(
      bounds &&
        bounds.y >= scrollBounds.y - 1 &&
        bounds.y + bounds.height <= scrollBounds.y + scrollBounds.height + 1,
      "Settings must be visible inside the scrolling pane, not hidden behind the fixed header or footer",
    );
    assert.ok(
      bounds && bounds.y >= 0 && bounds.y + bounds.height <= viewport.height,
      `Settings must be reachable at ${viewport.width}×${viewport.height}`,
    );
    if (viewport.width === 1280 && viewport.height === 560) {
      await page.screenshot({ path: "qa/sidebar-scroll-fixed.png" });
    }
    if (viewport.width > 760) {
      const sidebarTop = await menu.evaluate((el) => el.scrollTop);
      await page.mouse.move(viewport.width - 150, 220);
      await page.mouse.wheel(0, 400);
      await page.waitForFunction(() => window.scrollY > 0);
      assert.equal(
        await menu.evaluate((el) => el.scrollTop),
        sidebarTop,
        "Main workspace scrolling must not move the left menu",
      );
      await page.evaluate(() => window.scrollTo(0, 0));
    }
    await sidebar.locator(".nav-item").first().focus();
    const navigationCount = await sidebar.locator(".nav-item").count();
    for (let i = 1; i < navigationCount; i++) {
      await page.keyboard.press("Tab");
    }
    assert.equal(
      await settingsButton.evaluate((el) => el === document.activeElement),
      true,
      "The bottom navigation item must be reachable using Tab",
    );
    bounds = await settingsButton.boundingBox();
    assert.ok(
      bounds &&
        bounds.y >= -1 &&
        bounds.y + bounds.height <= viewport.height + 1,
      `Keyboard focus must bring Settings into view at ${viewport.width}×${viewport.height}: ${JSON.stringify(bounds)}`,
    );
    await page.keyboard.press("Enter");
    await page.waitForFunction(
      () => document.querySelector("h1")?.textContent === "Settings",
    );
    console.log(`PASS: menu scrolling at ${viewport.width}×${viewport.height}`);
  }
  console.log(
    "PASS: scrollable menu pane, fixed clinic header, scroll buttons, wheel and keyboard access at six short/mobile viewport sizes",
  );
  // Exercise a real touch gesture, not just wheel events on a narrow window.
  const touchPage = await browser.newPage({
    viewport: { width: 390, height: 560 },
    isMobile: true,
    hasTouch: true,
  });
  touchPage.on("pageerror", (e) => errors.push(e.message));
  await touchPage.goto("http://127.0.0.1:3198/#/overview");
  await touchPage.getByRole("button", { name: "Open navigation" }).click();
  await touchPage.waitForFunction(
    () => document.querySelector(".sidebar").getBoundingClientRect().x >= -0.5,
  );
  const touchMenu = touchPage.locator(".sidebar-scroll");
  const touchBox = await touchMenu.boundingBox();
  const touchSession = await touchPage.context().newCDPSession(touchPage);
  const touchX = touchBox.x + 75;
  const touchY = touchBox.y + touchBox.height - 25;
  await touchSession.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: touchX, y: touchY }],
  });
  for (let step = 1; step <= 12; step++) {
    await touchSession.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: touchX, y: touchY - step * 27 }],
    });
  }
  await touchSession.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await touchPage.waitForFunction(
    () => document.querySelector(".sidebar-scroll").scrollTop > 20,
  );
  assert.equal(
    await touchPage.evaluate(() => window.scrollY),
    0,
    "Touch scrolling must stay inside the menu",
  );
  await touchPage
    .locator(".sidebar .nav-item")
    .filter({ hasText: /^Settings$/ })
    .click();
  await touchPage.waitForFunction(
    () => document.querySelector("h1")?.textContent === "Settings",
  );
  await touchPage.close();
  console.log("PASS: mobile touch swipe scrolls the menu and Settings opens");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("http://127.0.0.1:3198/#/overview");
  await page.waitForSelector("h1");
  await navigate("Overview");
  await page
    .getByRole("button", { name: "Set up your clinic", exact: true })
    .click();
  await byLabel("Clinic / legal business name").fill("E2E clinic");
  await byLabel("Owner / administrator name").fill("E2E owner");
  await byLabel("Clinic address").fill("E2E address");
  await byLabel("City").fill("E2E city");
  await byLabel("State / UT").selectOption("09");
  await byLabel("My clinic is GST-registered").check();
  await byLabel("Clinic GSTIN").fill("09ABCDE1234F1Z5");
  await byLabel("Create owner password").fill("e2e-password");
  await byLabel("Confirm password").fill("e2e-password");
  await click("Create workspace");
  await page.waitForSelector(".modal-layer", { state: "detached" });
  console.log("PASS: first-run clinic setup and authenticated persistence");
  await navigate("Inventory");
  await page.getByRole("button", { name: "Add item", exact: true }).click();
  await byLabel("Product name").fill("E2E medicine");
  await byLabel("Barcode (optional)").fill("E2E-POS-001");
  await byLabel("Billing unit").selectOption("bottle");
  await byLabel("HSN code").fill("30049085");
  await byLabel("Selling price (before GST)").fill("250");
  await byLabel("Cost price (before GST)").fill("150");
  await byLabel("Tax treatment").selectOption("taxable");
  await byLabel("GST rate").fill("5");
  await byLabel("Opening quantity").fill("12");
  await byLabel("Batch number").fill("E2E-OPEN");
  await byLabel("Expiry date").fill(future());
  await click("Add item");
  await page.waitForSelector(".modal-layer", { state: "detached" });
  assert.equal((await currentState()).products[0].stock, 12);
  await page.getByRole("button", { name: "Add item", exact: true }).click();
  await dialog().locator(".type-choice>button").nth(1).click();
  await byLabel("Service name").fill("E2E healthcare");
  await byLabel("SAC code").fill("998351");
  await byLabel("Selling price (before GST)").fill("500");
  await byLabel("Tax treatment").selectOption("exempt");
  await click("Add item");
  await page.waitForSelector(".modal-layer", { state: "detached" });
  console.log(
    "PASS: products, batches and exempt services can be added through the UI",
  );
  await navigate("Clients & pets");
  await page.getByRole("button", { name: "Add client", exact: true }).click();
  await byLabel("Client / owner name").fill("E2E client");
  await byLabel("Phone number").fill("9000000000");
  await byLabel("Billing address").fill("E2E billing address");
  await click("Add client");
  await page.waitForSelector(".modal-layer", { state: "detached" });
  await page.getByText("E2E client", { exact: true }).click();
  await click("Add patient");
  await byLabel("Patient name").fill("E2E patient");
  await byLabel("Species").selectOption("Dog");
  await click("Add patient");
  await page.waitForSelector(".modal-layer:not(.modal-hidden) .pet-cards");
  await click("New invoice");
  await dialog()
    .getByPlaceholder("Find a product, service, SKU, or scan barcode…")
    .fill("E2E medicine");
  await dialog()
    .locator(".search-select-menu>button")
    .filter({ hasText: "E2E medicine" })
    .click();
  await byLabel("Quantity for E2E medicine").fill("2");
  await byLabel("Discount for E2E medicine").fill("10");
  await dialog()
    .getByPlaceholder("Find a product, service, SKU, or scan barcode…")
    .fill("E2E healthcare");
  await dialog()
    .locator(".search-select-menu>button")
    .filter({ hasText: "E2E healthcare" })
    .click();
  await checkReadability(
    page,
    "Invoice entry form",
    ".modal-layer:not(.modal-hidden) .dialog",
  );
  await page.screenshot({ path: "qa/invoice-form-tested.png", fullPage: true });
  await click("Issue invoice");
  await page.waitForSelector(".modal-layer:not(.modal-hidden) .invoice-paper");
  let s = await currentState();
  let invoice = s.invoices[0];
  assert.equal(invoice.total, 97250);
  assert.equal(invoice.document_type, "Invoice-cum-Bill of Supply");
  assert.equal(s.products.find((p) => p.name === "E2E medicine").stock, 10);
  assert.ok(
    await dialog()
      .frameLocator('iframe[title="Invoice print preview"]')
      .getByText("Batch E2E-OPEN", { exact: false })
      .count(),
  );
  console.log(
    "PASS: mixed invoice, discount, stock deduction and batch details",
  );
  const invoicePreview = () =>
    dialog().frameLocator('iframe[title="Invoice print preview"]');
  await invoicePreview()
    .locator('body[data-format="a4"][data-template="corporate"]')
    .waitFor();
  assert.equal(
    await invoicePreview()
      .locator("body")
      .evaluate((el) => getComputedStyle(el).color),
    "rgb(17, 17, 17)",
  );
  const beforePrint = await currentState();
  for (const width of ["80", "58"]) {
    await dialog()
      .getByLabel("Output format", { exact: true })
      .selectOption("thermal-" + width);
    await invoicePreview()
      .locator(`body[data-format="thermal"][data-width="${width}"]`)
      .waitFor();
    assert.ok(
      (await invoicePreview().locator(".receipt").innerText()).includes(
        invoice.number,
      ),
    );
    assert.ok(
      (await invoicePreview().locator(".receipt").innerText()).includes(
        "TEST-BATCH",
      ) === false,
    );
    assert.ok(
      (await invoicePreview().locator(".receipt").innerText()).includes(
        "Batch E2E-OPEN",
      ),
    );
    assert.ok(
      await invoicePreview()
        .locator("body")
        .evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth + 1,
        ),
      "Thermal preview must not clip horizontally",
    );
    const popupEvent = page.waitForEvent("popup");
    await click("Print");
    const popup = await popupEvent;
    await popup.waitForSelector(
      `body[data-format="thermal"][data-width="${width}"]`,
    );
    await popup.waitForSelector("#thermal-page-size", { state: "attached" });
    const browserPDF = await popup.pdf({
      preferCSSPageSize: true,
      printBackground: true,
    });
    const pageSize = browserPDF
      .toString("latin1")
      .match(/\/MediaBox\s*\[0 0 ([\d.]+) ([\d.]+)\]/);
    assert.ok(
      pageSize &&
        Math.abs(Number(pageSize[1]) - (Number(width) * 72) / 25.4) < 1,
      "Browser print must use the selected thermal width",
    );
    await popup.close();
    const downloadEvent = page.waitForEvent("download");
    await click("Download PDF");
    const receiptPDF = await downloadEvent;
    const receiptPath = path.join(tmp, `thermal-${width}.pdf`);
    await receiptPDF.saveAs(receiptPath);
    const receiptBytes = fs.readFileSync(receiptPath);
    const mediaBox = receiptBytes
      .toString("latin1")
      .match(/\/MediaBox\s*\[0 0 ([\d.]+) ([\d.]+)\]/);
    assert.ok(
      mediaBox &&
        Math.abs(Number(mediaBox[1]) - (Number(width) * 72) / 25.4) < 0.01,
    );
  }
  await dialog()
    .getByLabel("Output format", { exact: true })
    .selectOption("a4");
  for (const template of ["compact", "classic", "corporate"]) {
    await dialog()
      .getByLabel("A4 template", { exact: true })
      .selectOption(template);
    await invoicePreview()
      .locator(`body[data-format="a4"][data-template="${template}"]`)
      .waitFor();
  }
  const afterPrint = await currentState();
  for (const key of ["invoices", "payments", "batches", "movements"])
    assert.deepEqual(
      afterPrint[key],
      beforePrint[key],
      `Print views must not change ${key}`,
    );
  await page.screenshot({
    path: "qa/corporate-invoice-tested.png",
    fullPage: true,
  });
  console.log(
    "PASS: corporate/compact/classic previews, true 58/80mm print windows and PDF downloads; no duplicate transactions",
  );
  await click("Record payment");
  await byLabel("Payment method").selectOption("UPI");
  await click("Record payment");
  await page.waitForSelector(".modal-layer:not(.modal-hidden) .invoice-paper");
  assert.equal((await currentState()).invoices[0].balance, 0);
  const pdfEvent = page.waitForEvent("download");
  await click("Download PDF");
  const pdf = await pdfEvent;
  await pdf.saveAs(path.join(tmp, "test-invoice.pdf"));
  assert.ok(
    fs
      .readFileSync(path.join(tmp, "test-invoice.pdf"))
      .subarray(0, 4)
      .toString() === "%PDF",
  );
  await click("Create credit note");
  await byLabel("Reason").fill("E2E complete return");
  await byLabel("I understand this is a full credit").check();
  await click("Issue credit note");
  await page.waitForSelector(".modal-layer:not(.modal-hidden) .credit-notice");
  s = await currentState();
  assert.equal(s.invoices[0].refund_due, 97250);
  assert.equal(s.products.find((p) => p.name === "E2E medicine").stock, 12);
  await click("Record refund");
  await click("Record refund");
  await page.waitForSelector(".modal-layer:not(.modal-hidden) .invoice-paper");
  assert.equal((await currentState()).invoices[0].refund_due, 0);
  console.log(
    "PASS: recorded payments, PDF generation, credit notes and refunds",
  );
  await navigate("Purchases");
  await page
    .getByRole("button", { name: "Record purchase", exact: true })
    .click();
  await click("Add supplier");
  await byLabel("Supplier / business name").fill("E2E supplier");
  await click("Add supplier");
  await page.waitForSelector(
    ".modal-layer:not(.modal-hidden) .purchase-top-fields",
  );
  await byLabel("Supplier invoice number").fill("E2E-BILL-1");
  await dialog()
    .getByPlaceholder("Find products by name, SKU, or barcode…")
    .fill("E2E medicine");
  await dialog()
    .locator(".search-select-menu>button")
    .filter({ hasText: "E2E medicine" })
    .click();
  await byLabel("Quantity · bottle").fill("10");
  await byLabel("Batch number").fill("E2E-RECEIVED");
  await byLabel("Expiry date").fill(future());
  await dialog()
    .getByLabel("Supplier payment status", { exact: true })
    .selectOption("full");
  await click("Save & receive stock");
  await page.waitForSelector(
    ".modal-layer:not(.modal-hidden) .purchase-view-heading",
  );
  s = await currentState();
  assert.equal(s.products.find((p) => p.name === "E2E medicine").stock, 22);
  assert.equal(s.purchases[0].total, 157500);
  assert.equal(s.purchases[0].paid, 157500);
  console.log(
    "PASS: supplier creation, purchase receiving and supplier payment",
  );
  await navigate("Reports");
  for (const name of [
    "Sales register",
    "Item performance",
    "GST summary",
    "Payments",
  ]) {
    await page.getByRole("button", { name, exact: true }).first().click();
    assert.ok(await page.locator("table").count());
  }
  const reportEvent = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export report", exact: true })
    .click();
  assert.ok((await reportEvent).suggestedFilename().endsWith(".csv"));
  await navigate("Settings");
  for (const name of [
    "Clinic profile",
    "Billing & taxes",
    "Payment details",
    "Data & security",
  ])
    await page
      .locator(".settings-nav")
      .getByRole("button", { name, exact: true })
      .first()
      .click();
  const backupEvent = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download full backup", exact: true })
    .click();
  const backupDownload = await backupEvent;
  await backupDownload.saveAs(path.join(tmp, "backup.json"));
  const backup = JSON.parse(
    fs.readFileSync(path.join(tmp, "backup.json"), "utf8"),
  );
  assert.equal(backup.tables.products.length, 2);
  assert.ok(!backup.tables.sessions);
  await page
    .getByRole("button", { name: "Restore from file", exact: true })
    .click();
  await byLabel("shop desk backup file").setInputFiles(
    path.join(tmp, "backup.json"),
  );
  await byLabel("Current owner password").fill("e2e-password");
  await byLabel("I have a backup of the current workspace").check();
  await click("Replace & restore");
  await page.waitForSelector(".modal-layer", { state: "detached" });
  assert.equal(
    (await currentState()).products.find((p) => p.name === "E2E medicine")
      .stock,
    22,
  );
  console.log("PASS: reports export and backup/restore workflow");
  await page
    .locator(".settings-nav")
    .getByRole("button", { name: "Templates & printing", exact: true })
    .click();
  await page.getByRole("radio", { name: /Compact/ }).check();
  await page
    .getByLabel("Default print format", { exact: true })
    .selectOption("thermal");
  await page
    .getByLabel("Thermal paper width", { exact: true })
    .selectOption("58");
  await page
    .getByLabel("Receipt footer", { exact: true })
    .fill("E2E clinic footer");
  await page
    .getByLabel("Include invoice terms on thermal bills", { exact: false })
    .check();
  const savePreferences = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/settings") &&
      response.request().method() === "PUT",
  );
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  assert.equal((await savePreferences).status(), 200);
  await page.reload();
  await page
    .locator(".settings-nav")
    .getByRole("button", { name: "Templates & printing", exact: true })
    .click();
  assert.equal(
    await page.getByLabel("Default print format", { exact: true }).inputValue(),
    "thermal",
  );
  assert.equal(
    await page.getByLabel("Thermal paper width", { exact: true }).inputValue(),
    "58",
  );
  assert.ok(await page.getByRole("radio", { name: /Compact/ }).isChecked());
  await page
    .getByRole("button", { name: "Show print preview", exact: true })
    .click();
  await page
    .frameLocator('iframe[title="Settings document preview"]')
    .locator('body[data-format="thermal"][data-width="58"]')
    .waitFor();
  assert.ok(
    (
      await page
        .frameLocator('iframe[title="Settings document preview"]')
        .locator(".receipt")
        .innerText()
    ).includes("E2E clinic footer"),
  );
  await checkReadability(page, "Templates and print settings");
  await page.screenshot({
    path: "qa/printing-settings-tested.png",
    fullPage: true,
  });
  console.log(
    "PASS: print preferences save/reload and real-document preview without creating sample data",
  );
  await navigate("Billing & invoices");
  const beforePOS = await currentState();
  await page.getByRole("button", { name: "New POS bill", exact: true }).click();
  const scanner = dialog().getByPlaceholder(
    "Find a product, service, SKU, or scan barcode…",
  );
  await scanner.fill("E2E-POS-001");
  await scanner.press("Enter");
  await byLabel("Quantity for E2E medicine").waitFor();
  await dialog()
    .getByLabel("Payment status", { exact: true })
    .selectOption("full");
  await byLabel("Payment method").selectOption("Cash");
  await click("Issue bill");
  await invoicePreview()
    .locator('body[data-format="thermal"][data-width="58"]')
    .waitFor();
  const afterPOS = await currentState();
  const posInvoice = afterPOS.invoices.find(
    (entry) => !beforePOS.invoices.some((old) => old.id === entry.id),
  );
  assert.ok(
    posInvoice && posInvoice.total === 26250 && posInvoice.balance === 0,
  );
  assert.equal(afterPOS.invoices.length, beforePOS.invoices.length + 1);
  assert.equal(afterPOS.payments.length, beforePOS.payments.length + 1);
  assert.equal(
    afterPOS.products.find((product) => product.name === "E2E medicine").stock,
    21,
  );
  assert.ok(
    (await invoicePreview().locator(".receipt").innerText()).includes("Cash"),
  );
  assert.ok(
    (await invoicePreview().locator(".receipt").innerText()).includes(
      "E2E clinic footer",
    ),
  );
  assert.equal(
    await invoicePreview().locator('img[alt="UPI payment QR"]').count(),
    0,
  );
  await page.waitForFunction(() => {
    const modal = document.querySelector(
      ".modal-layer:not(.modal-hidden) .dialog",
    );
    const backdrop = document.querySelector(
      ".modal-layer:not(.modal-hidden) .modal-backdrop",
    );
    return (
      modal &&
      getComputedStyle(modal).opacity === "1" &&
      backdrop &&
      getComputedStyle(backdrop).opacity === "1"
    );
  });
  await page.screenshot({ path: "qa/pos-bill-tested.png", fullPage: true });
  await closeAll();
  console.log(
    "PASS: barcode-keyboard POS bill, one recorded cash payment, FEFO stock deduction and saved 58mm preference",
  );
  // The screenshot's exact odd-paise case, through the real entry and print workflow.
  if (await page.getByRole("button", { name: "Dismiss notification" }).count())
    await page.getByRole("button", { name: "Dismiss notification" }).click();
  const beforeRounding = await currentState();
  await page.getByRole("button", { name: "New POS bill", exact: true }).click();
  await scanner.fill("E2E-POS-001");
  await scanner.press("Enter");
  await byLabel("Rate for E2E medicine").fill("1499");
  await dialog().locator('.round-off-check input[type="checkbox"]').check();
  const amount = (name) =>
    dialog()
      .locator(".invoice-totals>div")
      .filter({
        has: page.locator("span", { hasText: new RegExp("^" + name + "$") }),
      })
      .locator(".money");
  assert.equal(await amount("CGST").innerText(), "₹37.48");
  assert.equal(await amount("SGST / UTGST").innerText(), "₹37.48");
  assert.equal(
    await dialog().locator(".round-off-check .money").innerText(),
    "₹0.04",
  );
  await dialog()
    .getByLabel("Payment status", { exact: true })
    .selectOption("full");
  await byLabel("Payment method").selectOption("Cash");
  await checkReadability(
    page,
    "Odd-paise POS entry",
    ".modal-layer:not(.modal-hidden) .dialog",
  );
  await page.screenshot({
    path: "qa/readable-invoice-entry.png",
    fullPage: true,
  });
  await click("Issue bill");
  await invoicePreview()
    .locator('body[data-format="thermal"][data-width="58"]')
    .waitFor();
  const afterRounding = await currentState();
  const equalInvoice = afterRounding.invoices.find(
    (entry) => !beforeRounding.invoices.some((old) => old.id === entry.id),
  );
  assert.equal(equalInvoice.cgst, 3748);
  assert.equal(equalInvoice.sgst, 3748);
  assert.equal(equalInvoice.tax, 7496);
  assert.equal(equalInvoice.rounding, 4);
  assert.equal(equalInvoice.total, 157400);
  assert.equal(equalInvoice.paid, 157400);
  assert.equal(equalInvoice.balance, 0);
  assert.equal(
    afterRounding.payments.length,
    beforeRounding.payments.length + 1,
  );
  for (const output of ["thermal-58", "thermal-80", "a4"]) {
    await dialog()
      .getByLabel("Output format", { exact: true })
      .selectOption(output);
    await invoicePreview()
      .locator(
        'body[data-format="' + (output === "a4" ? "a4" : "thermal") + '"]',
      )
      .waitFor();
    const printed = await invoicePreview().locator("body").innerText();
    assert.ok(printed.includes("37.48") && !printed.includes("37.47"));
    assert.ok(printed.includes("1,574.00"));
  }
  await page.screenshot({ path: "qa/equal-gst-invoice.png", fullPage: true });
  await closeAll();
  if (await page.getByRole("button", { name: "Dismiss notification" }).count())
    await page.getByRole("button", { name: "Dismiss notification" }).click();
  await navigate("Reports");
  await page.getByRole("button", { name: "GST summary", exact: true }).click();
  assert.ok((await page.locator(".report-panel tbody tr").count()) > 0);
  for (const row of await page.locator(".report-panel tbody tr").all()) {
    const values = await row.locator("td").allTextContents();
    if (values.length === 7) assert.equal(values[4], values[5]);
  }
  await checkReadability(page, "Populated GST report");
  await page.screenshot({ path: "qa/readable-gst-report.png", fullPage: true });
  console.log(
    "PASS: ₹1,499 produces two ₹37.48 components, ₹0.04 round-off, one ₹1,574 payment, and matching A4/thermal/GST summaries",
  );
  for (const route of [
    "overview",
    "inventory",
    "billing",
    "returns",
    "clients",
    "purchases",
    "suppliers",
    "reports",
    "hsn",
    "settings",
  ]) {
    await page.goto("http://127.0.0.1:3198/#/" + route);
    await page.waitForSelector("h1");
    await checkReadability(page, "Desktop " + route);
    if (["overview", "inventory", "billing"].includes(route))
      await page.screenshot({
        path: "qa/readable-" + route + ".png",
        fullPage: true,
      });
  }
  console.log(
    "PASS: desktop text contrast and readable sizes on all populated routes",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of [
    "overview",
    "inventory",
    "billing",
    "returns",
    "clients",
    "purchases",
    "suppliers",
    "reports",
    "hsn",
    "settings",
  ]) {
    await page.goto("http://127.0.0.1:3198/#/" + route);
    await page.waitForSelector("h1");
    await page.waitForFunction(
      () =>
        document.querySelector(".sidebar").getBoundingClientRect().right <= 0.5,
    );
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
      "Mobile overflow: " + route,
    );
    await checkReadability(page, "Mobile " + route);
    if (route === "overview")
      await page.screenshot({
        path: "qa/readable-mobile-overview.png",
        fullPage: true,
      });
  }
  await page
    .locator(".settings-nav")
    .getByRole("button", { name: "Templates & printing", exact: true })
    .click();
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
    "Mobile print-settings overflow",
  );
  await page.screenshot({
    path: "qa/mobile-printing-tested.png",
    fullPage: true,
  });
  await page.screenshot({ path: "qa/mobile-tested.png", fullPage: true });
  await page.goto("http://127.0.0.1:3198/#/billing");
  await page.getByRole("button", { name: "New POS bill", exact: true }).click();
  await scanner.fill("E2E-POS-001");
  await scanner.press("Enter");
  await byLabel("Rate for E2E medicine").fill("1499");
  await checkReadability(
    page,
    "Mobile POS bill entry",
    ".modal-layer:not(.modal-hidden) .dialog",
  );
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
    "Mobile bill form must not widen the page",
  );
  assert.equal(
    await byLabel("Rate for E2E medicine").evaluate(
      (el) => getComputedStyle(el).fontSize,
    ),
    "14px",
  );
  await page.screenshot({ path: "qa/readable-mobile-pos.png" });
  await dialog()
    .locator(".dialog-body")
    .evaluate((el) =>
      el.scrollTo({ top: el.scrollHeight, behavior: "instant" }),
    );
  await page.screenshot({ path: "qa/readable-mobile-pos-totals.png" });
  await closeAll();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("http://127.0.0.1:3198/#/overview");
  await page.waitForSelector("h1");
  assert.equal((await currentState()).products.length, 2);
  console.log("PASS: all pages are responsive; records persist across reloads");
  assert.deepEqual(errors, []);
  console.log("PASS: no uncaught browser errors");
} catch (error) {
  console.error("API errors:", responseErrors);
  if (browser) {
    for (const context of browser.contexts()) {
      for (const openPage of context.pages()) {
        console.error(
          "Page at failure:",
          await openPage
            .locator("body")
            .innerText()
            .catch(() => "Unavailable"),
        );
        await openPage
          .screenshot({ path: "qa/browser-failure.png" })
          .catch(() => {});
      }
    }
  }
  throw error;
} finally {
  if (browser) await browser.close();
  child.kill("SIGTERM");
  await new Promise((resolve) => child.once("exit", resolve));
  fs.rmSync(tmp, { recursive: true, force: true });
}
