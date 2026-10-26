# shop desk

**Inventory, billing, and invoicing for independent veterinary clinics in India.**

A clean, responsive, single-clinic web application with a real Express API and a persistent SQLite database. The application starts with **no products, clients, patients, suppliers, purchases, invoices, payments, or transactions**. The only built-in lists are system references: states, units, categories, payment methods, and an HSN/SAC lookup. There is no demo-data loader.

## Latest update: equal GST splits and a clearer UI

- New and re-saved intrastate bills use **identical rounded CGST and SGST/UTGST amounts**, in the actual calculation, saved invoice, reports, A4 and thermal output—not a display-only correction.
- Each half-rate component is rounded to paise; total tax is their sum. For **₹1,499 before 5% GST**, each component is **₹37.48**, total GST is **₹74.96**, and the amount is **₹1,573.96** before optional **₹0.04** rounding to **₹1,574.00**.
- GST-inclusive entry preserves the entered post-discount gross. Interstate IGST calculation is unchanged.
- **Issued historical invoices and recorded payments are not rewritten.** Earlier odd-split issued invoices have a notice when viewed; use a proper correction/credit-note and reissue process if required. Open an older draft with **Edit draft**, then save or issue it to apply the new rule.
- A simpler system font, darker charcoal text, larger labels and table text, clearer control borders, neutral surfaces and visible focus/scrolling states. Dashboard charts retain readable labels on phones. Mobile actions keep their text labels, including **New POS bill**.
- The scrollable sidebar, POS workflow, all invoice templates and 58/80 mm printing are retained. No sample records or database reset are included.

**Updating an existing installation? Follow `TAX-UI-UPDATE.txt`.** Merge every supplied file, including root **`shared.js`**, and restart the server; copying only frontend files will not update backend tax calculations.

## Start using it

1. Open the application and select **Set up your clinic**.
2. Enter your actual clinic details, state, GST registration status, and an owner password. No default account or password is created.
3. Add your products and services under **Inventory**, or import your own CSV using the blank template.
4. Add clients and their pets, if needed. Walk-in billing is also supported.
5. Create an invoice. **Save draft** does not change stock; **Issue invoice** deducts stock and assigns a financial-year invoice number.
6. Record payments you have actually received and download or print the invoice.
7. Download a full backup regularly from **Settings → Data & security**.

All prices use INR. Enter catalogue prices **before GST**. GST is charged only when the clinic is configured as registered and the line item is taxable. Each item's tax treatment and rate must be explicitly confirmed; picking an HSN/SAC code does not silently set a rate.

## Run on your own computer or server

Use a supported Node.js version, preferably **Node.js 22 LTS**. The application was validated in this workspace with Node 20.20.2.

```bash
cd shop-desk
npm ci
npm run build
npm start
```

Open **http://localhost:3000**. The server listens on `0.0.0.0`, so for clinic-LAN access you can use the server computer's LAN address. Use a firewall to restrict who can reach it. Do not expose an unconfigured installation publicly.

For development:

```bash
npm ci
npm run dev
```

### Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port |
| `DB_PATH` | `data/shop-desk.sqlite` | Persistent database path |
| `NODE_ENV` | unset | Set to `production` to serve the built frontend |

For production, use a persistent disk/volume for the database, run behind HTTPS, restrict access, and maintain backups. **The Arena live preview is a working preview, not a managed production hosting or automatic-backup service.** Closing the browser does not delete the server-side data, but the application's host must remain available.

`better-sqlite3` normally installs a prebuilt native binary. If one is not available for your Node/OS combination, install the platform's C++ build tools and Python 3, or use the Docker setup below. `npm start` uses a portable production flag and works on Windows, macOS, and Linux.

### Docker

```bash
docker build -t shop-desk .
docker run -d --name shop-desk -p 3000:3000 \
  -v shop-desk-data:/app/data \
  --restart unless-stopped shop-desk
```

Put HTTPS and access controls in front of the container if it is reachable over the internet. The Dockerfile is supplied for deployment; a Docker build was not run in this workspace.

## What is included

### Inventory
- Products and stock-free billable services.
- HSN/SAC, category, billing unit, SKU, barcode, selling price, cost price, and explicit tax treatment.
- Batch-level quantities, purchase costs, and expiry dates.
- Opening stock, purchase receiving, and reasoned stock adjustments.
- Low-stock alerts and 30-day expiry/expired-stock alerts.
- First-expiry-first-out allocation, with expired stock excluded from billing.
- Batch and expiry details saved on issued invoice lines and printed on PDFs.
- Stock history for opening stock, purchases, sales, returns, and adjustments.
- Archive items without deleting their transaction history.
- Atomic CSV import, a blank header-only template, and inventory CSV export.

