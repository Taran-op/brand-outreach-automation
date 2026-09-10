# Brand Outreach V1

Production-oriented, zero-additional-cost brand outreach automation using Google Sheets, Google Apps Script, Gmail, the free Advanced Gmail service, and an optional private React operator console hosted by Apps Script.

Start with [ARCHITECTURE.md](ARCHITECTURE.md), then follow this guide. The complete paste-ready server source is `dist/BrandOutreach.gs`; the same code is split by concern under `src/`. The compiled, self-contained React client is `appsscript/Index.html`. See [UI_DEPLOYMENT.md](UI_DEPLOYMENT.md) for the private web-app workflow.

The checked-in AsaiVerse deployment is configured for manual live operation with a one-message daily/per-run cap. It does not install scheduled triggers during build or deployment. Mail is still refused unless the Gmail mailbox accepts `taran@asaiverse.com` as a verified Send-As identity and the operator explicitly approves the lead and types the live confirmation phrase.

## Private React console

The console is a second operator surface over the same Sheet-backed services; it is not a second CRM or database. It supports dashboard metrics, lead search/filtering, drag-and-drop `.xlsx` import alongside one-email-per-line or CSV paste, editing, explicit approval, deterministic email previews, manual outreach jobs, recent logs, and emergency disable.

- All imported rows are `NEW`; import never approves or sends.
- Browser code has no Gmail token and never accesses the Sheet directly.
- Every server call requires the Google account in `CONFIG.UI.ALLOWED_EMAILS`.
- Deploy as **User accessing the web app** with access set to **Only myself**.
- Live/test manual jobs require a typed confirmation. Dry-run jobs do not.
- The client is bundled into one HTML file with no remote JavaScript/CSS dependency and no browser storage of lead data.

### Importing a lead list

Use **Drop XLSX** in the lead panel. The workbook is parsed inside the browser by the bundled reader, and only the chosen worksheet's cell values reach Apps Script. The file itself is never uploaded to Drive and is never stored by the script.

Three layouts are recognized automatically:

| Layout | Detected when | Handling |
|---|---|---|
| Header row | The first row names a known column — `Company`, `Contact Name`, `Email`, `Category`, `Website`, `Personalization`, `Notes`, and common aliases such as `Brand`, `Business Email`, or `Industry` | Columns are mapped by name and the header row is skipped |
| Research list | A header-less row shaped as `#, Category, Company, Website, Contact/Lead source, India, Notes` | Mapped positionally; the contact column is mined for an email address |
| Plain | Anything else | One email per line, or `Company, Email, Category` |

- Emails are extracted from mixed cells such as `Partnerships <brand@example.com>`. Bare domains become `https://` URLs, and anything that is not a plausible URL is dropped rather than guessed.
- Free-text categories are folded onto the existing category list; the original wording is preserved in Notes, along with the contact route and India availability from a research list.
- A row with a company but no usable email still imports, as a research-only `NEW` row. It can never be approved or emailed until an operator adds a valid address, and the import result reports how many rows still need one.
- Duplicates are skipped by email, or by company plus website when there is no email.
- Limits come from `CONFIG.UI`: `MAX_IMPORT_ROWS`, `MAX_IMPORT_COLUMNS`, `MAX_IMPORT_CHARACTERS`, and `MAX_IMPORT_FILE_BYTES`. The client checks the file size and the server re-checks every limit before writing.

Pasting one email per line or a CSV block still works from the same dialog.

Build and verify the complete project with:

```bash
npm install
npm run check
```

The build concatenates all numeric server modules into `dist/BrandOutreach.gs` and bundles React into `appsscript/Index.html`.

## 1. Create the project from an empty Google Sheet

