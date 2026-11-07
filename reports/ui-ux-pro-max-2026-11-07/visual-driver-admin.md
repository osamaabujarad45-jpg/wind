# Independent visual review — driver-admin

Requested model: claude-haiku-5-5. Actual model usage: claude-haiku-5-5 (firstParty). Effort: medium (applied effort not exposed). Read-only; no source or product changes. Cost basis: 0.031781039999999997 USD CLI-reported. Permission denials: 0.

# Visual UI review: 16 screens, 32 images

**Coverage:** I opened all 32 listed images (16 screens × AR/EN). Base folder: `.artifacts/ui-ux-pro-max-2026-11-07/baseline-screens/`, so `ar/driver-idle.png` means that path under it. No image was unreadable. The trailing `[Image: original …]` notices in your last message only carry resize metadata, so I did not re-read anything for them.

**Intro frames: not covered.** Your request said "including every intro frame", but no intro frame is in the screen list, so I did not open `intro-1` to `intro-4`. Tell me if you want them reviewed.

Findings are pixel observations from these captures. I did not infer behaviour, contrast ratios, or WCAG compliance. Where I could not tell from pixels, I say so.

## Global findings

1. **Copy drift, EN vs AR.** The status chip reads "Pending" in `en/driver-earnings.png`, `en/driver-account.png` and `en/admin-subscriptions.png`. The AR equivalent is "قيد المراجعة" ("under review") in the matching `ar/` files. The word differs, and the EN body text ("Contact support to pay and activate") suggests a payment state.
2. **Naming drift.** The driver tab is "My jobs" / "طلباتي" in most screens, but "Trips" / "رحلاتي" in `en/driver-offer-range.png` and `ar/driver-offer-range.png`. The screen list calls it "My trips". Admin uses "Subscriptions" / "الاشتراكات" on the dashboard and page title, and "Plans" in the nav and in `en/admin-subscriptions.png`.
3. **Mirroring is consistent.** Across the AR screens, chevrons and back arrows point the right way, primary buttons lead, label/value rows are right-aligned with values on the left, and tab order is reversed. The EN screens are the mirror image.
4. **Tab bars are consistent** across all screens (driver 4 tabs, admin 6 tabs), with the active item shown as a lime pill. The exception is the driver offer-range label above.

## Driver app

**driver-pending: Pass.** `ar/driver-pending.png`, `en/driver-pending.png`. Centred, consistent, nothing clipped. The lower two-thirds are empty, which is expected for a gated state.

**driver-jobs: Needs review.**
- `ar/driver-jobs.png` and `en/driver-jobs.png`: the offline card's "Go online" / "اتصل" button is outlined, not filled. It sits beside copy saying a job in progress pauses connection. I cannot tell from pixels whether the outline means disabled.
- `ar/driver-jobs.png`: the GPS warning uses dark red text on a peach pill inside a dark green band. It is legible in the capture, but I make no contrast claim.
- Job cards show gray "Accept job" / "قبول" buttons, which look disabled. The footer says "Finish your current jobs first." That is consistent.

**driver-idle: Needs review (state conflict).**
- `ar/driver-idle.png` and `en/driver-idle.png`: the card says it is offline and that no requests will arrive, yet the job cards show dark, filled "Accept at ₪85" / "قبول بسعر ₪85" and "Accept job" / "اقبل الطلب" buttons. The filled style reads as enabled. This is the clearest contradiction in the set, but I cannot confirm from pixels whether those buttons respond.
- `ar/driver-idle.png` also shows an "عرضك ₪82، بانتظار الزبون" band on a card, which is an active offer state, not an empty idle state.

**driver-run-sheet: Pass.** `ar/driver-run-sheet.png`, `en/driver-run-sheet.png`. Group headers with counts ("استلام من رام الله · 1", "Pick up in Ramallah · 1"), cards with clear hierarchy, and mixed-direction IDs (`W-00010`) sit cleanly in the RTL row. Arrows mirror correctly (← in AR, → in EN). The lower half is empty.

**driver-order: Pass with notes.** `ar/driver-order.png`, `en/driver-order.png`.
- Map labels are cut at the map edges (e.g. "Golda M…", "Avenue/Ha" on the right of `en/driver-order.png`). This is expected for a map view.
- The progress bar fills from the right in AR and from the left in EN, which is correct.
- The Messages send button looks muted in both. I cannot say whether that means disabled.
- "End trip" is the dominant action; "Open in Maps" and "Help & support" are clearly secondary.

**driver-trips: Pass.** `ar/driver-trips.png`, `en/driver-trips.png`. The "On the way" chip is clear in both. In AR the chip's status dot sits on the trailing side, as it should. Naming is covered in global finding 2.

