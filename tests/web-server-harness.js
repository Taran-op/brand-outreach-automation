const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const sourceFiles = ['00_Config.gs', '01_Constants.gs', '02_Utils.gs', '03_Sheets.gs', '07_OutreachService.gs', '10_WebApp.gs'];
const source = sourceFiles.map((name) => fs.readFileSync(path.join(root, 'src', name), 'utf8')).join('\n');
const context = {
  console,
  Session: {
    getActiveUser: () => ({ getEmail: () => 'taran.devx@gmail.com' })
  },
  Utilities: {
    getUuid: () => '00000000-0000-4000-8000-000000000001'
  },
  SpreadsheetApp: { flush: () => {} }
};
vm.createContext(context);
const result = vm.runInContext(`${source}\n(() => {
  const checks = [];
  const check = (condition, message) => { if (!condition) throw new Error(message); checks.push(message); };
  check(assertUiOwner_() === 'taran.devx@gmail.com', 'configured owner is authorized');
  Session.getActiveUser = () => ({ getEmail: () => 'intruder@example.com' });
  let rejected = false;
  try { assertUiOwner_(); } catch (error) { rejected = /not authorized/.test(String(error.message)); }
  check(rejected, 'unlisted account is rejected');
  check(safeSheetText_('=IMPORTXML("x")').charAt(0) === "'", 'formula-like text is neutralized');
  check(sanitizeUiText_('  A\\n B  ', 20) === 'A B', 'single-line UI text is normalized');
  check(validateUiLeadId_('demo-lead-001') === 'demo-lead-001', 'lead identifiers are validated');
  let badId = false;
  try { validateUiLeadId_('../bad'); } catch (error) { badId = true; }
  check(badId, 'unsafe lead identifiers are rejected');
  const headerMap = {};
  ALL_LEAD_HEADERS.forEach((header, index) => { headerMap[header] = index + 1; });
  const values = new Array(ALL_LEAD_HEADERS.length).fill('');
  const set = (header, value) => { values[headerMap[header] - 1] = value; };
  set(LEAD_HEADERS.LEAD_ID, 'demo-lead-001');
  set(LEAD_HEADERS.COMPANY, 'Acme');
  set(LEAD_HEADERS.EMAIL, 'brand@acme.com');
  set(LEAD_HEADERS.STATUS, STATUS.APPROVED);
  const record = { rowNumber: 2, values, headerMap };
  check(getInitialApprovalIssue_(record, [record], '', {}, { 'brand@acme.com': 1 }) === '', 'valid explicit approval is ready');
  set(LEAD_HEADERS.OPT_OUT, true);
  check(/Opt Out/.test(getInitialApprovalIssue_(record, [record], '', {}, { 'brand@acme.com': 1 })), 'opt-out approval is rejected');
  set(LEAD_HEADERS.OPT_OUT, false);
  check(/Another lead/.test(getInitialApprovalIssue_(record, [record], '', {}, { 'brand@acme.com': 2 })), 'duplicate email approval is rejected');
  let workbookRejected = false;
  try { uiImportWorkbook({ fileName: 'leads.xlsx', sheetName: 'Sheet1', rows: [['Company', 'Email']] }); }
  catch (error) { workbookRejected = /not authorized/.test(String(error.message)); }
  check(workbookRejected, 'workbook import refuses an unlisted account before parsing');
  let pasteRejected = false;
  try { uiImportLeads('brand@example.com'); }
  catch (error) { pasteRejected = /not authorized/.test(String(error.message)); }
  check(pasteRejected, 'paste import refuses an unlisted account before parsing');

  // Import mapping is exercised against stubbed sheet writes; no Sheet is touched.
  const writtenRows = [];
  getLeadsSheet_ = () => ({
    getLastColumn: () => ALL_LEAD_HEADERS.length,
    getLastRow: () => 1,
    getRange: () => ({ setValues: (rows) => { rows.forEach((row) => writtenRows.push(row)); } })
  });
  getHeaderMap_ = () => headerMap;
  getLeadRows_ = () => [];
  ensureGridSize_ = () => {};
  safeLogEvent_ = () => {};
  const column = (row, header) => row[headerMap[header] - 1];

  const workbookImport = importLeadRows_([
    ['Company Name', 'Contact Person', 'Business Email', 'Brand Category', 'Website', 'Notes'],
    ['Example Gear', 'Priya N', 'partnerships@examplegear.com', 'Mechanical Keyboards', 'examplegear.com', 'Booth near the main stage'],
    ['Northwind Audio', '', 'Hello <hello@northwindaudio.com>', 'Headphones', 'https://northwindaudio.com', ''],
    ['Example Gear', '', 'partnerships@examplegear.com', 'Mechanical Keyboards', 'examplegear.com', '']
  ], 'XLSX');
  check(workbookImport.imported === 2 && workbookImport.skipped.length === 1,
    'workbook rows import once and a repeated email is skipped');
  check(workbookImport.withoutEmail === 0, 'rows carrying an email were counted as research-only');
  check(column(writtenRows[0], LEAD_HEADERS.EMAIL) === 'partnerships@examplegear.com', 'workbook email column was not mapped');
  check(column(writtenRows[0], LEAD_HEADERS.CATEGORY) === 'Gaming Accessories', 'workbook category was not canonicalized');
  check(column(writtenRows[0], LEAD_HEADERS.WEBSITE) === 'https://examplegear.com', 'workbook website was not normalized');
  check(column(writtenRows[0], LEAD_HEADERS.STATUS) === STATUS.NEW, 'imported workbook rows must land as NEW');
  check(column(writtenRows[0], LEAD_HEADERS.OPT_OUT) === false, 'imported workbook rows must default Opt Out to false');
  check(column(writtenRows[1], LEAD_HEADERS.EMAIL) === 'hello@northwindaudio.com', 'a display-name email cell was not extracted');

  const researchImport = importLeadRows_([
    ['1', 'Gaming Peripherals', 'Vertex Devices', 'vertexdevices.example', 'Contact form only', 'Yes', 'Mice and deskmats']
  ], 'XLSX');
  const researchRow = writtenRows[writtenRows.length - 1];
  check(researchImport.imported === 1 && researchImport.withoutEmail === 1,
    'a header-less research row did not import as research-only');
  check(column(researchRow, LEAD_HEADERS.COMPANY) === 'Vertex Devices', 'research list company column was not mapped');
  check(column(researchRow, LEAD_HEADERS.EMAIL) === '', 'a research row invented an email address');
  check(/India availability: Yes/.test(column(researchRow, LEAD_HEADERS.NOTES)), 'research context was not carried into notes');
  check(getInitialApprovalIssue_({ rowNumber: 2, values: researchRow, headerMap }, [], '', {}, {}) !== '',
    'a research row without an email must never be send-eligible');

  return checks.length;
})()`, context);