1. Choose exactly one Gmail account as the automation owner, then create a new Google Sheet using that account. The Sheet may be shared for lead review, but no second account should install or re-enable automation.
2. Open **Extensions → Apps Script**.
3. In Apps Script, replace the contents of `Code.gs` with all of `dist/BrandOutreach.gs`.
4. If using the private console, add an HTML file named `Index` and replace its contents with `appsscript/Index.html`.
5. Do not also add the modular `src/*.gs` files; that would define every function twice. Maintainers may use the modular files instead, in numeric filename order.
6. Open **Project Settings**, enable **Show `appsscript.json` manifest file in editor**, and replace the manifest with the supplied `appsscript.json`.
7. Next to **Services**, click **+**, select **Gmail API**, and click **Add**. The supplied manifest also declares this service, but confirm it appears in the editor.
8. If this script uses the default Apps Script Cloud project, adding the service enables the API automatically. If your organization attached a standard Google Cloud project, an administrator may also need to enable Gmail API in that Cloud project.
9. In `00_Config` at the top of the combined file, replace every placeholder and confirm `CONFIG.UI.ALLOWED_EMAILS`. Keep the safety values unchanged at first.
10. Save, choose `setupSheet` in the function selector, and click **Run**.
11. Return to the spreadsheet and reload it. The **Brand Outreach** menu should appear.

`setupSheet()` is idempotent: it adds missing headers/validations and preserves existing rows. On a truly blank workbook it renames the blank first tab to `Leads` and creates `Outreach Log`.

## 2. Required CONFIG values

Review every value in `CONFIG`:

- `CAMPAIGN_ID`: stable one-line identifier for this campaign.
- `CAMPAIGN_SEND_CUTOFF_ISO`: final send date (`YYYY-MM-DD`). It may remain blank during setup/dry-run, but actual sends are refused until you confirm the event year and set it; all initials/follow-ups stop after that local date.
- `TIME_ZONE`: default `Asia/Kolkata`.
- `EVENT.NAME`, `ONE_LINE_DESCRIPTION`, `DATE_PREPOSITION`, `DATE_DISPLAY`, `LOCATION_DISPLAY`, and optional `ORGANIZATION`.
- `SENDER.NAME`, optional `PHONE`, and `BUSINESS_EMAIL`.
- `SENDER.FROM_EMAIL`: primary Gmail address or an accepted Gmail Send-As identity.
- `SENDER.REPLY_TO_EMAIL`: keep it in this same Gmail mailbox for reliable automatic reply checks.
- `SENDER.CC_EMAILS`: non-empty, unique internal-team addresses included on every initial, follow-up, and redirected test message. V1 is preconfigured for `ashish@asaiverse.com` and `gaurav@asaiverse.com`.
- `DAILY_SEND_LIMIT`, Gmail quota reserve, per-run caps, reply-check batch cap, and send delay.
- Day-4 / Day-9 timing and minimum F1→F2 gap. These are local calendar-day comparisons in `CONFIG.TIME_ZONE`, not rolling 24-hour durations.
- Trigger hours. Apps Script uses approximate hourly windows.

The AsaiVerse public copy currently says `January 2027` and deliberately omits unconfirmed exact dates. The internal `2027-01-31` cutoff is a conservative fail-safe, not public copy; tighten it when the event dates are confirmed.

## 3. Gmail authorization

The first function that needs a protected service shows Google’s authorization flow.

1. Run **Brand Outreach → Validate Configuration**.
2. Select the Google account that owns the Sheet and Gmail mailbox.
3. Review and allow the requested access: spreadsheet read/write, Gmail read plus compose/send, Send-As inspection, and project trigger management. The manifest deliberately avoids full-mailbox `gmail.modify` access.
4. A self-owned Apps Script project can show an “unverified app” screen. Review the project identity and scopes; if appropriate, use **Advanced → Go to project**. A Google Workspace administrator may block these scopes and must approve them under organization policy.
5. The validator confirms that `FROM_EMAIL` and `REPLY_TO_EMAIL` are accepted identities in this Gmail mailbox. It also validates the fixed CC list; CC recipients do not need Send-As authorization because they are recipients, not senders. A configured signature address may be different, but replies routed outside this mailbox cannot be detected automatically.
6. In redirected test mode, `TEST_RECIPIENT` must also be the primary address or an accepted Send-As identity owned by this executing Gmail mailbox. It is a safety sink, not an arbitrary external test address.
7. Installable triggers run as the account that created them and are not a shared project-wide schedule. The first owner-control transaction (installation or manual-only re-enable) records and retains that Gmail account as the designated automation owner; only that owner may install or re-enable afterward.

