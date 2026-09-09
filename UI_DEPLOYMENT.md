# Private React console — build and deployment

The console is hosted by the existing Apps Script project, so it adds no hosting bill and can call the Sheet/Gmail server functions without exposing tokens or creating a second backend.

## Build

1. Install the pinned local build dependencies with `npm install`.
2. Run `npm run check`.
3. Confirm the command reports all 33 outreach tests plus the web-server checks.
4. `dist/BrandOutreach.gs` and `appsscript/Index.html` are generated artifacts. Do not edit them directly.

For a local visual preview, run `npm run preview` after the build and open `http://127.0.0.1:4173`. The standalone preview displays a prominent mock-data banner. Its server calls are simulated; it cannot access Google or send email.

## Install into Apps Script

1. Replace `Code.gs` with `dist/BrandOutreach.gs`.
2. Add an Apps Script HTML file named exactly `Index`; replace it with `appsscript/Index.html`.
3. Replace the visible manifest with `appsscript.json`.
4. Confirm `CONFIG.UI.ALLOWED_EMAILS` contains only the intended Google account.
5. Save the project and run `runSelfTests` from the editor. This sends no email.

### Maintainer deployment with clasp

The repository is preconfigured for the existing Apps Script project in `.clasp.json`. The generated `gas/` directory contains the only three files uploaded by clasp.

1. Run `npx clasp login` once and complete Google's sign-in in your browser.
2. If Google reports the Apps Script API is disabled, enable it at `https://script.google.com/home/usersettings` and retry.
3. Run `npm run gas:status` and confirm only `Code.gs`, `Index.html`, and `appsscript.json` are listed.
4. Run `npm run gas:push`. This rebuilds and tests before uploading.
5. Run `npm run gas:deploy` to create the web-app deployment, or update the existing deployment from the Apps Script deployment screen.

Never commit `.clasprc.json` or any OAuth token. It is ignored by Git.

## Deploy privately

1. Choose **Deploy → New deployment**.
2. Select **Web app**.
3. Description: `Private operator console V1`.
4. Execute as: **User accessing the web app**.
5. Who has access: **Only myself**.
6. Deploy and complete the Google authorization flow while signed into the allowlisted account.
7. Open the deployment URL. The header must show the allowlisted Google account and the expected safety mode.

The manifest includes `userinfo.email` because the server-side allowlist deliberately verifies `Session.getActiveUser().getEmail()` on every console call.

Do not choose public/anonymous access. `doGet` and every callable method reject accounts outside the server allowlist, but deployment access is an additional required boundary.

## Safe acceptance test

With `SENDS_ENABLED=false`, `DRY_RUN=true`, `TEST_MODE=true`, and no triggers:

1. Confirm the banner reads `DRY RUN — DELIVERY LOCKED`.
2. Confirm daily usage is `0` and trigger count is `0`.
3. Import one controlled test email. Verify it appears as `NEW`.
4. Edit Company/Category and save. Verify no send timestamp appears.
5. Preview it. Confirm TO, both fixed CC addresses, subject, body, signature, and opt-out copy.
6. Approve it. Confirm status changes to `APPROVED` and no email is sent.
7. Run **Check approved leads**. Confirm the result reports a dry-run candidate and live sent `0`.
8. Check `Outreach Log` and Gmail Sent.

## Updating a deployment

After changing source, rerun `npm run check`, replace both generated Apps Script files, save, and create a new deployment version from **Deploy → Manage deployments → Edit**. Existing URLs can keep pointing at the updated version.

## Immediate disable

Use **Emergency disable** in the console or **Brand Outreach → Disable Automation (Emergency)** in Sheets. Then set `SENDS_ENABLED=false` in CONFIG and verify the Apps Script Triggers page contains no outreach triggers.
