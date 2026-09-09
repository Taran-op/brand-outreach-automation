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
  }
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
  return checks.length;
})()`, context);

const html = fs.readFileSync(path.join(root, 'appsscript', 'Index.html'), 'utf8');
assert(html.includes('google') && html.includes('script') && html.includes('run'), 'Built UI must use the Apps Script bridge.');
assert(html.includes('DRY RUN'), 'Built UI must visibly represent dry-run safety.');
assert(!/<script[^>]+src=/i.test(html), 'Built UI must not load remote script bundles.');
assert(!/localStorage|sessionStorage/.test(html), 'Lead data must not be persisted in browser storage.');
assert(!/https?:\/\/[^"']+\.(js|css)/i.test(html), 'Built UI must not depend on remote JS/CSS assets.');
assert.strictEqual(fs.readFileSync(path.join(root, 'gas', 'Index.html'), 'utf8'), html, 'Clasp HTML staging must match the tested bundle.');
assert.strictEqual(fs.readFileSync(path.join(root, 'gas', 'Code.gs'), 'utf8'), fs.readFileSync(path.join(root, 'dist', 'BrandOutreach.gs'), 'utf8'), 'Clasp server staging must match the tested bundle.');
console.log(JSON.stringify({ webServerChecks: result, htmlBytes: Buffer.byteLength(html) }));
