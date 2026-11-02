// Documentation only: reviewed against the current source on 28 October 2026.
const methodNotes = {
  'primaryCatalogue.ts': {
    linkedToProduct: 'Match the paid product through Scheme.Product__c or an active Scheme_Product child link. A free-product reference does not make that product eligible for the offer.',
    unavailableReasons: 'Explain why an explicitly linked offer is not selectable: wrong/unset channel, inactive flag, outlet restriction, geography or dates. This is explanatory display logic; Apex still validates the order.',
    primaryCatalogue: 'Read active sellable products, eligible Primary schemes and all linked offers. Match each product explicitly, attach a Code 128 image, expose selectable schemes separately from informational linkedSchemes, and timestamp the response. No prices or scheme records are changed.',
  },
  'PrimaryOrderForm.tsx': {
    PrimaryOrderForm: 'Manage the distributor’s unsaved case quantities, notes and scheme selection. Render product details and linked offers under each product, refresh the catalogue, and pass a validated proposal to the parent confirmation flow.',
    load: 'Fetch the current catalogue. Increment a request-generation counter so an older response cannot overwrite a newer result. Background refresh preserves quantities and notes; authentication failures request sign-in.',
    configured: 'Require positive configured case price and a valid whole-number pieces-per-case value before permitting a product to be ordered.',
    review: 'Validate every selected product, whole case quantity and selected scheme, then build the order proposal. This step opens confirmation; it does not save an order or issue an invoice.',
    button: 'Render a button with consistent disabled and selected states. The supplied action determines its behavior.',
  },
  'ReturnForm.tsx': {
    ReturnForm: 'Present primary and secondary original orders, select returnable products, collect quantity and reason per line, and hand a validated group to confirmation. Primary quantities are received cases; secondary quantities are approved-order pieces.',
    load: 'Reload either the initial list or one chosen order’s eligible source lines. Ignore outdated asynchronous responses and expose truncation so a partial result cannot be submitted as a complete order.',
    choose: 'Switch the selected original order, clear its previous product selection/search and load the chosen order again.',
    edit: 'Merge one quantity, reason or notes change into the selected source line without altering other lines.',
    selectAll: 'Select all positive remaining quantities through selectWholeReturnOrder; leave reasons empty so the user must supply them.',
    review: 'Validate 1–50 current lines, whole positive quantities within available balances, allowed reasons, and notes for Other. Include selections hidden by search. Build receiptLineId/cases or orderItemId/pieces payloads for the confirmation step.',
    button: 'Render a return-form action and prevent interaction when its loading or validation state blocks it.',
  },
  'returnSelection.ts': {
    groupReturnOrders: 'Group source rows by original order ID, falling back to a receipt-specific key for legacy receipts. Identical product names on different orders remain separate.',
    selectWholeReturnOrder: 'Select each positive available balance, enforcing 1–50 lines and at most 100,000 whole units per line. It uses remaining received/ordered quantity, not the original quantity already reserved by other returns.',
  },
  'returnCatalogue.ts': { returnCatalogue: 'Read distributor-owned received receipt lines for Primary or approved order lines for Secondary. Sum non-rejected returns by source line and calculate available = max(0, original − reserved). Return at most 500 source lines with a hasMore flag; orderId narrows a selected order.' },
  'returnReview.ts': {
    returnReview: 'Authorize the return against the current distributor, fetch returned lines and original ordered products, include reasons/batches/status, and add the return barcode plus Salesforce review URL. Large results are redirected to Salesforce rather than silently truncated.',
    secondaryReturnPrefix: 'Recognize only the distributor/request/source-line key format used by the grouped return workflow; do not combine unrelated legacy returns.',
    groupSecondaryReturns: 'Combine products from the same submitted request and original order into one display group while retaining individual records and decision states.',
    salesforceReturnUrl: 'Build the organization’s read-only return review link only from a valid Salesforce origin and record identifier.',
  },
  'DmsDistributorReturns.cls': {
    requestPrefix: 'Validate the distributor/request/line identifier and extract the prefix used to group one multi-product return.',
    save: 'Validate the request key and 1–50 distinct whole-piece return lines. Lock approved source order items, verify distributor/outlet ownership, subtract non-rejected return quantities, require one original order, insert all lines as Pending and reuse matching retries by payload fingerprint.',
    decide: 'Lock and decide every product in one grouped secondary return atomically. Require rejection notes, reject conflicting terminal decisions, and make a repeat of the same decision harmless.',
  },
  'DmsReturnReviewController.cls': {
    DmsReturnReviewController: 'Initialize the review from either the page id parameter or the standard Salesforce record controller.',
    initialize: 'Validate the record reference, identify the supported return object, load its authorized data and clear partial results if access or a query fails.',
    loadPrimary: 'Use Salesforce user-mode queries to load the primary return, its returned products and its original primary order lines, including reasons and receipt batches.',
    loadSecondary: 'Use user-mode queries to load the secondary return group and original outlet order products. Respect the current Salesforce user’s record and field access.',
    getProductBarcode: 'Expose the product reference as P- plus its record ID, or an empty value when no product is linked.',
    getBarcodeValue: 'Expose this return as R- plus its record ID. The reference is not an access token.',
    getReviewUrl: 'Return the organization URL for the read-only Visualforce return review page.',
    getRecordUrl: 'Return the ordinary Salesforce Lightning record link for this return.',
  },
  'barcode.ts': {
    barcodeValue: 'Validate an 18-character Salesforce ID and prefix it with I, P or R for invoice, product or return. Encode only the identifier, not prices or personal details.',
    recordBarcode: 'Render a local Code 128 PNG with quiet zones and readable text. Cache up to 512 identifier images, reuse in-flight promises and remove failed renders from the cache.',
    invoiceIdFromBarcode: 'Accept only the exact I- plus 18-character identifier syntax. The subsequent invoice lookup still requires authorization.',
    decorateInvoice: 'Add invoice and product barcode images to an already authorized invoice without changing its saved financial snapshot.',
  },
  'loginEmail.ts': {
    createGmailCodeSender: 'Validate sender settings, connect to Gmail with authenticated TLS, send one code message, require explicit recipient acceptance and always close the transport. Log only a timestamp, provider and hashed recipient; never a code or password.',
    sendDmsLoginCode: 'Choose the configured Gmail or Salesforce sender once per request. A Gmail failure does not silently send a second code through Salesforce.',
  },
  'emailService.ts': {
    emailDeliveryIsConfigured: 'Report whether SMTP settings are present or a live Salesforce email attempt is possible. Configuration does not prove inbox delivery.',
    sendEmail: 'Use configured SMTP with bounded timeouts and recipient-acceptance checks; otherwise call the Salesforce emailSimple action with emailAddressesArray. Raise failures instead of claiming successful delivery.',
    sendEmployeeLoginCode: 'Compose the SFA employee code message with an expiry explanation and a unique request timestamp in the subject. Code generation and verification belong to authService.',
  },
  'connection.ts': {
    normalizeServerUrl: 'Trim and normalize an HTTPS API address. Reject credentials, query/fragment parts and unsupported paths so an arbitrary pasted URL is not silently accepted.',
    getApiBaseUrl: 'Use a validated stored server address when available; otherwise use the configured build default. Requests read this at runtime.',
    checkServerConnection: 'Call the candidate health endpoint without an employee token or employee data. Enforce a timeout and require the expected live SFA response before trusting the address.',
    saveApiBaseUrl: 'Normalize and check the new address before persisting it. Preserve login and unsent local entries while changing only the server-address setting.',
  },
  'ServerConnectionButton.tsx': {
    ServerConnectionButton: 'Expose the connection-recovery dialog from login and More so an installed APK can change an expired temporary API address.',
    openConnection: 'Load the currently selected API address and open the editable connection dialog.',
    saveConnection: 'Validate and test the typed address, save it on success and notify the caller. Keep the dialog/error visible when the check fails.',
  },
  'SfaMailSettings.ps1': {
    'Get-SfaGmailSettings': 'Read the existing encrypted local mail settings and decrypt them with the current Windows user’s DPAPI context. Import this PowerShell version’s security module explicitly; never put the password in the handbook or repository.',
    'Set-SfaMailEnvironment': 'Prepare Gmail SMTP variables for the backend child process only. The launcher restores the parent environment before starting the website.',
  },
  'start-sfa.ps1': { 'Start-SfaProcess': 'Capture the caller’s mail environment, inject the protected sender only for the backend, start the process hidden with logs, then restore the caller’s variables in finally. The outer supervisor restarts exited backend/website processes.' },
};