Authorization does not send email. `runSelfTests`, `setupSheet`, and previews also send nothing.

## 4. Add and approve leads

For each lead:

1. Enter Company, one Email, and Category.
2. Add Contact Name when known. Leave it blank to use `[Company] team`.
3. Add Website for operator reference.
4. Add an optional Personalization phrase or sentence. Do not put private notes here; Personalization is included in the initial email. `Notes` is never sent.
5. Leave Status as `NEW` while researching/reviewing.
6. Select a row and use **Brand Outreach → Preview Selected Email**. The menu previews the initial, follow-up 1, or follow-up 2 based on the current lifecycle stage.
7. Confirm the recipient and copy. Select the exact dropdown value `APPROVED` only when the initial email may be sent.

No initial worker accepts `NEW`, blank, lowercase `approved`, padded ` APPROVED `, or any alternative approval wording. A syntactically invalid or multi-address Email is refused. A lead Email that matches an internal CC address is also refused.

## 5. Change email templates

Edit only the template section in `04_EmailTemplates.gs` (or the matching section in the combined file):

- `CATEGORY_TEMPLATES` contains initial and follow-up positioning by category.
- `buildInitialEmail_`, `buildFollowUpOne_`, and `buildFollowUpTwo_` control structure.
- `finishEmail_` controls signature and opt-out footer.
- `resolveCategoryTemplate_` controls category keyword routing.

Keep the opt-out sentence in all stages. Preview every changed category and run self-tests after editing. Do not add unsupported attendance, footfall, partner, or audience claims.

## 6. Safe testing sequence

### Stage A — deterministic checks

Use **Brand Outreach → Run Safe Self-Tests**. It runs 33 deterministic checks covering email parsing, fixed-CC/MIME policy, exact approval gates, trigger identity checks, category routing, opt-out quote handling, later opt-out monitoring, personalization, and calendar-day eligibility without Gmail or lead changes.

The same deterministic suite can be run locally without Google services:

```bash
node tests/test-harness.js
```

### Stage B — previews

Create synthetic rows for each category. Preview with blank and populated Personalization. Confirm TO, both configured CC addresses, signature, dates, location, subject, and opt-out wording.

### Stage C — dry run

Keep:

```javascript
SENDS_ENABLED: false,
DRY_RUN: true,
TEST_MODE: true
```

Run **Send Approved Leads**, **Process Follow-ups**, and **Check Replies**. Dry run performs deterministic eligibility/validation and may write minimal `DRY_RUN` audit entries. It creates no Gmail draft, sends nothing, does not read Gmail during reply checks, and never updates lead lifecycle status, timestamps, message IDs, reply fields, or pending metadata.

### Stage D — redirected test messages

Set `TEST_RECIPIENT` to the primary address or an accepted Send-As identity in the executing Gmail mailbox, then set:

```javascript
SENDS_ENABLED: true,
DRY_RUN: false,
TEST_MODE: true
```

Run menu actions manually. The lead-facing TO is redirected to `TEST_RECIPIENT`, while the configured internal CC recipients still receive every test copy as requested. Each message has an obvious test subject/banner, counts against the same daily safety cap, and does not advance production lead state. Each synthetic lead’s Email must differ from `TEST_RECIPIENT`; equality is deliberately refused to prevent a real address from being mistaken for a redirect test. Configuration validation also refuses an external/unaccepted test recipient or a test recipient that overlaps the CC list. Trigger installation is deliberately refused in redirected TEST_MODE, and already-installed scheduled workers skip that mode, so the test inbox and CC team cannot be emailed repeatedly on a schedule.

