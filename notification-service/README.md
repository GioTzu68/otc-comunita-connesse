# Detailed Telegram visit notifications

Deploy the server **before merging the frontend changes into main**. GitHub Pages serves static files and does not run this service.

On the owner's Mac, with the existing `menestrello-vps` SSH alias configured, run from this checkout:

```sh
bash scripts/deploy-notifications.sh
```

This copies the two Python modules to the existing server, identifies its systemd service, saves a backup, restarts it, checks local health, and restores the previous version if the restart or health check fails. Bot token and recipient continue to come from the private PVP configuration; no credentials are copied into this repository. Existing contact relay behavior is preserved.

After success, merge the pull request and wait for GitHub Pages publication. Open the public page, select **Autorizza dettagli e ritorni**, and confirm one Telegram message with browser code, device, browser, OS and first visit. Open a service and manually play an announcement: the same message should update after about 25 seconds. A new session in the same browser should show a return visit. Revoking permission under the footer's preference button clears the browser profile and removes optional details from the current Telegram message. Earlier Telegram messages remain in the owner's chat.

## Collected data

Without optional permission: entry time and entry section only. With permission: a random browser identifier, locally counted visits, coarse device/browser/OS, approved section/service IDs, approved interaction categories, and approximate visible time. No form contents, names, raw user agent or IP addresses are sent to Telegram. Recognition expires 90 days after the last visit and does not identify a person or a specific computer. Another browser/private window, cleared storage or a new browser profile may produce a different code. Multiple tabs may count as separate sessions.

Server message metadata and summaries expire after 24 hours on the next request. Telegram messages persist in the recipient chat. Existing daily hashed-address rate limits remain in place. Activity updates use a random secret held only in session storage, update the original message, and are limited to one edit per 20 seconds. Revocation bypasses the edit interval. The client normally submits every 25 seconds at most; last updates may be lost when a browser closes abruptly. “Active time” is an approximation while the page is visible, not proof of attention. Manual listening is distinguished from automatic audio.

## Checks

```sh
python3 tests/test_visits.py
node tests/test_frontend.cjs
node --check visit.js
node --check demo-voice.js
```

## Aruba migration

The notification and contact endpoint is `https://otc-notify.77.81.229.206.sslip.io`. The existing `menestrello-vps` SSH alias points to the Aruba server. For a new server with the existing private PVP configuration, use `scripts/install-notifications-aruba.sh`; for subsequent code updates, use `scripts/deploy-notifications.sh`. Diagnose connectivity and Telegram configuration with `scripts/check-notifications.sh`.
