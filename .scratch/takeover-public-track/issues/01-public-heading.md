Status: ready-for-agent

# Public tracking still says "Returning to sender" after support takes the goods

Found 28 Nov 2026 by the merge review of d03b1695 into the design branch.

The public track response (`server/main.ts`, around the `supportHasGoods` check in the share endpoint) now drops
the driver and the live position after a takeover, but carries only `status: returning`, so the page heading
(`src/app/track/[token].tsx`) still reads "Returning to sender".

Wanted: include `driverTrackingEnded: true` in that response (as the signed-in order does); the app's shared status
formatter then reads "With support" with no client change beyond passing the field through. Add a server test.

## Owner

Server lane.

## Comments
