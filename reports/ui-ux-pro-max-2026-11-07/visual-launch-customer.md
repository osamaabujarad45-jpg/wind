# Independent visual review — launch-customer

Requested model: claude-haiku-5-5. Actual model usage: claude-haiku-5-5 (firstParty). Effort: medium (applied effort not exposed). Read-only; no source or product changes. Cost basis: 0.22731911999999999 USD CLI-reported. Permission denials: 0.

## Visual review: Wind baseline screens (AR + EN)

**Coverage:** 28 screen IDs (intro plus 27 screens), 64 images. I opened all 64 with Read and none were unreadable. Paths are relative to `.artifacts/ui-ux-pro-max-2026-11-07/baseline-screens/`. Everything below is from pixels only. I make no claims about functionality, contrast ratios, or accessibility compliance.

### Confirmed pixel defects
1. **`en/sign-up.png`**: the "Motorcycle" label is wider than its vehicle chip and spills past both edges.
2. **`ar/order-scheduled.png`**: the day-chip row is cut at the left edge ("الأرب…"). There is no other scroll indicator.
3. **`en/order-scheduled.png`**: a time chip is cut at the right edge.
4. **Helper text sits flush against the next button, with no gap:**
   - `ar/sign-in-phone-recovery.png` and `en/sign-in-phone-recovery.png` ("Enter the 6-digit code" above "Send code")
   - `ar/profile-phone-code.png` and `en/profile-phone-code.png` ("Enter the 6-digit code" above "Request a new code")
5. **`en/order-parcel-live.png`**: "Send the tracking link to the recipient on WhatsApp" wraps to two lines and fills its pill with almost no padding.
6. **Skip button is inconsistent in the welcome flow:**
   - `en/welcome-2.png` shows "Skip".
   - `ar/welcome-2.png` shows only "English", with no "تخطي".
   - `en/welcome-3.png` and `ar/welcome-3.png` have no Skip button at all.
   - Whether this is intended is not visible in the pixels.
7. **Map label covered by a marker:** in `en/order-searching.png` the orange pickup marker covers part of the "Tulkarm" label. In `ar/order-searching.png` the "طولكرم" label looks partly covered, though I am less certain of that one.
8. **Data mismatch in "Member since":** `ar/profile.png` and `en/profile.png` show 7 Nov 2026. `ar/profile-phone-ready.png`, `en/profile-phone-ready.png`, and the phone-code and phone-change screens show 28 Oct 2026. This may be fixture data, but the screens disagree.

### Uncertain (cannot be settled from pixels)
- Booking CTA state: `book-parcel` and `book-ride` show a dark "Request"/"اطلب" button with a caption saying to choose a pickup first. `book-calculating` shows an outlined grey button. I cannot tell whether the dark button is enabled.
- Message send buttons in `order-live` and `order-parcel-live` are grey. Their state is unclear.
- `intro-2` (AR): the speed lines are clipped at the tile edge. This may be an intentional mid-animation frame.

---

### Per-screen verdicts

**Intro** (`ar/intro-1–5.png`, `en/intro-1–5.png`): **NOTE**
- `ar/intro-2.png`: lines clipped at the left tile edge.
- Frames 4 and 5 are nearly identical. Only the tagline differs.

**welcome-1**: **PASS**. The AR slider is a clean mirror of EN. Dots, Next/التالي button, and install footer are aligned.

**welcome-2**: **NOTE**. Skip button inconsistency (see item 6).

**welcome-3**: **PASS with note**. Layout is clean. The Skip button is absent, which is consistent with the flow only if intended.

**sign-in** (`ar/`, `en/`): **PASS**. Tabs, labels, fields, CTA, and footer links are aligned with no clipping. Active tab order is mirrored correctly.

**sign-up** (`ar/`, `en/`): **FIX (EN)**. Motorcycle chip overflow in `en/sign-up.png`. The AR driver form is otherwise clean, with mirrored tab and account-type order.

**sign-up-customer** (`ar/`, `en/`): **PASS**.

**sign-in-phone-recovery** (`ar/`, `en/`): **NOTE**. Helper text cramped against the button (item 4).

**help** (`ar/`, `en/`): **PASS**. The back arrow points the correct way in each language. FAQ question weight looks heavier in EN than AR. That is an observation, not a defect.

**home** (`ar/`, `en/`): **NOTE**. In `ar/home.png`, the "التسليم برمزك الخاص" banner has a large empty gap between its icon and title. Otherwise nav, service cards, and order cards are clean and mirrored correctly.

**book-parcel** (`ar/`, `en/`): **NOTE**. CTA state ambiguity (see uncertain list). Otherwise the form, size chips, and sticky footer are clean.

**book-ride** (`ar/`, `en/`): **NOTE**. Same CTA ambiguity. The passenger stepper has "+" and "−" in mirrored positions (AR puts "+" at left, EN puts "−" at left). That is a conventional choice, not a defect.

**book-calculating** (`ar/`, `en/`): **NOTE**. The disabled CTA and "Calculating price…" caption are clearly visible. The sticky footer crops the note field at its top edge, which is expected for a scroll view.

**book-freight** (`ar/`, `en/`): **PASS**.

**book-again** (`ar/`, `en/`): **PASS**. Copied-order caption, fixed-fare card, and the ₪17 CTA are consistent between languages.

**book-send-another** (`ar/`, `en/`): **PASS**. No map is shown, which is consistent with the screen's purpose.

**orders** (`ar/`, `en/`): **PASS**. Tab order is mirrored correctly. Status pills and amounts are aligned.

**order-searching** (`ar/`, `en/`): **NOTE**. Map label occlusion (item 7). Driver-offer price and accept layout is clear.

**order-scheduled** (`ar/`, `en/`): **FIX**. Chip clipping in both languages (items 2 and 3). In EN, "Keep time" text sits slightly lower than the centre of "Save new time" beside it.

**order-live** (`ar/`, `en/`): **PASS with note**. Progress bar mirrors correctly. Grey send-button state is uncertain.

**order-parcel-live** (`ar/`, `en/`): **NOTE**. EN WhatsApp CTA wraps and is cramped (item 5). The AR CTA fits on one line.

**order-done** (`ar/`, `en/`): **PASS**. Rating, receipt, and "order again" actions are clear. The report button appears disabled in both languages.

**receipt** (`ar/`, `en/`): **PASS**. Label and value columns are correctly mirrored in AR.

**account** (`ar/`, `en/`): **PASS**. Chevrons point toward the correct direction in each language. The language value is shown in its native script, which is expected.

**profile** (`ar/`, `en/`): **NOTE**. "Member since" date mismatch (item 8). EN repeats "Phone verification isn't available yet." under both actions.

**profile-phone-ready** (`ar/`, `en/`): **NOTE**. Date mismatch (item 8). Otherwise the verification layout is clean.

**profile-phone-code** (`ar/`, `en/`): **NOTE**. Helper text cramped against the button (item 4).

**profile-phone-change** (`ar/`, `en/`): **PASS**. Form, helper text, and cancel link are clean. Nothing is clipped.

---

**Model:** Haiku 5.5 (claude-haiku-5-5)
**Counts:** 28 screen IDs, 64 images read (10 intro, 54 screen images), 0 unreadable.