**driver-earnings: Pass with one copy issue.** `ar/driver-earnings.png`, `en/driver-earnings.png`. Hierarchy is clear ("Today" tinted green, "Owed to Wind" tinted pink). The "Pending" vs "قيد المراجعة" drift (global finding 1) applies. The AR negative amount "−₪ 2.55" puts the sign at the leading edge; that is acceptable.

**driver-receipt: Pass.** `ar/driver-receipt.png`, `en/driver-receipt.png`. Clean label/value table, dashed dividers, and a clear total. Nothing is clipped. The AR "أحمد يوسف · سيارة" and EN "Car · أحمد يوسف" order the parts differently, which is correct for each direction.

**driver-account: Pass with copy note.** `ar/driver-account.png`, `en/driver-account.png`. Settings groups are clear and destructive "Sign out" is red. The "Pending" drift applies to `en/driver-account.png`. Note that "Sign out" has no chevron while "Delete account" has one, in both languages.

**driver-offer-range: Needs review.**
- Top clipping: the filter pills are cut at the top edge in both `ar/driver-offer-range.png` and `en/driver-offer-range.png`. This may be a scroll position in the capture, not a layout bug. I cannot confirm which.
- Input: in `ar/driver-offer-range.png` the price field's left edge overlaps the wrapper's rounded border. In both files the focus outline is a heavy black box that does not match the pill shape of the other controls.
- Redundant copy: the range "11 to 42" appears three times in each language (error line, helper line, and below "Send offer").
- Two prices at once: the field shows "5" while "Accept at ₪21" uses 21. That may be intended for the out-of-band state, but it is visible in the same card.
- Tab label drift (global finding 2).
- The disabled "Send offer" button is consistent with the error state.

## Admin dashboard

**admin-dashboard: Pass with notes.** `ar/admin-dashboard.png`, `en/admin-dashboard.png`.
- `en/admin-dashboard.png`: the greeting "Hi إدارة ويند" mixes English and Arabic on one line. It reads as a mixed-direction string.
- The KPI label "Subscriptions" conflicts with the "Plans" nav label (global finding 2).
- The chart is correctly mirrored: in AR the newest bar is at the left, with dates running right to left.

**admin-orders: Pass with note.** `ar/admin-orders.png`, `en/admin-orders.png`. Status chips and IDs are clear and consistent. The filter chip row is cut at the edge in both: a partial "ن" chip at the left of the AR capture and a partial chip at the right of the EN capture. That is a horizontal-scroll cue, and I cannot tell whether it is intentional.

**admin-order: Pass.** `ar/admin-order.png`, `en/admin-order.png`. Clear section order. The delivery-code section's reason field is empty and "فتح المحاولات" / "Reopen attempts" looks muted, which is consistent with a disabled state until the reason has 5 characters. The helper line says so. The map labels are cut at the edges in both captures.

**admin-users: Pass with notes.** `ar/admin-users.png`, `en/admin-users.png`. Action hierarchy is clear: "Permanently approve" is the only dark button, and Block and Edit are tinted. The status pills ("فعّال", "معتمد", "Active") look small at this resolution. I cannot measure their size or legibility from the capture.

**admin-subscriptions: Pass.** `ar/admin-subscriptions.png`, `en/admin-subscriptions.png` (EN page titled "Plans"). Primary "تفعيل" / "Activate" is on the leading side, and "رفض" / "Reject" is a tinted secondary. Clear and consistent.

**admin-settings: Pass with notes.** `ar/admin-settings.png`, `en/admin-settings.png`.
- The Yes/No toggle for "First order only" marks the selection only by a border in both captures. The gray and white states are ambiguous from pixels.
- "Create code" looks disabled until a code is entered. The helper text says so.
- The footer stacks Save, the language switch, Change password and Sign out. These look fixed in the screenshot, but I cannot confirm sticky behaviour from a static image.
- The page is long and dense. Hierarchy holds because the section titles are bold.

## Uncertainty (not confirmed from pixels)

- Whether outlined or muted buttons are disabled or just styled that way (driver-jobs, admin-order, admin-settings).
- Whether the driver-idle accept buttons can be pressed while offline.
- Whether the top clipping in driver-offer-range is a scroll artefact.
- Whether the chip rows scroll, and whether the footers are sticky.
- Font sizes and legibility of small pills and helper text at this resolution. I make no contrast or accessibility claim.

## Model and counts

- **Model:** Haiku 5.5 (`claude-haiku-5-5`)
- **Screens reviewed:** 16 (driver: 10, admin: 6)
- **Images read:** 32 (16 AR + 16 EN); 0 unreadable; intro frames not read (not in the list)
- **Source files read or modified:** none