### Stage E — end-to-end thread/reply test

Use a copy of the Sheet and a second mailbox you control as the actual lead. Set a daily/per-run cap of 1, use `TEST_MODE=false`, approve only that controlled address, and verify:

- initial message ID/thread ID are stored;
- TO is the controlled lead, CC is exactly Ashish and Gaurav, and BCC is empty;
- a reply is detected but our own sent message is not;
- a reply-all from an internal CC address is ignored as internal activity;
- an “opt out” reply sets `Opt Out=TRUE` and `DO_NOT_CONTACT`;
- follow-up drafts remain in the same Gmail thread;
- rerunning each worker sends no duplicate.

See `TESTING_AND_GO_LIVE.md` for the full matrix.

## 7. Install triggers

Recommended cadence is already configured:

- reply checks every 4 hours;
- follow-ups once daily around 10:00;
- approved initial sends once daily around 11:00.

Follow-ups run before new initials so due conversations receive priority under the shared daily cap. Every follow-up performs another immediate reply scan regardless of trigger order.

1. Sign in as the one designated automation owner. Do not install from a collaborator account: Apps Script installable triggers belong to their creator and another user cannot see or remove them through `getProjectTriggers()`.
2. Prefer installing once while `DRY_RUN=true` to test execution/authentication.
3. Use **Brand Outreach → Install / Re-enable Automation**.
4. Confirm the schedule, execution mode, and owner Gmail address shown in the dialog.
5. Open Apps Script → **Triggers** while signed in as that same owner and verify exactly three wrapper triggers: `scheduledProcessFollowUps`, `scheduledSendApprovedLeads`, and `scheduledCheckReplies`.
6. Run **Show System Status** and verify `Authorized scheduled trigger IDs: 3`.
7. Running the installer again as the recorded owner replaces that owner’s wrapper triggers and removes recognized legacy direct-worker or menu-proxy triggers instead of duplicating them. A different account is refused.

The owner identity is kept in shared script properties, including after Emergency Disable. Only the recorded owner can install automation, clear the emergency switch, or re-enable manual runs. Each installed wrapper gets an authorized trigger ID; the worker validates the exact ID/handler generation and executing Gmail mailbox again inside the shared lock before it may act. A time trigger pointed directly at a worker or its interactive menu proxy is refused before the proxy can discard trigger identity. This also neutralizes a deleted old trigger execution that had already been queued.

## 8. Go live

The AsaiVerse deployment already uses this live profile:

```javascript
SENDS_ENABLED: true,
DRY_RUN: false,
TEST_MODE: false
```

Begin with `DAILY_SEND_LIMIT=1` and both per-run send caps at 1. Run one manually approved lead, inspect Gmail Sent, the entire row, and `Outreach Log`, then increase conservatively. A reserved attempt counts against the run/day caps even when Gmail's response is lost or a later check cancels the unsent draft; this intentionally under-sends instead of risking a burst after an ambiguous result.

The current deployment has those three limits set to 1 and should remain manual-only for the first verified send. Do not install triggers until the sender identity, sent-mail evidence, reply detection, opt-out handling, and same-thread follow-up behavior have all been confirmed with an address you control.

The daily limit is a message-attempt cap shared across initials, follow-ups, and redirected tests. Gmail reports quota in recipient units, so this configuration reserves three units per message—one TO plus two CCs—and retains `GMAIL_QUOTA_RESERVE` after that reservation. Google quota remains authoritative and varies by account.

## 9. Stop all automation immediately

Use **Brand Outreach → Disable Automation (Emergency)**.

Any editor may use that command. It first records a new shared emergency nonce, enables the runtime kill switch, and revokes the current authorized trigger-ID generation, so every worker and account fails closed. It then deletes all recognized wrapper, legacy direct-worker, or menu-proxy outreach triggers owned by the invoking account. A concurrent install/re-enable that started earlier cannot acknowledge the newer nonce. Because Apps Script triggers are per-user, a collaborator cannot delete the owner’s triggers; the shared switch still neutralizes them. The Gmail send function checks the switch and the nonce again immediately before sending, so an in-flight draft fails closed.

