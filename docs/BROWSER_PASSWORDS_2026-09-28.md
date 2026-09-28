# Browser compatibility and password-manager handoff

Base: `f0b6d88e274a77e38fb7ee67a686b5e1b81251b2` (merged PR #7). Branch: `chatgpt/browser-compatibility-2026-09-28`.

## Supported paths

| Browser | Existing report/agent workflow | Companion |
| --- | --- | --- |
| Chrome | Installed stable channel; synthetic end-to-end checks passed | Existing Chromium package, same extension ID |
| Edge | Installed stable channel; synthetic end-to-end checks passed | Existing Chromium package, same extension ID |
| Firefox | Matching Playwright-managed Firefox; synthetic checks passed | Ordinary Firefox uses the generated Firefox package; temporary installation or Mozilla signing still required |
| Chromium | Matching Playwright-managed Chromium; synthetic checks passed | Chromium package; native-host registration added |
| Brave / Vivaldi | Standard Windows executable discovery; separate profiles; not tested on installed browsers | Native-host registrations and a toolbar-popup fallback added; live acceptance pending |

This extends the existing reviewed report recipes and `/report NAME` path. It does not introduce an unrestricted web agent, reuse a personal browser profile, or add Safari/mobile support. There is no silent fallback when the selected browser is missing.

In **Browser reports**, choose the browser before saving. Saved cards show the choice; Edit and Sign in use that same choice. Legacy recipes and the existing `browser-profile` folder remain Edge. Other choices use their own `browser-profile-<id>` under the existing application data root. Switching engines closes the previous managed context and releases its resource reservation. Unattended interference remains blocked.

Chrome/Edge must already be installed. In the matching source checkout, `npm ci --ignore-scripts` followed by `npm run setup:browsers` installs optional Firefox/Chromium runtimes for the current Windows user. Repeat after Playwright upgrades; do not substitute stock Firefox in the automation executable path. The packaged app can use that matching default per-user Playwright cache; this change does not bundle these large optional runtimes in the installer. An administrator can set `PLAYWRIGHT_BROWSERS_PATH` to a provisioned location. The test downloads used an isolated workspace cache, not the user's everyday browser profiles.

Playwright documents its [supported engines](https://playwright.dev/docs/browsers) and requires a [separate automation profile](https://playwright.dev/docs/api/class-browsertype#browser-type-launch-persistent-context). Normal Firefox remains usable for the companion independently of the managed automation build.

## Bitwarden and browser-saved passwords

1. Choose a browser and HTTPS site, then **Open browser to sign in**. A complete download recipe is not required to open it. Manual setup allows browser/extension network access so you can install Bitwarden from the browser's official extension store inside this dedicated profile.
2. Unlock Bitwarden yourself and use its autofill menu or configured shortcut, normally **Ctrl+Shift+L** on Windows. The browser's own saved-password prompt can also fill a login. Complete any account selection, unlock or MFA in the browser. No credentials from a personal profile are copied.
3. Optionally enter a selector for a control that appears only after successful sign-in, such as the report menu. The new `login` step waits up to five minutes, then the report continues. It can use an already authenticated session or wait for the user-assisted sign-in. It does not invoke Bitwarden's vault API or automatically click its unlock/reveal controls.
4. Automated runs restore the reviewed HTTPS-origin filter before navigation. Add reviewed identity-provider or password-manager service origins if required by your setup. Test with your site's non-production account first. Browser extensions and their background network traffic remain controlled by browser/organization policy; the workflow filter is not a system-wide firewall.

See [Bitwarden autofill guidance](https://bitwarden.com/help/auto-fill-browser/). Its shortcuts and browser/enterprise behavior can vary. This change keeps installed Chromium extensions enabled and avoids Playwright's basic/mock password-store flags; Firefox's login saving/autofill preferences are enabled for its dedicated profile. It never imports a vault, captures the clipboard, exports cookies or returns a password value.

Password-like fill selectors are rejected before saving, and runtime password/OTP field metadata is checked before a `fill` action. Use ordinary fill steps only for non-secret report parameters. The companion excludes form fields, editable regions and Bitwarden overlay elements from both full-page and selected-text capture. Known hosted Bitwarden vaults and extension pages are blocked before extraction. These filters are not a general detector for secrets printed as ordinary webpage text or every self-hosted password-manager UI. There is no new password-reveal operation, even for a requested reveal; such a feature would require its own reviewed authorization path.

## Companion setup

After installing the rebuilt desktop app, use **Settings → Browser Companion → Set up browser companion**. Load `chrome_extension` in Chrome/Edge/compatible Chromium browsers. Ordinary Firefox uses `chrome_extension/firefox`; permanent distribution still requires Mozilla signing. Both package versions are generated from package.json, and Firefox's background script uses its supported classic-script declaration. Unsupported sidebar APIs fall back to a toolbar popup. Active-tab capture still requires an explicit user gesture and Include page selection; no all-site permissions or automatic capture were added.

## Verification and limits

- 380 regression tests passed on Windows/Node 24.19.0, including real encrypted SQLite, saved browser choice through desktop IPC, correct open/run forwarding and development HTTP denial.
- Hardening subset: 23 passed. Production dependency audit passed its high-severity gate but now reports two moderate findings through mailparser/nodemailer ([advisory](https://github.com/advisories/GHSA-6vj9-mwq6-2f5v)); unrelated dependency upgrades were not included. Local `check:release` remains blocked on the generated Windows helper/runtime executables.
- `npm run test:browsers` passed in Chrome, Edge, managed Firefox and Chromium: synthetic HTTPS attachment download, post-login readiness, protected full-page/selection capture, and browser choice save/edit/reload/use. The test page's password-value getter throws if read. It uses synthetic fixtures only, not a real Bitwarden vault.
- An initial synthetic blob fixture failed; it was replaced with a standard HTTP attachment. One initial Chrome launch failed; its diagnostic run and final four-browser run passed. No retry or fallback was added to application behavior.
- Companion API/identity/manifest and generation tests passed. Actual installed native messaging with the packaged executable and real Bitwarden unlock/autofill remain unverified. Brave and Vivaldi are compatibility candidates, not certified integrations.
- No dependency versions or lockfile changed. No installed user data, actual saved password or real vault was accessed. Packaged Windows install/upgrade, clinical validation and other previously recorded release acceptance remain pending.