const html = fs.readFileSync(path.join(root, 'appsscript', 'Index.html'), 'utf8');
assert(html.includes('google') && html.includes('script') && html.includes('run'), 'Built UI must use the Apps Script bridge.');
assert(html.includes('DRY RUN'), 'Built UI must visibly represent dry-run safety.');
assert(!/<script[^>]+src=/i.test(html), 'Built UI must not load remote script bundles.');
assert(!/localStorage|sessionStorage/.test(html), 'Lead data must not be persisted in browser storage.');
assert(!/https?:\/\/[^"']+\.(js|css)/i.test(html), 'Built UI must not depend on remote JS/CSS assets.');
assert(html.includes('.drop-zone{') && html.includes('.workbook-card{'), 'Built UI must ship styles for the workbook import surface.');
assert(/accept\s*[:=]\s*"\.xlsx/.test(html), 'Workbook picker must restrict selection to .xlsx files.');
assert.strictEqual(fs.readFileSync(path.join(root, 'gas', 'Index.html'), 'utf8'), html, 'Clasp HTML staging must match the tested bundle.');
assert.strictEqual(fs.readFileSync(path.join(root, 'gas', 'Code.gs'), 'utf8'), fs.readFileSync(path.join(root, 'dist', 'BrandOutreach.gs'), 'utf8'), 'Clasp server staging must match the tested bundle.');
console.log(JSON.stringify({ webServerChecks: result, htmlBytes: Buffer.byteLength(html) }));
