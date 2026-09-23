> Historical/pre-hardening document. Read ../ARCHITECTURE.md and ../PROJECT_STATUS.json for current status; procedures and release claims below require revalidation.

# Browser companion checkpoint

The companion shares chat, page capture, and native messaging code. It does not contain its own AI model or API key. Private AI on the same Windows PC performs processing. The updated desktop source must be built and installed before Firefox can connect; the old 2.1.7 installer lacks the Firefox host registration.

## Installation after building the updated desktop app

1. Open Private AI, then Settings → Browser Companion → Set up browser companion. This registers the exact companion IDs for Chrome, Edge, and Firefox in your current Windows user's native-messaging settings and opens the extension folder. Keep the desktop app open during testing.
2. **Chrome / Edge:** open `chrome://extensions` or `edge://extensions`, enable Developer mode, choose Load unpacked, and select `chrome_extension` (the folder containing its manifest.json). Pin the companion and click its toolbar icon to open the side panel.
3. **Firefox:** open `about:debugging#/runtime/this-firefox`, choose Load Temporary Add-on, and select `chrome_extension/firefox/manifest.json`. Use its toolbar icon or Alt+Shift+A to open the sidebar. Temporary installation ends when Firefox restarts. Normal permanent distribution requires Mozilla signing; this checkpoint is unsigned, not an installable signed XPI. Review Mozilla's current submission and data-consent requirements before signing.
4. Ask a question. Check Include page only when you want to read the current webpage. Click the toolbar icon on that tab first to grant temporary page access. Browser settings, extension-store pages, and some PDF viewers cannot be captured.

**Brave:** the Chromium package is a compatibility candidate; try its Load unpacked workflow. Brave has not been tested here. Other Chromium browsers may differ in side-panel support and native-host discovery. Safari and mobile browsers are outside this small compatibility change.

Disconnect browser companions in Settings to remove the Chrome, Edge, and Firefox native-host registrations. Close open companion panels as well to end existing connections. Re-run setup if the desktop executable moves (including moving a portable copy).

## Build and validation

Run `node build/prepare-browser-assets.cjs` after changing shared extension code. It refreshes the Firefox copy and records source-change time in source/build-info.json. The same preparation runs before Electron packaging and through npm start's prestart hook. The sidebar's Last updated label displays that stored date in the PC's local time; opening the app does not change it. An unchanged source digest preserves the timestamp.

The Chromium public key remains unchanged, preserving the existing extension ID. Firefox uses companion@privateai.local and its own allowed_extensions native manifest. No wildcard extension authorization or automatic webpage-reading permission was added.

Automated checks cover native identity rejection, both manifest contracts, Firefox sidebar gestures, and explicit-only capture. Firefox is not installed in this test environment, so actual Firefox sidebar/native-host integration is still unverified. Do not treat simulated API tests as live browser acceptance.

References: [Mozilla native messaging](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Native_messaging), [Firefox temporary installation](https://www.extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/), [Mozilla signing](https://www.extensionworkshop.com/documentation/publish/signing-and-distribution-overview/), [Edge native messaging](https://learn.microsoft.com/en-us/microsoft-edge/extensions/developer-guide/native-messaging).

