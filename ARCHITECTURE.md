# Brand Outreach V1 — Architecture and implementation plan

## Outcome

This is a container-bound Google Sheets + Google Apps Script + Gmail system. The spreadsheet remains the source of truth and approval ledger. A private React operator console can be served by the same Apps Script project; it is an additional view/controller, not a separate CRM or datastore. There is no paid automation platform, no AI API, and no runtime AI dependency.

The shipped configuration cannot send email: `DRY_RUN=true`, `SENDS_ENABLED=false`, and `TEST_MODE=true`. The sheet initializer, preview workflow, and all 33 deterministic checks were verified in a live Google Sheet. Gmail sending, live threading, and reply detection remain deliberately untested until the operator completes the controlled mailbox checks. No email was sent and no automation trigger was installed.

## Complete workflow

1. An operator adds a lead to `Leads`. The edit helper assigns a Lead ID and defaults a blank status to `NEW`; Setup Sheet backfills the same fields for imported/existing rows.
2. The operator reviews the company, single recipient email, category, and optional personalization.
3. The operator previews the selected row. Preview displays stage, TO, fixed CC, SUBJECT, and BODY and makes no state change.
4. The operator selects the literal dropdown value `APPROVED` for reviewed leads. Case-folded or whitespace-padded variants are not approval.
5. The initial worker obtains the shared script lock and processes rows sequentially. It re-reads each row by immutable Lead ID before draft creation and again after final Gmail draft validation, immediately before `Drafts.send`.
6. A live initial email is allowed only when the raw cell value is still exactly `APPROVED`, `Opt Out` is not true, the email is valid and does not overlap an internal CC, no initial evidence/pending action exists, and no other row or success log suppresses that normalized email.
7. The script reserves one message attempt and three Gmail recipient units, creates a Gmail draft, validates exactly one intended TO plus the complete configured CC set and no BCC, stores a unique pending attempt plus immutable pending recipient, flushes Sheets, re-reads eligibility, validates the complete draft tuple again, performs one final Sheet check, and sends the draft.
8. Gmail message/thread IDs and the timestamp are written before the pending guard is cleared. The status becomes `SENT`.
9. The follow-up worker checks Day 4 / Day 9 eligibility, performs a fresh reply check, and creates an RFC-threaded Gmail draft using the prior outbound message as its exact anchor.
10. The reply worker inspects only the stored Gmail conversation. A human reply becomes `REPLIED`; explicit opt-out wording becomes `DO_NOT_CONTACT`; likely bounces, auto-replies, and manual outbound activity become `REVIEW_REQUIRED` so automation pauses safely. Contacted rows keep rotating through low-frequency checks after later commercial statuses so a subsequent explicit opt-out is still captured without moving the sales status backwards.
11. Every row is isolated by error handling. One failure is logged and later rows continue, subject to runtime and send limits.

## Components

| File | Responsibility |
|---|---|
| `00_Config.gs` | Event, organization, sender, safety mode, timing, limits, and trigger configuration |
| `01_Constants.gs` | Statuses, categories, headers, actions, and owned trigger names |
| `02_Utils.gs` | Validation, exact send gates, trigger-generation authorization, escaping, locking, summaries, and timing helpers |
| `03_Sheets.gs` | Idempotent setup, formatting, validations, row lookup/update, and minimal audit logging |
| `04_EmailTemplates.gs` | Deterministic category templates, custom personalization insertion, preview, plain text, and HTML |
| `05_GmailService.gs` | Authorized-sender checks, MIME construction, drafts, RFC threading, quota counter, and attempt reconciliation lookup |
| `06_ReplyService.gs` | Exact-thread reply detection, own-message exclusion, opt-out/bounce/auto-reply handling |
| `07_OutreachService.gs` | Initial/follow-up orchestration, eligibility, idempotency, persistence, and configuration checks |
| `08_TriggersAndMenu.gs` | Sheet menu, owner/ID-verified trigger installation/removal, nonce-protected runtime kill switch, and exact pending-draft reset |
| `09_SelfTests.gs` | No-send deterministic checks |
| `10_WebApp.gs` | Owner-authenticated web endpoints, safe lead/import mutations, previews, manual jobs, and emergency disable |
| `web/src` | React operator experience and local no-write mock preview |
| `appsscript/Index.html` | Generated self-contained Apps Script HTML client |

`dist/BrandOutreach.gs` combines the modules for convenient copy/paste. Use either the combined file or the modular files, never both. `npm run build` also produces the single-file React client at `appsscript/Index.html`.

