# F0 tap-count baseline · 27 November 2026

## Physical Android launch before F1

The Galaxy A53 ran Wind 1.1.6 vc44 (EAS `fa71b101`, `816d3e17`), signed out on unshaped Wi-Fi. Ten process starts and ten returns from Android Home were captured just before F1. Android Activity Manager `TotalTime` measured the first frame. The samples do not measure when controls became usable, the map loaded, or orders could be placed.

| Launch | Samples (ms) | Median | Range |
| --- | --- | ---: | ---: |
| Process cold | 927, 908, 885, 847, 866, 848, 874, 882, 870, 885 | 878 ms | 847–927 ms |
| Return from Home | 81, 73, 97, 77, 80, 76, 77, 82, 78, 68 | 77.5 ms | 68–97 ms |

The F0 harness then ran 30 pairs on the same APK at 100% text. It counted the Activity Manager first frame with disk caches and app data retained, after a force-stop for cold launches and a return from Android Home for hot launches. The local sample record is `.artifacts/f0/2026-11-27T00-00-18.248Z/summary.md`.

| Launch | Samples | p50 | p95 | Range |
| --- | ---: | ---: | ---: | ---: |
| Process cold | 30 | 919 ms | 1,027 ms | 881–1,079 ms |
| Return from Home | 30 | 73 ms | 159 ms | 56–190 ms |

Repeat with the candidate APK under the same conditions. Capture the first usable controls and first useful map separately under the [design measurement protocol](../design/FLOWS-2026-11-26-one-app-profiles.md#7-speed-plan). Journey timings and weak-network timings remain open.

## Source tap-count baseline

Before-numbers for F1 and F7, recounted from `816d3e17` for a warm, signed-in customer starting on Home. Count deliberate control taps through submission to a successfully placed order. Exclude typing and related field focus, scrolling, sheet and map drags, and waiting for a quote or response. Assume the service is enabled, contact is prefilled, and the customer keeps the default options. This recount uses the source paths below. [Design D6](../design/FLOWS-2026-11-26-one-app-profiles.md#1-what-makes-the-app-feel-complex-today)

| Journey | Taps | Sequence |
| --- | ---: | --- |
| Ride, two new town pins | **6** | Where to? → destination town → confirm drop-off spot → pickup town → confirm pickup spot → Request. |
| Ride, saved destination with a pin and automatic pickup | **3** | Where to? → saved destination → Request. |
| Parcel, two new town pins | **7** | Parcel tile → destination town → confirm drop-off spot → pickup town → confirm pickup spot → prohibited-items checkbox → Request. Swipe up to reach the checkbox. |
| Shop, new delivery pin and empty cart | **7** | Shop tile → merchant → add one item that meets the minimum → View cart → set delivery spot → confirm spot → place order. Enter the required landmark while in the cart. |

- Home's Where to? opens ride search with ride enabled. Its tiles open parcel booking and the shop list. [Home, lines 41–43](https://github.com/osamaabujarad45-jpg/wind/blob/816d3e173de2eeeaa644e49104c7981e2376e6fe/src/app/%28customer%29/index.tsx#L41-L43) · [Home, lines 152–169](https://github.com/osamaabujarad45-jpg/wind/blob/816d3e173de2eeeaa644e49104c7981e2376e6fe/src/app/%28customer%29/index.tsx#L152-L169)
- Booking starts with destination search. A town row with no coordinates opens pin confirmation. Confirming the first stop moves directly to search for the other stop. Confirming the second opens the trip sheet with Request in the footer. To reproduce the two-town path, use two served towns and a session in which the app does not adopt a pickup fix. [Booking, lines 45–58](https://github.com/osamaabujarad45-jpg/wind/blob/816d3e173de2eeeaa644e49104c7981e2376e6fe/src/app/book.tsx#L45-L58) · [Booking, lines 255–268](https://github.com/osamaabujarad45-jpg/wind/blob/816d3e173de2eeeaa644e49104c7981e2376e6fe/src/app/book.tsx#L255-L268) · [Booking, lines 302–307](https://github.com/osamaabujarad45-jpg/wind/blob/816d3e173de2eeeaa644e49104c7981e2376e6fe/src/app/book.tsx#L302-L307) · [Booking, lines 667–721](https://github.com/osamaabujarad45-jpg/wind/blob/816d3e173de2eeeaa644e49104c7981e2376e6fe/src/app/book.tsx#L667-L721)
- A saved destination with a pin opens the trip sheet directly if a consented GPS fix or a fresh remembered fix has already set pickup. A saved landmark without a pin needs confirmation. With pickup still unset, the app asks for it. The same saved-pin shortcut yields **4** taps for parcel with automatic pickup and the required checkbox. Tapping the sheet handle instead of swiping adds one to either parcel count. Parcel also needs a description and both ride and parcel need valid place notes. [Search, lines 141–150](https://github.com/osamaabujarad45-jpg/wind/blob/816d3e173de2eeeaa644e49104c7981e2376e6fe/src/trip-search.tsx#L141-L150) · [Booking, lines 229–268](https://github.com/osamaabujarad45-jpg/wind/blob/816d3e173de2eeeaa644e49104c7981e2376e6fe/src/app/book.tsx#L229-L268) · [Booking, lines 504–511](https://github.com/osamaabujarad45-jpg/wind/blob/816d3e173de2eeeaa644e49104c7981e2376e6fe/src/app/book.tsx#L504-L511) · [Booking, lines 734–746](https://github.com/osamaabujarad45-jpg/wind/blob/816d3e173de2eeeaa644e49104c7981e2376e6fe/src/app/book.tsx#L734-L746) · [Sheet, lines 67–92](https://github.com/osamaabujarad45-jpg/wind/blob/816d3e173de2eeeaa644e49104c7981e2376e6fe/src/map-sheet.tsx#L67-L92)
- Shop checkout starts without a delivery point and offers a pin sheet for a fresh order. The cart requires a delivery pin, landmark and valid phone before Place order is enabled. Items below the minimum add quantity taps. [Shop list, line 24](https://github.com/osamaabujarad45-jpg/wind/blob/816d3e173de2eeeaa644e49104c7981e2376e6fe/src/app/shop/index.tsx#L24) · [Menu, lines 28–53](https://github.com/osamaabujarad45-jpg/wind/blob/816d3e173de2eeeaa644e49104c7981e2376e6fe/src/app/shop/%5Bid%5D.tsx#L28-L53) · [Cart, lines 29–34](https://github.com/osamaabujarad45-jpg/wind/blob/816d3e173de2eeeaa644e49104c7981e2376e6fe/src/app/shop/cart.tsx#L29-L34) · [Cart, lines 155–187](https://github.com/osamaabujarad45-jpg/wind/blob/816d3e173de2eeeaa644e49104c7981e2376e6fe/src/app/shop/cart.tsx#L155-L187) · [Cart, lines 214–230](https://github.com/osamaabujarad45-jpg/wind/blob/816d3e173de2eeeaa644e49104c7981e2376e6fe/src/app/shop/cart.tsx#L214-L230) · [Pin sheet, line 93](https://github.com/osamaabujarad45-jpg/wind/blob/816d3e173de2eeeaa644e49104c7981e2376e6fe/src/pin-sheet.tsx#L93)
