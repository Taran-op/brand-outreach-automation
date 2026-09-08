# Testing matrix and go-live checklist

The included self-tests and development verification are local and deterministic only. They do not prove live Google authorization, Gmail delivery, threading, aliases, replies, quotas, trigger behavior, or Sheet UI behavior. No real email was sent during development; complete the controlled-account tests below before production use.

## Test matrix

| ID | Setup / action | Expected result |
|---|---|---|
| S1 | Run Setup Sheet twice on an empty workbook | One `Leads` and one `Outreach Log`; headers, filters, validation, formatting, hidden system columns; no data loss |
| P1 | Select a valid synthetic row and Preview | TO, exact configured CC set, stage, subject, and body appear; zero Gmail calls and zero row/log lifecycle changes |
| P2 | Preview blank Personalization | Natural category message; no awkward empty line/sentence |
| P3 | Preview populated Personalization | Text appears once in the initial body and is safely HTML-escaped |
| E1 | `NEW` valid lead; run initial worker | Skipped; no Gmail call or timestamp |
| E1B | Raw Status is `approved`, ` APPROVED `, or another non-literal variant | Refused; only the exact dropdown value `APPROVED` authorizes an initial |
| E2 | `APPROVED` with blank/invalid/multiple addresses | Refused and logged; in live mode row becomes `REVIEW_REQUIRED` |
| E3 | `APPROVED`, valid, `DRY_RUN=true` | `DRY_RUN` log; no draft, send, status, timestamp, message ID, or pending metadata change |
| E3R | Active rows; run Check Replies with `DRY_RUN=true` | No Gmail authorization/read and no lead mutation; at most minimal `CHECK_REPLY / DRY_RUN` log entries |
| E4 | `TEST_RECIPIENT` is the executing mailbox primary/accepted Send-As identity; redirected test mode | TO is the owned test address; Ashish and Gaurav remain CC; intended lead appears only in banner/log; lead state unchanged |
| E4B | Redirected test mode with an external/unaccepted `TEST_RECIPIENT` | Configuration validation refuses the run; no draft or send |
| E4C | Synthetic lead Email equals `TEST_RECIPIENT` | Redirected test send is refused; choose a different intended test-lead address |
| E4D | `TEST_RECIPIENT` or lead Email overlaps a configured internal CC | Send is refused; TO and internal CC roles must remain distinct |
| E5 | Controlled real-mode address, cap 1 | Exactly one initial; timestamp, immutable recipient, message ID, thread ID, and `SENT` recorded |
| E6 | Re-run E5, including after manually setting Status back to `APPROVED` | No second initial |
| E7 | Two approved rows use case/whitespace variants of one email | At most the first eligible row sends; other is suppressed/logged |
| E8 | One row errors in a multi-row batch | Error logged; later rows continue unless a global limit/runtime threshold is reached |
| L1 | Daily cap 2; four eligible rows; run multiple times | No more than two actual sends across initials/follow-ups/tests for the local date |
| L2 | Gmail remaining-recipient quota near reserve | Batch reserves three recipient units per message and stops before crossing configured reserve |
| L3 | Gmail accepts or may accept an attempt but its response/persistence fails | Reserved attempt still consumes the conservative day/run slot; worker cannot exceed the configured per-run cap |
| F1 | `SENT`; fewer than 4 local calendar dates elapsed in `CONFIG.TIME_ZONE` | No follow-up |
| F2 | `SENT`; local calendar Day 4 reached | Follow-up 1 sent once in anchored thread; `FOLLOW_UP_1` + timestamp/message ID |
| F3 | Re-run F2 | No duplicate follow-up 1 |
| F4 | `FOLLOW_UP_1`; local calendar Day 9 reached and at least the configured local-calendar F1→F2 gap elapsed | Follow-up 2 sent once; `FOLLOW_UP_2` + timestamp/message ID |
| F4B | Day 9 reached but the minimum local-calendar F1→F2 gap has not elapsed | No follow-up 2 |
| F5 | `FOLLOW_UP_2`; run repeatedly | No third automated follow-up |
| F6 | Any terminal/stop status | No follow-up |
| F7 | Active row with `Opt Out=TRUE` | No send; live processing normalizes to `DO_NOT_CONTACT` |
| F8 | Email differs from `Sent To Email` | No send; row paused for review |
| F9 | Prior message/thread ID missing or invalid | No unrelated email; row paused for review |
| R1 | External controlled mailbox replies in-thread | `REPLY_DETECTED`, `REPLIED`; future follow-ups stop |
| R2 | Thread contains only our outbound messages | Not classified as a reply |
| R2C | Ashish or Gaurav replies-all in the thread | Ignored as internal CC activity; brand Reply Status is unchanged |
| R2B | Operator manually sends another message in the automated thread | `MANUAL_REVIEW`, `REVIEW_REQUIRED`; scheduled follow-ups pause |
| R3 | Reply arrives before due follow-up but scheduled reply check has not run | Immediate pre-send reply scan suppresses follow-up |
| R4 | Human reply top text says “unsubscribe” or “opt out” | `Opt Out=TRUE`, `OPTED_OUT`, `DO_NOT_CONTACT` |
| R5 | Human reply quotes the original opt-out footer but top says “send details” | Genuine reply, not false opt-out |
| R5B | Localized/unknown quote delimiter retains the exact outreach footer | Deterministic footer marker is excluded; quoted “opt out” does not create suppression |
| R6 | Delivery failure / clear auto-reply | `BOUNCE` / `AUTO_REPLY`, row paused as `REVIEW_REQUIRED` |
| R7 | Human later replies after an auto-reply/manual-outbound pause | Later human message is detected and row becomes `REPLIED` |
| R8 | Lead is `INTERESTED`/`MEETING`/later status, then sends a same-thread explicit opt-out | Later opt-out becomes `DO_NOT_CONTACT`; later non-opt-out mail does not move the commercial status backwards |
| C1 | Launch two workers together | One gets the script lock; other exits without a duplicate |
| X1 | Activate Emergency Disable while a draft is pending | Kill switch prevents send; draft remains and row fails closed |
| A1 | Simulate missing post-send sheet update with pending attempt | Matching custom attempt header is reconciled, or row becomes `REVIEW_REQUIRED`; never blind retry |
| A2 | Change visible Email while an attempt is pending | Recovery validates against hidden `Pending Recipient`; it never attributes the attempt to the edited address |
| A3 | Copy/change a pending Draft ID, action, attempt, recipient, or thread; run Reset Selected Pending Draft | Reset refuses; it never deletes a draft without the complete exact tuple and never makes a terminal row sendable |
| T1 | Install automation twice | Exactly three current wrapper triggers, one per wrapper; exactly three authorized trigger IDs; no recognized legacy direct-worker or menu-proxy trigger |
| T2 | Recorded owner disables automation | Shared runtime kill switch on; authorized trigger map empty; owner’s recognized wrapper/legacy worker/menu triggers deleted; owner record retained; workers cannot send |
| T3 | Collaborator uses Emergency Disable | Shared kill switch stops all accounts; only collaborator-owned known triggers can be deleted; owner remains recorded |
| T4 | Collaborator tries Install/Re-enable or Re-enable Manual Runs | Refused because the Gmail account is not the recorded automation owner |
| T5 | Emergency Disable races an owner install/re-enable | Newer emergency nonce wins; system remains disabled and newly created triggers are removed where possible |
| T6 | A time trigger targets a worker or its `menu…` proxy directly | Entry point identifies the installable-trigger event and refuses it before Gmail/campaign work or a UI call |
| T7 | A valid old wrapper execution is dispatched, then Manual Runs Only revokes/deletes triggers and clears the kill switch | Queued worker sees an obsolete trigger ID inside the lock and remains blocked |
| T8 | A current wrapper executes under a mailbox other than the recorded owner | Runtime owner check skips it before non-dry Gmail/campaign work |
| LOG1 | Success, skip, reply, validation error | Six minimal log fields; no message/reply body; formula-like values neutralized |
| LOG2 | Prior initial success or opt-out/do-not-contact/not-interested exists only in `Outreach Log` | Same normalized address remains suppressed; log history is not cleared |

