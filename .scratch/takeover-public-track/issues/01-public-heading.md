Status: ready-for-agent

# Public tracking still says "Returning to sender" after support takes the goods

Found 28 Nov 2026 by the merge review of d03b1695 into the design branch.

The public track response (`server/main.ts`, around the `supportHasGoods` check in the share endpoint) now drops
the driver and the live position after a takeover, but carries only `status: returning`, so the page heading
(`src/app/track/[token].tsx`) still reads "Returning to sender", or "Returning to the shop" for a shop order.

Wanted: include `driverTrackingEnded: true` in that response (as the signed-in order does); the app's shared status
formatter then reads "With support" with no client change beyond passing the field through. Extend the share check in
`tests/route.test.mjs` to cover the flag before and after the takeover.

Also for the server: `server/domain/shop.ts` still sends the shop its return code for any `returning` shop order, so
`src/app/merchant/order/[id].tsx` shows a dead code after a takeover.

## Owner

Server lane.

## Comments
