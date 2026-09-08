const fs = require('fs');
const path = require('path');
const vm = require('vm');

const sourceDir = path.resolve(__dirname, '../src');
const code = fs.readdirSync(sourceDir)
  .filter((name) => name.endsWith('.gs'))
  .sort()
  .map((name) => fs.readFileSync(path.join(sourceDir, name), 'utf8'))
  .join('\n');

let uuidCounter = 0;
global.Utilities = {
  getUuid: () => `00000000-0000-4000-8000-${String(++uuidCounter).padStart(12, '0')}`,
  Charset: { UTF_8: 'UTF-8' },
  base64Encode: (value) => Buffer.from(String(value), 'utf8').toString('base64'),
  base64Decode: (value) => Array.from(Buffer.from(String(value), 'base64')),
  base64EncodeWebSafe: (value) => Buffer.from(String(value), 'utf8').toString('base64url'),
  base64DecodeWebSafe: (value) => Array.from(Buffer.from(String(value), 'base64url')),
  newBlob: (bytes) => ({
    getDataAsString: (charset) => Buffer.from(bytes).toString(String(charset || 'utf8').toLowerCase().replace('utf-8', 'utf8'))
  }),
  formatDate: (value, timeZone, pattern) => {
    if (pattern !== 'yyyy-MM-dd') throw new Error('Harness supports yyyy-MM-dd only.');
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(new Date(value));
    const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${map.year}-${map.month}-${map.day}`;
  }
};
global.SpreadsheetApp = {
  getUi: () => ({
    alert: () => {},
    ButtonSet: { OK: 'OK' }
  })
};
const scriptPropertyStore = new Map();
global.PropertiesService = {
  getScriptProperties: () => ({
    getProperty: (key) => scriptPropertyStore.has(key) ? scriptPropertyStore.get(key) : null,
    setProperty: (key, value) => { scriptPropertyStore.set(key, String(value)); },
    deleteProperty: (key) => { scriptPropertyStore.delete(key); }
  })
};

vm.runInThisContext(code + '\n;globalThis.__selfTestResult = runSelfTests();', {
  filename: 'BrandOutreach.gs'
});
if (!global.__selfTestResult || global.__selfTestResult.failed !== 0) {
  throw new Error('Self-tests did not report success.');
}
setSystemDisabled_(false);
if (isSystemDisabled_()) throw new Error('Fresh kill-switch state should be enabled.');
const firstDisable = requestSystemDisable_();
if (!isSystemDisabled_()) throw new Error('Emergency nonce did not disable the system.');
const captured = getCurrentDisableNonce_();
requestSystemDisable_();
if (enableSystemForDisableNonce_(captured)) throw new Error('Older enable incorrectly defeated a newer emergency nonce.');
const latest = getCurrentDisableNonce_();
if (!enableSystemForDisableNonce_(latest) || isSystemDisabled_()) throw new Error('Current nonce could not be acknowledged by an intentional re-enable.');

const mockTriggers = SCHEDULED_TRIGGER_HANDLERS.map((handler, index) => ({
  getUniqueId: () => `trigger-${index + 1}`,
  getHandlerFunction: () => handler
}));
authorizeScheduledTriggers_(mockTriggers);
const currentTriggerMap = getAuthorizedTriggerMap_();
if (Object.keys(currentTriggerMap).length !== 3) throw new Error('Installer did not authorize exactly three wrapper trigger IDs.');
if (!isAuthorizedTriggerIdentity_(currentTriggerMap, 'trigger-1', SCHEDULED_TRIGGER_HANDLERS[0])) {
  throw new Error('Current trigger generation was not authorized.');
}
clearAuthorizedTriggers_();
if (isAuthorizedTriggerIdentity_(getAuthorizedTriggerMap_(), 'trigger-1', SCHEDULED_TRIGGER_HANDLERS[0])) {
  throw new Error('A revoked/queued trigger generation remained authorized.');
}
const originalConsoleError = console.error;
console.error = () => {};
try {
  for (const worker of [sendApprovedLeads, processFollowUps, checkReplies]) {
    const blocked = worker({ triggerUid: 'legacy-direct-trigger' });
    if (!blocked || blocked.skipped !== 1 || !/Direct installable-trigger/.test(blocked.message)) {
      throw new Error('A direct worker trigger was not refused at entry.');
    }
  }
  for (const menuHandler of ['menuSendApprovedLeads', 'menuProcessFollowUps', 'menuCheckReplies']) {
    if (!OWNED_TRIGGER_HANDLERS.includes(menuHandler)) throw new Error(`Cleanup omits ${menuHandler}.`);
    global[menuHandler]({ triggerUid: 'legacy-menu-trigger' });
  }
} finally {
  console.error = originalConsoleError;
}
console.log(JSON.stringify({
  passed: global.__selfTestResult.passed,
  failed: 0,
  controlRaceChecks: 4,
  triggerGenerationChecks: 3,
  directTriggerChecks: 6,
  firstDisableNonce: firstDisable.slice(0, 8)
}));