## Private console boundary

The web client calls Apps Script through `google.script.run`; it never receives OAuth credentials and cannot directly query Gmail or Sheets. Deployments must execute as the accessing user, allow only the owner, and match the explicit `CONFIG.UI.ALLOWED_EMAILS` server allowlist. Every API method repeats that allowlist check. State-changing calls reuse the shared script lock and the existing status/duplicate/suppression services. Programmatic edits reproduce the important `onEdit` protections because simple triggers do not fire for script-written cells.

The console exposes no control that edits `SENDS_ENABLED`, `DRY_RUN`, or `TEST_MODE`; changing execution mode still requires a deliberate source-code review. Live and redirected-test jobs require a typed phrase before the server invokes a worker. Import and approval remain separate actions, and neither action sends email.

## Spreadsheet schema

### Visible `Leads` columns

| Column | Purpose / rule |
|---|---|
| Company | Required for sending |
| Contact Name | Optional; falls back to `[Company] team` |
| Email | Exactly one syntactically valid address; trim + lowercase is used for comparisons |
| Category | Selects deterministic category copy; custom values fall back to the general template |
| Website | Operator research reference; not sent automatically |
| Personalization | Optional operator-written phrase/sentence, inserted once into the initial email |
| Status | Manual approval and lifecycle state |
| Initial Sent At | Written only after confirmed/reconciled initial send |
| Follow-up 1 Sent At | Written only after confirmed/reconciled first follow-up |
| Follow-up 2 Sent At | Written only after confirmed/reconciled second follow-up |
| Reply Status | `REPLY_DETECTED`, `OPTED_OUT`, `AUTO_REPLY`, `BOUNCE`, or manual value |
| Notes | Operator notes; never inserted into an email |
| Opt Out | Checkbox. `TRUE` immediately suppresses all sends |

### Hidden system columns

| Column | Why it exists |
|---|---|
| Lead ID | Immutable UUID used to re-find a row if the sheet is sorted |
| Normalized Email | Trimmed, lowercase comparison value |
| Sent To Email | Immutable production recipient used to prevent follow-up misdirection after an edit |
| Campaign ID | Identifies the configured campaign |
| Gmail Thread ID | Cached thread identifier; message IDs remain the durable anchors |
| Initial / Follow-up Message IDs | Exact Gmail anchors and duplicate evidence |
| Pending Action / Attempt ID / Draft ID / Recipient / Since | Two-phase send guard and recovery evidence. Pending Recipient freezes the exact destination used by the attempt so reconciliation does not trust a later Email edit |
| Last Response Message ID | Prevents the same auto-reply, bounce, or manual outbound message from being processed repeatedly while later human replies can still be detected |
| Last Reply At / Last Reply Check At | Reply audit timestamps |
| Last Error | Concise operator-facing diagnostic |
| Updated At | Last system update timestamp |

### `Outreach Log` columns

`Timestamp`, `Company`, `Email`, `Action`, `Result`, `Message/Error`.

The log never stores an email body or reply body. User-controlled log values are neutralized against spreadsheet formula injection and truncated. Successful initial-send and opt-out / do-not-contact / not-interested entries are durable suppression evidence consulted before later initials. Operators must never clear, delete, replace, or casually edit this sheet; restore a damaged log from a known-good copy before sending resumes.

## Status transitions

| From | To | Who / cause |
|---|---|---|
| `NEW` | `APPROVED` | Operator only |
| `APPROVED` | `SENT` | Confirmed initial send |
| `SENT` | `FOLLOW_UP_1` | Confirmed Day-4 follow-up |
| `FOLLOW_UP_1` | `FOLLOW_UP_2` | Confirmed Day-9 follow-up, with minimum post-F1 gap |
| Any active outreach stage | `REPLIED` | External human reply in the anchored thread |
| `REPLIED` | `INTERESTED`, `MEETING`, `NEGOTIATING`, `CLOSED`, `NOT_INTERESTED` | Operator qualification |
| Any stage | `DO_NOT_CONTACT` | Opt Out checkbox or explicit opt-out reply |
| Any sendable stage | `REVIEW_REQUIRED` | Ambiguous delivery, changed recipient, missing anchor, bounce, auto-reply, or inconsistent state |

Only the exact raw value `APPROVED` is eligible for an initial email; normalized variants such as `approved` are refused. Follow-ups likewise require the exact machine-managed prior stage. The system never sends a third follow-up.

## Follow-up logic