## Pre-enable checklist

- [ ] Event name, explicit date/year (if required), India location/venue wording, and organization are final.
- [ ] `CAMPAIGN_SEND_CUTOFF_ISO` is set to the approved final outreach date in `YYYY-MM-DD` form before any redirected or live send.
- [ ] Sender name, phone, business email, From, and Reply-To are correct.
- [ ] From and Reply-To pass **Validate Configuration** as identities in the authorized Gmail mailbox.
- [ ] `SENDER.BUSINESS_EMAIL`, From, and Reply-To are `taran@asaiverse.com`.
- [ ] `SENDER.CC_EMAILS` contains exactly `ashish@asaiverse.com` and `gaurav@asaiverse.com`, with no duplicates or overlap with From/Reply-To.
- [ ] Exactly one automation-owner Gmail account was designated and is documented for operators.
- [ ] Advanced Gmail service appears under Apps Script Services.
- [ ] Spreadsheet and Apps Script time zones are `Asia/Kolkata` (or the deliberately configured replacement).
- [ ] Every category and the general fallback were previewed.
- [ ] Personalization with blank, phrase, sentence, punctuation, ampersand, and angle brackets was previewed.
- [ ] Opt-out wording appears in initial and both follow-ups.
- [ ] No unsupported footfall, attendance, partner, or audience-size claims are present.
- [ ] Setup and all 33 safe self-tests pass.
- [ ] Dry-run cases for `NEW`, `APPROVED`, invalid email, duplicate email, Opt Out, and terminal statuses pass.
- [ ] `TEST_RECIPIENT` is the executing mailbox’s primary address or an accepted Send-As identity.
- [ ] Every synthetic lead used for redirected testing has an Email different from `TEST_RECIPIENT`.
- [ ] Redirected test messages used `TEST_RECIPIENT` as TO, included exactly Ashish and Gaurav as CC, had no BCC, and From/Reply-To/plain/HTML rendering were inspected.
- [ ] Dry-run Check Replies completed without Gmail access and without changing any lead field.
- [ ] Controlled two-mailbox test proved true same-thread follow-ups, reply detection, own-message exclusion, and opt-out detection.
- [ ] No disposable test row contains production timestamps or message IDs.
- [ ] `Outreach Log` and Apps Script Executions were reviewed.
- [ ] Daily and per-run caps are initially set to 1.
- [ ] Gmail quota reserve is non-zero.
- [ ] Trigger page shows exactly the three scheduled wrapper handlers, no direct-worker trigger, and **Show System Status** reports three authorized scheduled trigger IDs.
- [ ] Trigger installation and re-enable were performed only by the recorded owner account.
- [ ] Emergency Disable and a simulated concurrent re-enable were tested; every collaborator knows it activates a newer shared nonce, while trigger deletion is limited to the invoking account’s triggers.
- [ ] `Outreach Log` is intact, access-controlled, backed up, and understood to be suppression evidence that must never be cleared.
- [ ] The first live recipient has a valid single email and the literal dropdown value `APPROVED` (not a normalized/imported variant).
- [ ] `SENDS_ENABLED=true`, `DRY_RUN=false`, and `TEST_MODE=false` were set only after every item above passed.

