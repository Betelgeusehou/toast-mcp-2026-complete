# Changelog

Check your deployed version at `https://<your-domain>/health`.

## 1.2.0 (2026-09-01)

Every fix below was found by testing against live production restaurants and is
verified by the new validation gauntlet (`npm run validate:live`), which now
passes 12/12 against a real account.

- **Item sales report rebuilt.** It previously collapsed every selection into a
  single arbitrary bucket (grouping on a field Toast never populates), reported
  discount-net prices as gross, and subtracted discounts twice. It now groups on
  the menu item reference, sums preDiscountPrice as gross, and reports price as
  net. Real per-item results for the first time.
- **Discount report counts item-level comps.** Loyalty rewards and single-item
  discounts live on the selection, not the check, and were invisible. The report
  now reconciles to manager logs to the cent, and no longer emits literal
  "undefined" discount ids.
- **Sales summary counts item-level comps** the same way, so discountAmount and
  grossSales agree with the discount report and with Toast Web.
- **Schema fix for every optional numeric parameter.** Optional numbers were
  advertised as strings and then rejected ("Expected number, received string"),
  making those parameters unreachable. The advertised schema now matches
  validation, and numeric strings from older clients are coerced.
- **Pagination is concurrent and capped.** Order-scanning tools fetch pages in
  batches of 4 with a 60-page safety cap, ending multi-minute hangs on
  customer search, loyalty, and top-customer tools. Scan windows tightened.
- **Validation gauntlet added** (`scripts/validate-live.mjs`): schema sweep of
  every read tool plus arithmetic invariants (hourly sums to the day, gross
  minus discounts equals net, discount report equals summary, item gross >= net).

## 1.1.1 (2026-08-30)

- Per-call `restaurantGuid` override fixed (auth interceptor no longer stomps
  the Toast-Restaurant-External-ID header). Multi-location queries work.
- Named locations: set `TOAST_LOCATIONS` to {"Name": "guid", ...} and every
  tool accepts location names; adds `toast_get_locations`.

## 1.1.0 (2026-08-30)

- Remote mode: streamable HTTP transport with shared-secret auth for use as a
  claude.ai custom connector. Write tools disabled by default; three-lock
  safety (env flag, dry-run default, per-call confirm_write) when enabled.

## 1.0.x (2026-08-28)

- Fixed the authentication response parsing that prevented the original
  project from ever completing a live API call, plus list endpoints
  (ordersBulk), restaurant scoping headers, the labor report, and type errors.