- Follow-up 1 is due when `FIRST_AFTER_DAYS_FROM_INITIAL` local calendar days have elapsed from `Initial Sent At` (default Day 4).
- Follow-up 2 is due when `SECOND_AFTER_DAYS_FROM_INITIAL` local calendar days have elapsed from the initial message (default Day 9).
- Follow-up 2 also waits until `SECOND_MIN_DAYS_AFTER_FIRST` local calendar days have elapsed from follow-up 1 (default 3). This avoids two messages arriving close together when follow-up 1 ran late.
- Calendar dates are computed in `CONFIG.TIME_ZONE`. For example, a message sent late on 1 January reaches Day 4 on the local date 5 January; the rule is not a rolling 96-hour timer.
- A follow-up is refused when the current Email differs from immutable `Sent To Email`, required prior timestamp/message ID is missing, the thread cannot be anchored, a pending action exists, the row is opted out, or status is not the exact expected prior stage.
- Immediately before every live follow-up, the exact Gmail thread is scanned again for an external response. After the draft itself is validated, the row is re-read one final time before Gmail receives the send call.
- Google requires the current thread ID, matching subject, and valid `In-Reply-To`/`References` headers for an API message to join a thread. V1 sets all three and fails closed if the anchor is missing.

## Reply and opt-out detection

Reply detection starts from `Initial Message ID`, resolves its current thread, and examines later messages without modifying read/unread state.

- Messages from the Gmail account, any accepted Send-As identity, or a configured internal CC address are ignored as internal activity. This prevents an Ashish/Gaurav reply-all from being classified as a brand reply.
- Known system messages are verified against campaign, lead, action, sender, exact TO, the exact configured CC set, and empty BCC. An unknown message carrying Gmail's `SENT` label is treated as manual outbound activity and pauses automation.
- A later external human message sets Reply Status to `REPLY_DETECTED` and Status to `REPLIED`.
- Strong opt-out phrases are checked only in the top, unquoted portion of a human reply. This prevents the original outreach footer—quoted in a reply—from creating a false opt-out. A match sets `Opt Out=TRUE` and `DO_NOT_CONTACT`.
- Likely delivery failures use sender/subject/content-type signals. Likely automated replies use standard headers and conservative subject signals. Both pause automation with `REVIEW_REQUIRED` rather than pretending they are genuine commercial replies.
- `REPLIED`, `INTERESTED`, `MEETING`, `NEGOTIATING`, `CLOSED`, and `NOT_INTERESTED` rows remain eligible for rotating opt-out monitoring. The first already-recorded human reply remains the normal detector result, so later non-opt-out messages do not regress an operator-assigned commercial status; a later explicit opt-out still wins.

The email footer asks the recipient to reply “opt out”. This keeps the request in the detectable conversation. An operator must also set `Opt Out=TRUE` for an opt-out received by phone, another inbox, or a new unrelated email conversation.

In `DRY_RUN`, reply checks are planning-only: they do not authorize or read Gmail and do not change any lead field. They may append a minimal `CHECK_REPLY / DRY_RUN` audit record so the operator can see which rows would be considered, including rotating later-opt-out monitoring.

## Execution modes

| Mode | Gmail behavior | Lead behavior |
|---|---|---|
| `DRY_RUN` | No Gmail read, draft, or send, including reply checks | Eligibility only; no lead fields change. Minimal dry-run log entries may be appended |
| Redirected `TEST_MODE` | Lead-facing TO goes to the owned `TEST_RECIPIENT`; configured internal CC recipients still receive the test copy. Test TO must differ from the lead and every CC | Production lead lifecycle is unchanged; scheduled trigger installation is refused |
| `LIVE` | Initials/follow-ups and exact-thread reply reads are permitted subject to every guard | Confirmed actions update timestamps, Gmail anchors, status, reply state, and audit log |

## Gmail / Apps Script limitations