The recorded owner should then open Apps Script → **Triggers** under the owner account and verify no recognized outreach trigger remains, and use **Show System Status** to verify `Authorized scheduled trigger IDs: 0`. Emergency Disable does not erase the recorded owner.

For defense in depth, also set `SENDS_ENABLED=false` in CONFIG. To permit menu-only dry runs later, the recorded owner may use **Re-enable Manual Runs Only**; it revokes scheduled trigger IDs, removes/verifies all of that owner's remaining outreach triggers, then clears the runtime switch without creating a schedule or bypassing CONFIG safety gates. A previously dispatched wrapper retains an obsolete ID and remains blocked after manual-only re-enable. Collaborators are deliberately refused re-enable access.

## 10. Ambiguous attempts and recovery

If a send outcome cannot be proven, the row becomes `REVIEW_REQUIRED` and its hidden pending metadata remains. This includes `Pending Recipient`, which freezes the exact intended recipient for reconciliation even if the visible Email is later edited. An ambiguous action is never automatically retried.

- If **Reset Selected Pending Draft** finds the stored draft still present, it re-reads the row under a script lock and validates the exact campaign, lead, action, attempt, recipient, thread, sender, and Gmail draft headers. With confirmation, it permanently deletes only that proven-unsent draft and clears the guard. Existing opt-out, reply, commercial, and review statuses are preserved instead of being made sendable.
- If the draft is absent, the reset is refused because delivery might have occurred. Inspect Gmail Sent using the company/recipient/time and the hidden attempt metadata. Do not clear the guard unless you can prove no email was sent.

## 11. Normal operation

- Review `Outreach Log` and Apps Script **Executions** daily.
- Manually classify `REPLIED` rows into the business pipeline statuses.
- If the script sees a human-sent outbound message in an automated thread, it sets `MANUAL_REVIEW` / `REVIEW_REQUIRED` so a scheduled follow-up cannot compete with the operator.
- Contacted rows continue rotating through low-frequency reply checks after `REPLIED` or a later commercial status so a subsequent explicit opt-out is still captured. Those checks preserve the operator's commercial status unless an opt-out is detected.
- Set `Opt Out=TRUE` for any opt-out received outside the tracked Gmail thread.
- Sort through the filter arrows created by Setup Sheet. Never sort only a selected visible range; the hidden evidence columns must move with each lead row.
- Do not change Email after an initial send. If it changes, the edit helper pauses the row as `REVIEW_REQUIRED`.
- Treat `SENDER.CC_EMAILS` as a campaign invariant after sending starts. Changing it makes prior Gmail anchors fail exact-recipient validation; review affected rows or start a new campaign Sheet.
- Treat `Outreach Log` as durable suppression evidence. Successful initial-send and opt-out / do-not-contact / not-interested records are consulted before an initial send. Never clear, delete, or replace the log sheet or its historical entries; doing so can remove independent duplicate/opt-out protection. Restore it from a known-good copy before resuming if it is damaged.
- Do not delete sent rows; their timestamps, message IDs, immutable recipient, campaign ID, and pending metadata are duplicate/recovery evidence.
- Never reuse this Sheet for a new campaign by just clearing timestamps. Create a fresh spreadsheet/copy and a new `CAMPAIGN_ID`.
- After the outreach window closes, use Emergency Disable and set `SENDS_ENABLED=false`; the cutoff blocks mail, but removing schedules avoids needless failed executions.

## 12. Official Google references

- Advanced Gmail service setup: https://developers.google.com/apps-script/advanced/gmail
- Gmail thread requirements: https://developers.google.com/workspace/gmail/api/guides/threads
- Apps Script quotas: https://developers.google.com/apps-script/guides/services/quotas
- Installable trigger behavior and restrictions: https://developers.google.com/apps-script/guides/triggers/installable