function applyUpdates(guide) {
  const chapters = guide.chapters.map(([title, body]) => [title, body]);
  chapters[3][1] += '<p><strong>Employee-code detail:</strong> SFA currently derives codes from a normalized email, server secret and time window. Codes requested within one window can repeat, and verification accepts the current and previous windows. This differs from DMS’s random one-use challenge; do not describe both mechanisms as identical.</p>';
  chapters[4][1] = chapters[4][1].replace(/<p><strong>Email delivery distinction:<\/strong>[\s\S]*?<\/p>/,
    '<p><strong>Current email delivery:</strong> the local DMS backend uses the connected Gmail SMTP sender, selected by DMS_MAIL_PROVIDER. The Salesforce action/Apex sender code remains available but is not the selected local sender. Gmail credentials are encrypted with Windows DPAPI outside the project and injected only into the backend. SMTP acceptance is distinct from inbox delivery; the user confirmed receipt and sign-in on 28 October.</p>');
  chapters[7][1] = chapters[7][1].replace(/<p><strong>Primary returns:<\/strong>[\s\S]*?<\/p>/,
    '<p><strong>Primary returns:</strong> SFA employees and the distributor portal can propose returns from received receipt lines in whole cases. The portal groups choices by original order and shows known orders even before receipt, explaining why those products are not yet returnable. Salesforce validates balances and submits the company-officer approval process.</p>')
    .replace(/<p><strong>Secondary returns:<\/strong>[\s\S]*?<\/p>/,
    '<p><strong>Secondary returns:</strong> SFA outlet visits and the DMS original-order form create Product_Return records in pieces. The distributor still approves or rejects these returns manually. The grouped portal flow requires one approved original outlet order per request and decides all selected products atomically.</p>');
  const additions = [
    ['What changed since the attached 26 October handbook', `<table><tr><th>Area</th><th>Current code and behavior</th></tr>
<tr><td>Order-based returns</td><td>Choose an original order, select all remaining eligible products or individual lines, add per-product reasons, review and submit for the correct approval.</td></tr>
<tr><td>Return barcodes and Salesforce review</td><td>R-prefixed Code 128 references open a read-only review with original order products, returned quantities, reasons and status. Primary review remains subject to Salesforce user permissions.</td></tr>
<tr><td>Primary schemes</td><td>Each product shows explicitly linked offers. Valid Primary offers are selectable; legacy, Secondary, inactive or out-of-scope offers show why they cannot apply. Catalogue refresh preserves the user’s draft selection.</td></tr>
<tr><td>Invoices and product barcodes</td><td>Final invoices come after approval, with saved line values and discounts. I/P barcode references open authorized invoice/product details.</td></tr>
<tr><td>Email and manager access</td><td>Connected Gmail delivery is active locally. The SFA connection-recovery dialog can replace an expired temporary API address without reinstalling the APK.</td></tr>
<tr><td>Documentation</td><td>This edition embeds current source, method descriptions, arguments, return paths and source-derived control flow. It is a new snapshot; the attached old file is left unchanged.</td></tr></table>`],
    ['Returns: one full order, remaining balances and approval', `<ol>
<li><strong>Choose:</strong> ReturnForm loads the return catalogue. groupReturnOrders groups by order ID, not product name. An order with no received Primary lines can be visible, but it cannot create stock eligible for return.</li>
<li><strong>Reload:</strong> choosing an order fetches its source lines again using orderId. The initial 500-line list is not assumed to contain a whole order; a truncated chosen order is blocked.</li>
<li><strong>Calculate:</strong> Primary original quantity = received paid cases + received free cases. Secondary original quantity = approved ordered pieces. Remaining = max(0, original − all non-rejected return quantities). Pending returns reserve quantities as well as approved returns.</li>
<li><strong>Select:</strong> “all” means all remaining eligible lines. Every line still needs a reason. Whole quantities, 1–50 lines, bounds and Other notes are checked before review.</li>
<li><strong>Confirm:</strong> the parent portal creates a stable request key and queues/submits the command. The authenticated distributor is supplied by the backend, not trusted from a browser field.</li>
<li><strong>Save:</strong> Apex repeats ownership and balance validation under locks. It compares the payload fingerprint on retries. Different content with the same key fails instead of creating an ambiguous duplicate.</li>
<li><strong>Approve:</strong> Primary → company Distributor Officer (Dhanush in this org). Secondary → the distributor’s manual decision. Automatic secondary <em>order</em> approval does not auto-approve returns.</li>
<li><strong>Review:</strong> the barcode/detail view presents original ordered products alongside the returned products, quantities and reasons. Saving/submitting a return is not evidence that goods moved or that money was refunded.</li></ol>
<p><strong>Example:</strong> if a receipt has 5 cases and a pending return reserves 2, only 3 remain selectable. A rejected return releases that reservation. Salesforce rechecks this at submission, so two browsers cannot safely rely on an old displayed balance.</p>`],
    ['Product schemes: why an offer appears or remains unavailable', `<p>The catalogue uses explicit product relationships. A scheme applies to the paid product through <code>Scheme__c.Product__c</code> or an active <code>Scheme_Product__c</code> child. A free product, similar name or matching brand alone does not create eligibility.</p>
<table><tr><th>Returned property</th><th>Meaning</th><th>Portal behavior</th></tr><tr><td>schemes</td><td>Active Primary candidates within date/geography scope, without an outlet-type restriction.</td><td>Can be selected; minimum cases and saved financial calculations are still revalidated.</td></tr><tr><td>linkedSchemes</td><td>All explicitly linked offers, including unavailable ones.</td><td>Show name, benefits, dates and unavailableReasons under that product. Do not silently apply a piece-based offer to cases.</td></tr></table>
<p>PrimaryOrderForm refreshes on entry, about every 60 seconds while active, and on foregrounding. A generation counter ignores stale responses; quantities/notes remain separate from catalogue data. Review detects a selected offer that has disappeared or no longer satisfies the displayed rules. Apex owns the final saved values.</p>
<p><strong>Observed on 28 October, not a permanent rule:</strong> the queried org had 11 schemes with no Primary channel configured. Parle-G had a linked legacy offer; Aashirvaad Atta 5kg had no explicit link. Showing that difference is correct. No new discount rates or artificial links were created to fill an empty panel.</p>`],
    ['Invoices, discounts and traditional barcodes', `<ol><li>DmsInvoiceService receives approved source records through the triggers. Primary invoices snapshot approved case lines; secondary invoices wait for eligible approval state and saved order lines.</li><li>Existing source keys prevent duplicate final invoices. The posting method requires nonempty lines and checks that line totals agree with the invoice total before marking it Issued.</li><li>The invoice screen/PDF reads saved quantities, unit prices, discounts and tax from the invoice snapshot. A later product price change must not rewrite the issued invoice.</li><li>barcodeValue validates the record ID; recordBarcode renders Code 128 locally and caches identifier images. Prefixes are I- for invoice, P- for product and R- for return.</li><li>Click/tap actions load details with the current session. Possession of a barcode grants no access, does not approve the order and does not encode a secret login token.</li></ol>
<p><strong>Manager explanation:</strong> “Approval creates the final financial document. Goods receipt updates stock. A barcode identifies the document or product; the application still verifies who may view it.”</p>`],
    ['Login, phone connectivity and the two running backends', `<p>The project contains the shared backend source, but the local computer runs separate processes: SFA on port 4000 from <code>Documents/Codex/sfa-mobile-local</code>, DMS on port 4001 from the main project, and the DMS portal on 8082. The runtime supplement in this handbook records the separate SFA source so the manager can distinguish repository code from the copy currently launched.</p>
<ol><li>Connection failure occurs before email delivery: a phone must reach a public HTTPS API, not the computer’s localhost.</li><li>ServerConnectionButton → normalizeServerUrl → checkServerConnection → saveApiBaseUrl checks a candidate live SFA health response without sending employee data and stores the new address.</li><li>Employee login resolves an active Employee, derives a code and invokes emailService. DMS uses its own random one-use code and distributor lookup.</li><li>SfaMailSettings reads the protected local sender and the launcher passes SMTP settings only to the backend process. The parent environment is restored before the website starts.</li><li>SMTP uses TLS, timeouts and recipient acceptance. A fresh subject timestamp helps keep new messages distinguishable. Verification checks the emailed code; it does not send another code.</li><li>The temporary phone tunnel depends on this computer staying awake and online. Its address can change when its process restarts. This is not permanent hosting; an APK alone does not host a backend.</li></ol>
<p>On 28 October the public health endpoint returned live data, protected endpoints still rejected unauthenticated access, Gmail authentication was checked, and the user confirmed the manager received the code and signed in. This documentation task does not request another email, restart services or alter credentials.</p>`],
    ['How to explain a method to your manager', `<p>Use the same five-part answer for each method: <strong>purpose → inputs → decision/validation → data read or changed → output/failure</strong>. The method cards below each file provide its exact signature, source range, return paths and called functions, followed by the complete numbered source.</p>
<p><strong>Example: returnCatalogue.</strong> “It receives the authenticated distributor ID and return type. It reads eligible source lines plus non-rejected returns, subtracts reserved quantities, and returns the remaining product choices. It only reads records; Apex validates and saves the later submission.”</p>
<p><strong>Example: receiveGoods.</strong> “It validates an approved order and the remaining paid/free cases, uses a stable request key, writes the receipt and batch inventory in one transaction, and returns the saved ID/status. If any part fails, the transaction rolls back.”</p>
<p><strong>Example: primaryCatalogue.</strong> “It matches schemes to the exact product, separates selectable Primary offers from informational linked offers, and returns them under that product. It never invents a discount or changes the scheme records.”</p>
<p>The source-derived notes describe the code that is present. An extracted call or return expression is a navigation aid, not a claim that every branch was executed. Named helper functions and route callbacks are indexed; JSX inline expressions remain explained in the numbered source.</p>`],
  ];
  chapters.splice(1, 0, additions[0]);
  chapters.push(...additions.slice(1));
  return { chapters, roles: { ...guide.roles,
    DmsDistributorReturns: 'Creates and atomically decides grouped secondary returns from one approved outlet order, with ownership, remaining-quantity and replay validation.',
    DmsReturnReviewController: 'Read-only Salesforce review of original ordered products and returned lines/reasons, with user-mode queries and clickable barcode references.',
    returnCatalogue: methodNotes['returnCatalogue.ts'].returnCatalogue,
    returnSelection: 'Pure helpers for grouping original orders and selecting only their remaining returnable quantities.',
    ReturnForm: methodNotes['ReturnForm.tsx'].ReturnForm,
    primaryCatalogue: methodNotes['primaryCatalogue.ts'].primaryCatalogue,
    loginEmail: 'DMS Gmail/retained Salesforce email adapter, with TLS, explicit acceptance checks and credential-safe audit messages.',
    connection: 'Runtime SFA API-address recovery, validation and token-free health checks for installed mobile apps.',
    ServerConnectionButton: methodNotes['ServerConnectionButton.tsx'].ServerConnectionButton,
    barcode: 'Stable Code 128 identifiers and locally rendered images for invoices, products and returns; authorization remains in the detail endpoints.',
  } };
}
module.exports = { applyUpdates, methodNotes };