1. Gmail and Sheets do not offer one atomic transaction. A send can succeed while the sheet write fails. V1 writes a unique pending attempt and custom MIME attempt header first, then reconciles a matching sent message where possible. If it cannot prove the outcome, it sets `REVIEW_REQUIRED` and never retries automatically.
2. A reply is detectable only if it reaches the authorized Gmail mailbox and remains in the anchored conversation. Replies routed to an unrelated Reply-To mailbox, replies composed as a new conversation, or deleted messages can be missed.
3. Automated-response headers are not perfectly standardized. V1 pauses on likely auto-replies/bounces for human review.
4. A reply can arrive in the milliseconds between the final check and a follow-up send. Gmail exposes no atomic “check then send” operation.
5. Syntax validation cannot prove a mailbox exists. Bounces remain possible.
6. Apps Script time triggers run within an approximate time window, not at an exact minute.
7. Gmail and Apps Script quotas vary by account and can change. `DAILY_SEND_LIMIT` counts message attempts; the Gmail guard counts one TO plus every CC as recipient units and retains a configurable reserve. With the supplied CC list, each message requires three recipient units.
8. Script locks prevent overlapping script executions, not a human editing the sheet. Stable Lead IDs and the final post-draft Sheet check reduce that risk; the last unavoidable race is the single Gmail send call itself. Avoid editing live rows during a send run.
9. Installable triggers are scoped to the Google account that creates them. V1 records exactly one automation-owner Gmail account plus the exact unique ID→handler map for the current three wrapper triggers. Every worker validates that generation inside the shared lock; direct-worker and menu-proxy time triggers, plus queued executions from a deleted generation, are refused. Any collaborator can activate the shared emergency kill switch, but only the recorded owner may install or re-enable automation; disabling does not erase the owner record.
10. Emergency Disable writes a new nonce, sets the compatibility kill-switch flag, and revokes the authorized trigger map. An install/re-enable acknowledges only the nonce it saw when its locked transaction began, so a newer concurrent emergency request remains authoritative. Manual-only re-enable revokes IDs, removes and verifies the owner's remaining wrapper/legacy worker/menu outreach triggers, and leaves the map empty before clearing the switch.
11. `CAMPAIGN_SEND_CUTOFF_ISO` may be blank only for setup/dry-run because the event year was not supplied. Actual sends require it; the local date check runs at job start and immediately before every Gmail send, blocking all new initial and follow-up sends after that date.
12. The CC list is validated as part of every MIME draft, sent-message anchor, and recovery check. Changing `SENDER.CC_EMAILS` after outreach begins intentionally makes older anchors fail closed; use a new campaign Sheet or manually review the affected rows.

## Duplicate prevention

Before an initial send, V1 checks:

- raw cell value exactly equal to `APPROVED` (no trimming/case-folding for authorization);
- lead Email is not one of the configured internal CC addresses;
- no initial timestamp, initial message ID, or immutable sent-to address;
- no pending/uncertain action;
- no other row with the same trimmed/lowercase email and send/suppression evidence;
- no prior successful initial-send or opt-out / do-not-contact / not-interested record in `Outreach Log`;
- no same-email candidate already claimed earlier in the current locked run.

Email normalization intentionally does not remove Gmail dots or `+tags`; those transformations are provider-specific. If state is ambiguous, the system misses a send rather than risk a duplicate.

## Testing strategy

1. Run the 33 deterministic self-tests; they touch neither Gmail nor lead data.
2. Preview several categories with and without Personalization.
3. Keep `DRY_RUN=true`; exercise eligibility, duplicates, invalid emails, limits, statuses, and follow-up calendar dates. Confirm only minimal audit-log entries change; `Check Replies` must make no Gmail read and no lead change.
4. Set `TEST_RECIPIENT` to the executing mailbox’s primary address or an accepted Send-As identity, then use `DRY_RUN=false`, `TEST_MODE=true`, `SENDS_ENABLED=true` for manual redirected tests. The TO is redirected, both fixed internal CCs still receive the test, and production lead state does not advance.
5. Test true threading/replies in a copy of the sheet with a recipient mailbox you control and `TEST_MODE=false`. Redirected test messages intentionally do not attach to a production lead’s thread.
6. Install triggers while still in dry-run mode and inspect Apps Script Executions.
7. Begin live operation with daily/per-run limit 1, inspect Sent mail, sheet IDs/timestamps, and logs, then raise conservatively.

All development checks supplied with this package are local deterministic checks. Live Google authorization, Sheet UX, Gmail delivery, threading, aliases, replies, quotas, and triggers must be verified by the operator using controlled accounts before production outreach.

## Official technical references

- [Advanced Gmail service for Apps Script](https://developers.google.com/apps-script/advanced/gmail)
- [Gmail API thread requirements](https://developers.google.com/workspace/gmail/api/guides/threads)
- [Gmail draft creation and sending](https://developers.google.com/workspace/gmail/api/guides/drafts)
- [Apps Script service quotas](https://developers.google.com/apps-script/guides/services/quotas)
- [Installable trigger restrictions](https://developers.google.com/apps-script/guides/triggers/installable#restrictions)