### Billing and invoicing
- Drafts and permanent issued invoices.
- Financial-year numbering: `PREFIX/YY-YY/00001`. The sequence is not consumed if issuance fails.
- Client/patient selection and walk-in billing.
- Per-line discounts, inclusive/exclusive pricing, and optional rupee rounding.
- Intrastate CGST + SGST/UTGST or interstate IGST for regular domestic billing.
- Separate taxable, exempt, nil-rated, and non-GST treatments.
- Invoice / Tax Invoice / Bill of Supply / Invoice-cum-Bill of Supply labels according to clinic registration and line types. This workflow requires separate taxable and exempt invoices for GST-registered recipients.
- Atomic stock deduction and payment recording; negative stock and overpayments are rejected.
- Cash, UPI, card, bank-transfer, cheque, and other payment records; part payments and outstanding balances.
- Full credit notes that return inventory to the original batches. Refunds must be recorded separately after they are actually made.
- Clinic/client snapshots so later edits do not rewrite issued documents.
- A4 invoice and credit-note PDFs, an HTML print view, amounts in words, terms, registration references, and bank/UPI instructions.
- Optional UPI payment QR in an issued invoice PDF with a balance. The QR is an instruction to pay; receipt is not automatically verified.

### POS bills, thermal receipts, and invoice templates

Billing is included, not just document creation. **Billing & invoices → New POS bill** opens a counter-sale flow: search by name/SKU or use a keyboard-style barcode scanner, select an actual payment status/method, then **Issue bill**. It uses the same invoice numbering, stock allocation and payment records as normal invoicing. Printing is a separate action after a successful issue; it does not issue or charge again.

Under **Settings → Templates & printing**, choose:
- **Corporate** (default): plain black-and-white A4 invoice, high-contrast text and ruled rows.
- **Compact**: denser A4 layout for longer item lists.
- **Classic**: centred heading with a fully bordered item table.
- Default output format: A4 invoice or thermal/POS bill.
- **80 mm or 58 mm** thermal roll width, an optional receipt footer, optional invoice terms on the receipt, and UPI-QR visibility.

Open any saved invoice to switch its **Output format** or A4 template for that print/download. The preview and browser print view use the same escaped HTML renderer. A4 and thermal PDF downloads are generated on the server; thermal PDFs have a true 58/80 mm page width and content-sized length, with continuation pages for exceptionally long bills. Credit-note PDFs also support both paper formats. Drafts and credited originals are explicitly marked.

Thermal bills retain the saved document number, clinic/customer details, HSN/SAC, quantities, rates, discounts, GST split, batch/expiry details, totals, balance and actual payment records. A receipt and an A4 invoice are two layouts of the **same sale**, not two transactions. Changing a layout never rewrites saved invoice content or changes inventory. Settings previews use an existing real document; no sample bills are added.

**Printer setup:** install the manufacturer's normal operating-system printer driver, select the matching 58/80 mm paper size, use 100% scale, and disable browser headers/footers. Allow the print popup if the browser blocks it. Select the correct thermal roll in the PDF viewer too; do not use “fit to A4”. This is driver/browser-based printing, not direct ESC/POS, silent printing, automatic paper cutting, a cash-drawer trigger, or payment-terminal integration. Digital page dimensions and print workflows were tested; no physical printer was connected in this workspace. Very long receipts may require a custom roll length in the driver.

A UPI QR appears only when configured on the saved invoice and an issued bill still has money due. Paid bills, drafts, credit notes and credited originals do not display a request-to-pay QR. Payment receipt still has to be verified manually.

For an existing installation, follow **TAX-UI-UPDATE.txt** (the latest cumulative update). **BILLING-UPDATE.txt** describes the earlier POS/template additions. The update contains no database, no reset, no new dependencies and no demo-data loader. Keep the existing `data/` directory and custom `DB_PATH` unchanged.

### Clinic records, purchases, and reporting
- Clients, contacts, billing addresses, GSTINs, notes, and associated pets/patients.
- Supplier records, unique supplier bill checks, purchase receiving, and supplier payments.
- Date-filtered sales/credit register, item performance, HSN/SAC GST summary, and customer payment register with CSV exports.
- Summary metrics based only on saved records.
- Current inventory valuation using batch costs. Expired stock remains in value until written off; this is not a historical valuation report.

### Data and access
- Owner password hashed with salted scrypt; no plaintext password storage.
- Hashed session tokens with 12-hour expiry. Cookies are HTTP-only; same-tab session storage also supports embedded previews.
- Password change revokes other sessions; sign-out revokes the current session.
- Manual JSON backup and transactional restore. Backups omit passwords and sessions; restoring retains the current owner password.
- CSV exports protect against leading spreadsheet-formula characters.
- All operational assets and fonts are local. No external account, CDN, analytics, or paid API is needed.

## HSN/SAC and tax notes

The built-in reference contains common classifications for veterinary retail medicines, veterinary vaccines, dressings, syringes/instruments, pet food, harnesses/leads, shampoo, disinfectants, and veterinary services. Broad headings and detailed codes are clearly distinguished in their notes.

**Reference, not tax advice:** a code alone does not uniquely determine the applicable rate or exemption. Confirm the exact formulation, product, supply, code depth, and current notification with your supplier/accountant before billing. Rates are editable and never automatically assigned from the code library.

