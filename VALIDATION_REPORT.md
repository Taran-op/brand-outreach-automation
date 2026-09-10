# Brand Outreach V1 validation report

Local deterministic validation was completed on 5 September 2026. On 6 September, `setupSheet`, the preview workflow, and the then 33-check suite were verified against a live Google Sheet. On 8 September, the same suite was re-run successfully from the Apps Script editor after making its result reporting safe in both editor and spreadsheet contexts. On 9 September, `.xlsx` workbook import was added, covered by tests, and exercised end to end in the local browser preview. Gmail sending has not been exercised at any point, no email was sent, and no automation trigger was installed.

## Automated checks

| Check | Result |
|---|---|
| Individual Apps Script module syntax | 11 of 11 passed |
| Combined source syntax | Passed |
| Paste-ready `dist/BrandOutreach.gs` syntax | Passed |
| Deterministic Apps Script self-tests | 43 passed, 0 failed |
| Web/server boundary checks | 24 passed |
| Emergency nonce race checks | 4 passed |
| Trigger-generation authorization/revocation checks | 3 passed |
| Direct worker/menu trigger refusal checks | 6 passed |
| Function-name collision scan | 209 functions, 0 duplicates |
| Manifest JSON parse | Passed |
| Manifest configuration | V8 runtime, 6 explicit OAuth scopes, Gmail API v1 enabled, web app `MYSELF` / `USER_ACCESSING` |
| Client bundle isolation | No remote script/CSS, no browser storage of lead data |
| Combined build comparison | Exact match to the mechanically constructed 11-module bundle |
| Clasp staging comparison | `gas/Code.gs` and `gas/Index.html` identical to the tested artifacts |

Combined source SHA-256: `19e585f6e5c53131a071a4cd90d0bf9e813822e2af65cf849060febf4e0494fe`

## Safety review

The final focused audit found no remaining P0/P1 blocker in the source. It specifically rechecked:

- literal `APPROVED`, `SENT`, and `FOLLOW_UP_1` authorization gates at each send stage;
- MIME output and final Gmail validation for one TO, exactly `ashish@asaiverse.com` plus `gaurav@asaiverse.com` in CC, and no BCC;
- three-recipient Gmail quota reservation and exclusion of internal CC replies from brand-reply detection;
- direct worker and menu-proxy trigger refusal;
- exact trigger UID-to-handler authorization inside worker locks;
- revocation of queued/old trigger generations during Emergency Disable and Manual Runs Only;
- retry, duplicate, pending-attempt, opt-out, terminal-status, owner, daily-cap, and final-draft controls.

## Workbook import review (9 September 2026)

`.xlsx` import parses the workbook in the browser and posts only the selected worksheet's cell values. The manifest gained no Drive scope, and Apps Script never receives or stores the file.

Verified by test:

- the owner allowlist is enforced before any import parsing, for both the workbook and paste paths;
- server-side re-validation of file extension, row count, column count, character budget, and cell type — a client-supplied column mapping is never trusted, and the layout is detected on the server;
- header-alias, header-less research-list, and plain-paste layout detection;
- email extraction from mixed cells, rejection of header-injection text and contact-page URLs, website normalization, category folding onto `CATEGORY_VALUES`, and duplicate keys by email or by company plus website;
- imported rows land as `NEW` with `Opt Out` false, and a research row with no email is refused by the unchanged initial-approval gate.

Verified by hand in the local mock preview: worksheet picker, row-count estimate, sample rows, and drop-zone rendering against a two-worksheet workbook. The preview performs no writes.

## Shipping state

The checked-in CONFIG is the AsaiVerse 2027 manual-live profile, not the earlier locked dry-run profile: `SENDS_ENABLED=true`, `DRY_RUN=false`, `TEST_MODE=false`, `DAILY_SEND_LIMIT=1`, and `CAMPAIGN_SEND_CUTOFF_ISO=2027-01-31`. Sender addresses and the fixed internal CC list are populated; `EVENT.ORGANIZATION` and `SENDER.PHONE` are still blank, which raises configuration warnings rather than errors.

Delivery therefore depends entirely on the runtime gates, not on the mode flags. A message still requires an explicitly `APPROVED` lead, a typed live confirmation phrase, Google authorization, and a Gmail mailbox that accepts `taran@asaiverse.com` as a verified Send-As identity. Deployment installs no scheduled trigger, so nothing sends on its own.

Import cannot send. Every imported row lands as `NEW` with `Opt Out` false, and approval remains a separate deliberate action.

## Controlled Gmail checks still required

Before production use, complete the Gmail stages in `TESTING_AND_GO_LIVE.md` using mailboxes you control. Current checks do not prove Gmail rendering/delivery, Send-As behavior, true threading, reply classification, account quotas, or installable-trigger timing.

Import has not been re-verified against a live Google Sheet since the workbook path was added; step 4 of the safe acceptance test in `UI_DEPLOYMENT.md` covers that.
