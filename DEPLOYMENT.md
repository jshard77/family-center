# API proxy migration

Baseline: jshard77/family-center main, aa666b7.

Worker deployed October 29, 2026, version 581bebe5-9ceb-49f4-bee2-8ee406ddcbff.
Live ping, browser-origin CORS, preflight, and webGetCategories RPC passed.

The PWA now uses https://api.mapleview.xyz regardless of old device-local URL settings.
All existing google.script.run calls and GET RPC arguments are preserved. No grocery,
meal, chore, calendar, recipe, or Kroger business logic has changed in this increment.

## Deploy in this order

1. Obtain the current Apps Script /exec URL from a working device or deployment.
2. In worker/, run npm install, then npx wrangler login using the account that owns mapleview.xyz.
3. Run npx wrangler secret put APPS_SCRIPT_URL and paste the /exec URL.
4. Run npm test, then npm run deploy. The configured Custom Domain creates the API
   hostname and certificate. If api.mapleview.xyz already has a DNS record, inspect
   its purpose before changing it.
5. Verify https://api.mapleview.xyz/?api=ping returns success:true. Test from the
   family.mapleview.xyz browser origin, including OPTIONS and an existing read RPC.
6. Only after the Worker is working, publish the changed index.html to GitHub Pages.
7. Check groceries, meals, chores, calendar, recipe import, Kroger matching, and
   Shopping Mode on desktop and the family devices that previously failed.
   Use a disposable test item to verify writes without repeating a timed-out write.

Rollback: restore index.html from aa666b7; its existing device-local settings are
retained. The proxy need not be removed. The service worker currently caches no files.

The origin check is browser CORS control, not authentication. Existing backend
authorization remains responsible for access control. No request data is logged.

## Next increment: shared UPC aliases

The current repository has no Apps Script source. Obtain the current source and
spreadsheet schema before changing persistent product matching. Implement the
lookup in this order: weekly list, master UPC/alias data, Kroger, manual entry.
Store aliases against stable master item/variant IDs, with locking for concurrent
writes and UPC values as text to retain zeros. Reuse the existing master item when
adding to a weekly list. Save an alias after a confirmed successful match/add,
including manual products; do not require a Kroger product ID. Keep stale scan
responses from overwriting a newer scan. Test UPC-A/EAN variants, off-list known
items, manual products, duplicate scans, and two devices sharing an alias.