The CBIC service classification lists SAC **998351**, **998352**, and **998359** for pet-animal, livestock, and other veterinary services respectively. [14](https://cbic-gst.gov.in/hindi/pdf/central-tax-rate/Notification11-CGST-Annexure.pdf)

Entry 46 of Notification 12/2017-CT(R) describes an exemption for services by a veterinary clinic relating to healthcare of animals or birds; this should not be treated as a blanket exemption for every retail product or ancillary activity. [1](https://cbic-gst.gov.in/hindi/pdf/central-tax-rate/Notification12-CGST.pdf)

Verify current goods notifications and the exact HSN description through the official GST portal. The application links to these sources from the reference screen:
- [CBIC goods rate notification 9/2025-IGST(R)](https://courier.cbic.gov.in/ECCS/advisory/2025/NOTIFICATION%20NO.%209_2025-INTEGRATED%20TAX%20(RATE)%20-1759486719.pdf)
- [GST portal HSN/SAC search](https://services.gst.gov.in/services/searchhsnsac)

## Important scope limits

This is a **single-clinic, single-owner** inventory and domestic regular-taxpayer billing application, not a complete clinical EMR or a universal GST compliance product.

- **Not connected:** GST return filing, IRN/e-invoice submission, e-way bills, payment gateways, bank reconciliation, SMS, WhatsApp, and email delivery.
- Payment actions are bookkeeping records only. No funds are charged, transferred, or refunded automatically.
- Full credit-note reversals are supported. Partial credit notes and partial return/refund workflows are not implemented; fully reverse and rebill where appropriate, with accounting guidance.
- Composition-scheme, export/SEZ, reverse-charge, cess, and multi-branch/multi-user-role workflows are not implemented.
- Posted purchases are immutable receipts. Inventory corrections/returns are handled by stock adjustments; supplier debit notes and purchase-return accounting are not implemented.
- No automatic cloud backup, sync, prescribed data-retention policy, or audited production security/compliance certification is provided.
- The host/database is the system of record. Backups contain personal and financial information and must be secured.

Have an accountant review your invoice format, tax settings, and any statutory requirements applicable to your actual clinic before operational use.

## Backup and recovery

Use **Settings → Data & security → Download full backup** for a consistent JSON export. A restore replaces all business data after validating the backup and checking the current owner password. It is atomic: if any reference is invalid, the existing workspace is retained.

For file-level backups, stop the application before copying the SQLite database, or use SQLite's backup API. Do not copy only the main `.sqlite` file while WAL writes may still be active.

If the owner password is forgotten, an administrator with direct access to the server can run:

```bash
npm run reset-password
```

This is an interactive, local-only recovery command. It does not expose a web password-reset endpoint. Set `DB_PATH` to the correct database if using a custom location. In Docker, use `docker exec -it shop-desk node server/reset-password.js`.

## Validation

```bash
npm test
```

The automated workflow/tax suite covers empty installation, auth, validation, atomic imports, drafts, invoice numbering, GST arithmetic, concurrent overselling prevention, batch allocation, expiry protection, purchase receiving, payments, refunds, credit notes, immutable snapshots, PDFs, backup/restore, and session revocation. **37 tests passed** in the supplied workspace, including print defaults, HTML escaping, invoice/receipt consistency, credit/draft status, UPI eligibility, all three A4 templates, true thermal paper dimensions, long-bill pagination, settings validation and transaction-free reprinting. Regression tests cover the reported ₹1,499 odd-paise case, inclusive pricing, fractional quantities/discounts across common rates, equal HSN-group sums, actual saved payments, and unchanged historical issued snapshots.

For browser tests:

```bash
npx playwright install --with-deps chromium
npm run test:browser
```

The browser check validates first-run setup, product/service creation, client/patient creation, mixed billing and discounts, stock deduction, payments, PDF download, credit/refund, purchase receiving, supplier payments, report export, backup/restore, page reload persistence, and responsive layouts. It also validates all three invoice previews, both thermal widths in actual browser print windows and downloaded PDFs, saved print preferences, a barcode-keyboard counter sale with one cash payment, mobile print settings and six short-screen sidebar sizes. It additionally checks actual text contrast/readable sizes across empty and populated routes on desktop/mobile, mobile bill entry, and the ₹37.48/₹37.48 invoice through entry, saving, reports and both print formats. It uses an isolated temporary SQLite database and removes it afterward. Tests do not populate the real application database.

## Project layout

```text
src/           React UI, layout styles, and the system-font contrast theme
server/        Express API, SQLite schema, domain validation, PDF generation
shared.js      Reference lists, money/tax calculation, India date helpers
printing.js    Print defaults, shared document content and escaped HTML layouts
assets/        Local UI/PDF fonts and their licences
index.html     Application entry point
vite.config.js Frontend build/development configuration
package*.json  Pinned dependencies and scripts
Dockerfile     Production container definition
tests/         Isolated workflow and browser checks
```

DM Sans and DejaVu fonts retain their upstream licences in `assets/`.
