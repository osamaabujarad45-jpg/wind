# Wind design audit, 9 Nov 2026

Scope: every screen in `docs/screens/` (Arabic and English) on origin/master 92b1cd2, read against `src/ui.tsx`
(palette, type, controls) and the screen code. Map screens are judged on layout and chrome only. The seeded
screenshot run has no OSRM, so missing route lines are expected (`route-map.native.tsx`: lines follow roads only).

## Identity

- **Palette.** Forest `#12342A` with lime `#D3F27A` is the identity, and it holds: the logo tile, primary
  buttons, the selected tab and the driver's "sharing location" card all use it. Paper `#F3F2EC` and clay
  `#CB6845` sit close to the most common generated look (cream ground with a terracotta accent). What keeps
  Wind out of that look is the rule in `ui.tsx` that clay marks only the logo pin and map markers, and
  `clayInk` is the only clay used for text. Keep that rule.
- **Type.** Wind uses only the system font, at weight 800 for `h1` and `h2`. That is legible in both scripts,
  but nothing in the type says "Wind". The next step that would do the most for the brand is one bilingual
  family with real Arabic and Latin drawing, for headings only (IBM Plex Sans Arabic, or Noto Kufi Arabic
  with its Latin). That is a brand decision with a bundle-size cost, so it is not made here.
- **Structure.** Cards are justified: each one is a separate object (an order, a trip, a setting group).
  Status badges carry real state, and the live dot only shows on live statuses. The map plus sheet is the
  right lead for a delivery app, and it is used the same way for customer, driver and order screens.

## Fixed in this branch

| # | Issue | Change | Verified |
|---|---|---|---|
| 1 | A disabled button (paper fill, solid border) looked the same as an enabled outline button (white fill, solid border). Fill contrast between them was 1.05:1: driver Jobs (Go online, Accept), order report (Send report), booking (Request). | `Button` keeps the paper fill and secondary label when disabled, but the edge is now dashed (`palette.dash`: 1.9:1 on paper, 1.7:1 on muted, 2.1:1 on white; inactive controls are exempt from WCAG 1.4.11). A flat muted fill was tried first and dropped, because it disappears on muted cards (presence card, profile, roads). | tsc, lint, screens re-rendered |
| 2 | Driver with a job and location off: a clay warning pill sat inside a forest card, so the screen read as an error inside a dark box. | The card is clay when location is off and forest when sharing. The inner row is white on clay. | screens re-rendered (driver-jobs) |
| 3 | "Background location is off" warning was `clayInk` on forest: 2.38:1, below WCAG AA. | Now `clayPale` on forest: 11.5:1. | contrast computed |
| 4 | During an active job, Jobs still showed the presence card: "Offline", a disabled Go online, and "You have a job in progress…". Presence is stopped during a job anyway (`driver-work.tsx`), so the card was noise above the job. | The card is hidden while a job is assigned, unless it has an error or a pending change to show. | screens re-rendered (driver-jobs) |
| 5 | Token drift: `#E6ECE3` written out 5 times for the map placeholder, the olive and clay marker hexes copied into two native map files, and the sheet grip set as a literal. | Added `palette.mapWash` and `palette.dash` (the grip moves from `#C9C8BE` to `#B4B3A8`, a little darker on purpose). The markers use `palette.olive` and `palette.clay`. | tsc, grep shows no literals left |
| 6 | Order delivered: the heading said "Thanks for rating" while the price question under it was still open. | New copy key `thanksDriver` ("Thanks for rating your driver" / "شكراً لتقييم السائق") for the driver rating heading. The driver's rating of the customer keeps `thanks`. | tsc, screens re-rendered (order-done) |
| 7 | Found only on the A53 (native): the Ride tile on Home read "مشوا", its last letter cut. Android measured the Arabic label narrower than it draws, and the label only had `flexShrink`. | The label takes `flex: 1`, so its box is the tile's free width, not the measured text width. | QA customer APK built from this tree, on the A53: "مشوار" in full |

## Open, needs an owner decision

1. **Map labels.** The base map shows settlement names (Psagot, Beit El, Ariel, Modi'in Illit) and Hebrew
   street and POI labels at driver zoom (driver-order). For a West Bank audience this is a product and
   brand call, not a styling one. Arabic mode already shows Arabic names; the open question is which
   places get a label at all. Fix path: filter those label layers in the map style.
2. **Brand typeface** (see Identity).

## Open, small, left as they are

- Pin chips repeat the base map's own city label ("Ramallah" chip right above the map's "Ramallah"), and the
  marker covers part of that label (book-calculating). Hiding base place labels near pins would need a style
  change, so this goes with item 1.
- Trip search looks the same for parcel and ride (book-parcel and book-ride are pixel-identical). The service
  is chosen on the next step, so this is consistent, but the search gives no hint of what is being booked.
- Home: "Items & parcels" wraps to two lines in its service tile while the other two fit on one. Tiles are
  equal width by design. Three content-width tiles do not fit at 390pt.
- Screenshots of map screens are captured at full scroll height (3,000+ px), which stretches the map and
  makes the framing look wrong in the PNGs. On the phone the map fills one viewport.