## First-live-batch procedure

1. Keep all caps at 1.
2. Approve one controlled, thoroughly reviewed lead.
3. Run **Send Approved Leads** manually.
4. Inspect Gmail Sent: one correct lead TO, exactly Ashish and Gaurav in CC, no BCC, correct From/Reply-To, subject, body, and opt-out.
5. Inspect the row: `SENT`, timestamp, immutable recipient, initial message ID, thread ID, no pending action.
6. Inspect the log for one `INITIAL / SENT` entry.
7. Wait for or simulate the controlled reply/thread test before increasing limits.
8. Increase slowly, monitor bounces/complaints, and keep outreach relevant and human-reviewed.

## Emergency procedure

1. Use **Brand Outreach → Disable Automation (Emergency)**.
2. Verify Runtime kill switch is `ON` under **Show System Status**.
3. Have the recorded owner sign in and verify no recognized wrapper, legacy direct-worker, or menu-proxy outreach trigger remains in Apps Script → Triggers. A collaborator cannot see/delete another user’s installable triggers, although the shared kill switch has already neutralized them.
4. Use **Show System Status** and verify `Authorized scheduled trigger IDs: 0`.
5. Confirm **Show System Status** still names the recorded owner; disabling must not clear ownership.
6. Set `SENDS_ENABLED=false` in CONFIG for defense in depth.
7. Review Gmail Sent, `Outreach Log`, and Apps Script Executions to determine the last confirmed action. Do not clear or rewrite the log while investigating.
8. Do not clear an absent-draft pending guard—including `Pending Recipient`—unless Gmail proves the message was not sent.
9. Only the recorded owner may use either re-enable menu action after the incident is resolved. **Re-enable Manual Runs Only** revokes trigger IDs and deletes/verifies that owner’s remaining outreach triggers before it clears the switch; installing automation again is a separate confirmed action.
