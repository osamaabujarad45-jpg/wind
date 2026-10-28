# Wind implementation: design for WP13–WP15 (money ledger, payments off, ops and safety)

Status: design only. No `src/`, `server/` or config files changed. Implementation waits for the backend fields and gates in §8.
Author: design sub-agent, Claude Haiku 5.5. Matches `design.md` (tokens §2, RTL §3, disabled rule §10) and `design-wp08-wp10.md`.
Scope: user-visible states, copy and accessibility for WP13 (cash and ledger), WP14 (Bank of Palestine and merchant COD, coded-but-off) and WP15 (ops, support, safety). Ledger and payment internals are out of scope.

## 1. Rules carried over

- Copy: add keys to `src/copy.ts`. The `Copy` type (`const en: Copy`) forces every key into both `ar` and `en`. Use `fill()` for `{a}`, `{d}`, `{t}`, `{r}`. Money: `useCopy().money(n)` (renders `₪ 71`, minus sign `−`). No new i18n system.
- Tokens: `palette` from `src/ui.tsx` only. Status is always text + icon. No emoji, no gradient, no colour-only state.
- Keys are listed with a status: **reuse** (existing key, no change), **new** (add now, rendered by this packet), **deferred** (write only when its state can render, after the gate in §8). Deferred strings stay out of `copy.ts` until then, so no dead strings ship.
- Disabled controls follow `design.md` §10: keep shape and label, `paper` fill, `secondary` text, reason line under it.

## 2. WP13: driver cash and earnings states

Driver cash screen (existing cash tab, `cashTab`). One row per state. The amount is always shown.

| State | When | Look and icon | Copy |
|---|---|---|---|
| Due | ledger liability > 0, no open handover | `clayPale` card, receipt icon | `cashOwed`, `cashOwedHint` (reuse) |
| Partial | confirmed remittance is less than the amount due | `clayPale` card, split icon | `cash_partial` (new) |
| Waiting your confirmation | admin recorded handover, driver has not confirmed | `bluePale` card, clock icon | `cashPending`, `cashConfirm`, `cashDispute` (reuse) |
| Settled | balance 0 | `olivePale` card, check icon | `cash_settled` (new), `cashLast` (reuse) |
| Disputed | driver disputed the amount | `errorPale` card, flag icon | `cash_under_review` (new), `entry_disputed` (reuse) |
| Cap near (inactive) | exposure ≥ 80% of `projectedCashCapMinor` | not rendered until `cashCapActivated` | `cash_cap_near` (deferred to G1) |
| Cap blocked (inactive) | new job would exceed cap | `StateCard`, not rendered until activated | `accept_blocked_cash` (deferred to G1) |

Rules:
- Settled and due never show "paid". The driver's confirmation is the only fact that clears a balance.
- Cap copy never appears while `cashCapActivated: false`. The current accept flow is unchanged.
- A disputed row links to nothing the driver can edit. It only reads "under review".

## 3. WP13: admin cash and ledger review

Existing `src/app/admin/cash.tsx` gets these states. Each row shows the order or entry code (LTR).

| State | When | Action | Copy |
|---|---|---|---|
| Waiting driver | handover recorded, not confirmed | none (read-only) | `ledger_waiting_driver` (new) |
| Needs decision | driver disputed | reverse, or record an adjustment with reason | `ledger_needs_decision` (new) |
| Reversed or adjusted | correction posted | original entry stays visible above the correction | `ledger_reverse`, `ledger_reverse_confirm` (new); `cashAdjust`, `cashReason` (reuse) |
| Reconciled | balances match orders and cash | none | `ledger_reconciled` (new) |
| Unowned residual | reconcile finds an unowned difference | period close blocked | `ledger_residual` (new) |
| Unbalanced journal | debits ≠ credits | refused, nothing saved | `err_ledger_unbalanced` (new) |
| Cash exposure row | dashboard and cash screen | link to cash screen | `ops_cash_exposure` (design.md §12, unchanged) |

Rules:
- Corrections are reversals or adjustments with reason (`reason_min5`, reuse). There is no balance edit control anywhere.
- Admin profit stays labelled as profit. Do not relabel it contribution margin.

## 4. WP14: payments, coded-but-off

Default for every customer and driver screen: **no payment UI**. Booking payment row stays the single fixed row `payWith` + `cash`.

Admin only (settings capability matrix, `design.md` §9):

| State | When | Look | Copy |
|---|---|---|---|
| Off (default) | no activation | badge, reason line, not toggleable | `cap_off` (design.md), `cap_waiting` (design.md), `cap_reason_merchant` (new) |
| Unavailable | any live call without activation | error card | `err_payments_unavailable` (new) |

Deferred until gate G2 (not in `copy.ts` now; defined here so the wording is fixed):

| State | When | Rule | Copy |
|---|---|---|---|
| Pending, never retry blindly | unknown timeout, no authoritative answer | no retry button, no second charge path | `pay_state_pending`, `pay_state_timeout_note` |
| Captured | capture confirmed | separate from completion | `pay_state_captured` |
| Refunded | refund ≤ captured − prior refunds | amount shown | `pay_state_refunded` |
| Failed | provider rejected or dropped | no charge promise (O4 in design.md) | `pay_state_failed` |
| COD collected | driver collected goods value | merchant liability, not fare | `cod_collected`, `cod_not_wind` |
| COD remit due | merchant payout date | deadline shown | `cod_remit_due` |

Customer strings for pending and captured already exist in `design.md` §8 and §12 (`pay_pending_future`, the "تم الدفع" line). Reuse them when G2 passes; do not duplicate.

## 5. WP15: operations, support and safety

Ops queue and case card: keys from `design.md` §9 and §12 are reused (`ops_urgent`, `ops_overdue`, `ops_owner`, `ops_waiting_driver`). Added here:

| State | When | Look and icon | Copy |
|---|---|---|---|
| Severity: safety | safety report open | `errorPale` badge, shield icon | `sev_safety` (new) |
| Severity: normal | default | neutral badge, dash icon | `sev_normal` (new) |
| No owner | case open, unassigned | `clayPale` badge | `case_no_owner` (new) |
| Waiting customer | case waits on rider or sender | neutral badge | `case_waiting_customer` (new) |
| Escalated | moved to another role | neutral badge, arrow icon | `case_escalated` (new), `role_*` (new) |
| Closed | resolved and closed | neutral, check icon | `case_closed` (new) |
| Access blocked | wrong role, no MFA, no purpose | `StateCard` | `err_forbidden` (reuse), `err_staff_mfa`, `err_purpose_required` (new) |
| Dispatch override | reason and history recorded | confirm sheet | `reason_min5` (reuse), `override_recorded` (new) |
| Second approval | finance action needs a second person | neutral card | `approval_second` (new) |
| Safety signal (admin only) | route deviation, long stop, stale fix | neutral card, not an alarm | `safety_signal_route`, `signal_stale` (new) |
| SOS received | customer or driver report | `StateCard` | `safetyReported` (reuse), `safetyReportedHint` (changed) |
| Safety degraded | staff unavailable | `StateCard`, emergency first | `safety_degraded`, `support_degraded` (new) |

Honest-copy rules for safety and support:
- No copy promises police dispatch, a callback time, or 24/7 cover. The signed rota (G3) decides whether any staffed-hours line exists. Until then none is written.
- Stale fix and deviation are signals, not findings. Admin copy says so.
- Emergency numbers come from operator config (G4). The screen shows only validated numbers.
- Support and identity recovery reuse the existing caller-verification keys (`identityTitle`, `identityCheck`, `identityConfirmed`).

Changed existing keys (both languages, in `copy.ts`):
- `safetyConfirm`: was "...وسيتواصل معك" (promised contact). Now "قد يتواصل معك الفريق" / "The team may contact you".
- `safetyReportedHint`: was "سيتصل بك الفريق قريباً" (promised call). Now "قد يتواصل معك الفريق، ولا نضمن وصول أحد في وقت محدد." / "The team may contact you, but we can't promise anyone reaches you at a set time."
- `safetyPaused`: was "سيتواصل معك الدعم" / "Support will contact you". Now "قد يتواصل معك الدعم." / "Support may contact you."
- `safetyEmergencyHint`: drops "تعمل حتى بدون إنترنت". Now "هذه الأرقام تُتصل مباشرة من هاتفك." / "These numbers dial directly from your phone." (the no-internet claim was not verified on device).

## 6. Copy keys, full text

Arabic is drafted, not native-reviewed (design.md O5). Send to native review before release.

| Key | ar | en | Status |
|---|---|---|---|
| `cash_partial` | تبقّى {p} من المستحق | {p} still owed | new |
| `cash_settled` | لا يوجد مستحق | Nothing owed | new |
| `cash_under_review` | اعترضت على هذا المبلغ. يراجعه أمين الصندوق. | You disputed this amount. A cashier is reviewing it. | new |
| `cash_cap_near` | اقتربت من حد النقد المستحق: {a} من {l}. سلّم النقد قبل قبول طلبات جديدة. | Near the cash owed limit: {a} of {l}. Hand over cash before taking new jobs. | deferred G1 |
| `accept_blocked_cash` | وصلت إلى حد النقد المستحق. سلّم المبلغ أولاً. الطلبات الجارية لا تتأثر. | You reached the cash owed limit. Hand over the amount first. Current jobs are not affected. | deferred G1 |
| `ledger_waiting_driver` | تسليم بانتظار تأكيد السائق | Handover waiting for driver | new |
| `ledger_needs_decision` | معترض عليه · يحتاج قراراً | Disputed · needs a decision | new |
| `ledger_reverse` | عكس القيد | Reverse entry | new |
| `ledger_reverse_confirm` | يُضاف قيد عكسي بالمبلغ نفسه، والقيد الأصلي يبقى ظاهراً. | A reversing entry for the same amount is added. The original stays visible. | new |
| `ledger_reconciled` | متطابق مع الطلبات والنقد | Matches orders and cash | new |
| `ledger_residual` | فرق بلا مالك: {a}. لا تُغلق الفترة. | Unowned difference: {a}. The period stays open. | new |
| `err_ledger_unbalanced` | القيد غير متوازن. لم يُحفظ شيء. | The entry does not balance. Nothing was saved. | new |
| `cap_reason_merchant` | اتفاقية التاجر | merchant agreement | new |
| `err_payments_unavailable` | الدفع الإلكتروني غير متاح الآن. الدفع نقداً للسائق. | Online payment is unavailable now. Pay the driver in cash. | new |
| `pay_state_pending` | الدفع قيد التأكيد. لا تُعِد العملية. | Payment pending confirmation. Do not retry. | deferred G2 |
| `pay_state_timeout_note` | لم يرد المزود في الوقت المحدد. ننتظر تأكيد البنك. | The provider did not reply in time. Waiting for the bank to confirm. | deferred G2 |
| `pay_state_captured` | تم تحصيل الدفع | Payment captured | deferred G2 |
| `pay_state_refunded` | تم استرداد {a} | Refunded {a} | deferred G2 |
| `pay_state_failed` | لم يكتمل الدفع. تواصل مع الدعم إن ظهر خصم. | Payment did not complete. Contact support if a charge appears. | deferred G2 |
| `cod_collected` | حُصّل من المستلم: {a} | Collected from recipient: {a} | deferred G2 |
| `cod_remit_due` | يُسلَّم للمتجر حتى {d} | Remit to merchant by {d} | deferred G2 |
| `cod_not_wind` | هذا المبلغ للمتجر، وليس إيراداً لـ ويند. | This amount belongs to the merchant, not Wind revenue. | deferred G2 |
| `sev_safety` | سلامة | Safety | new |
| `sev_normal` | عادي | Normal | new |
| `case_no_owner` | بدون مسؤول | No owner | new |
| `case_waiting_customer` | بانتظار الزبون | Waiting for customer | new |
| `case_escalated` | صُعّدت إلى {r} | Escalated to {r} | new |
| `case_closed` | مغلقة | Closed | new |
| `role_dispatch` / `role_driver_review` / `role_support` / `role_safety` / `role_finance` / `role_admin` | الإرسال / مراجعة السائقين / الدعم / الأمان / المالية / المدير | Dispatch / Driver review / Support / Safety / Finance / Admin | new |
| `err_staff_mfa` | أكّد هويتك بالتحقق الثنائي لفتح هذه الشاشة. | Confirm with two-step sign-in to open this screen. | new |
| `err_purpose_required` | اختر سبب فتح هذا السجل. | Choose why you are opening this record. | new |
| `override_recorded` | يُسجَّل السبب وسجل التعيين. | The reason and assignment history are recorded. | new |
| `approval_second` | بانتظار موافقة ثانية من المالية. | Waiting for a second finance approval. | new |
| `safety_signal_route` | انحراف أو توقف طويل عن المسار. ليس دليلاً على مخالفة. | Route deviation or long stop. Not proof of wrongdoing. | new |
| `signal_stale` | آخر موقع قبل {t}. قد يكون الهاتف مغلقاً أو بلا تغطية. | Last location {t} ago. The phone may be off or out of coverage. | new |
| `safety_degraded` | فريق الأمان غير متاح الآن. إن كنت في خطر فاتصل بالطوارئ الآن. | The safety team is unavailable right now. If you are in danger, call emergency services now. | new |
| `support_degraded` | الدعم غير متاح الآن. رسالتك محفوظة، والرد يعتمد على توفر الفريق. | Support is unavailable right now. Your message is saved. A reply depends on the team being available. | new |
| `safetyConfirm` | سيتوقف الطلب حتى يراجعه فريق الأمان. قد يتواصل معك الفريق. لن يعرف الطرف الآخر أنك من أبلغ. | The order pauses until the safety team reviews it. The team may contact you. The other party won't know you reported. | changed |
| `safetyReportedHint` | الطلب متوقف مؤقتاً. قد يتواصل معك الفريق، ولا نضمن وصول أحد في وقت محدد. في حالة الخطر اتصل بالطوارئ أولاً. | The order is paused. The team may contact you, but we can't promise anyone reaches you at a set time. If you are in danger, call emergency services first. | changed |
| `safetyPaused` | الطلب متوقف مؤقتاً من فريق الأمان. قد يتواصل معك الدعم. | Paused by the Wind safety team. Support may contact you. | changed |
| `safetyEmergencyHint` | إذا كنت في خطر فاتصل بالطوارئ أولاً. هذه الأرقام تُتصل مباشرة من هاتفك. | If you are in danger, call emergency services first. These numbers dial directly from your phone. | changed |

## 7. RTL and accessibility (only where WP13–15 add UI)

- Amounts and codes: each value in its own `Text` node, Western digits, LTR (`₪ 71`, `W-00002`, `06:54`). Never inside an Arabic sentence without a node break.
- Sign: a credit to the driver shows `−` (minus) before the amount. Read the sign aloud as "minus" in the label, not only in the glyph.
- Lists start at the reading edge (`useCopy().row`). Chevrons flip. The shield, flag, clock and check icons do not flip.
- Touch targets 44pt minimum on every admin row, every emergency number, and every reverse/adjust action. Row height grows with Arabic line height (≥1.45×). No ellipsis on a case route.
- Status by text and icon. Severity: "سلامة" with shield, not red alone. Overdue is text, not colour.
- Live regions (`accessibilityLiveRegion="polite"`) only on: a handover confirmed or disputed, a reversal posted, a safety report received. Not on balance ticks.
- Safety hold and degraded cards: the emergency action is the first focusable element. Do not hide it behind a scroll.
- Font scale 1.3 at 360×800: the case card, reverse confirm sheet, and capability rows must wrap, not clip.

## 8. No UI yet (declared, not designed around)

- **WP14 live payments**: no card, wallet, Bank of Palestine or COD customer UI. The booking row, order screen and receipt keep "نقداً للسائق" / "Cash to driver" with the amount. No "paid" badge. The adapter runs only in tests with an injected fake transport.
- **Proof photos and signatures (WP12)**: no capture, no preview, no upload UI. The handover and return codes (`design.md` §7) are the only proof and are unchanged.
- **Driver ID scans**: no UI. Storage existing is not a reason to collect.
- **Cap warning and cap block (WP13)**: not rendered while `cashCapActivated: false`. Current accept and cash behaviour is unchanged.
- **Masked calling and AI assistance (WP15)**: no UI. Capability rows read "غير مفعّل" / "Off" with the reason.
- **Journal viewer**: not built. Admin reads entries through the cash review rows in §3 only.

## 9. Owner gates (decisions the design does not make)

These block activation. Design does not work around them.

- **G1 Finance sign-off**: example journals reviewed independently, plus cap activation (`cashCapActivated`, `projectedCashCapMinor` 100000). Unlocks the deferred cap keys.
- **G2 Merchant and payments**: signed merchant agreement, capability matrix, sandbox, holding and settlement arrangements, finance owner, and a test budget. Unlocks every deferred payment and COD key. Until then the adapter ships disabled.
- **G3 Staffed rota**: operations sign-off of coverage plus a timed drill. Unlocks any staffed-hours wording. Until then §5 rules stand.
- **G4 Emergency and support numbers**: operator-validated config. Required before the SOS screen shows numbers.
- **G5 Privacy approval**: named in plan §12. Required before any proof photo or ID scan UI.
- **G6 Staff sign-in**: workforce MFA/SSO boundary for admin screens (`err_staff_mfa`). Required before admin cash or ops screens go live outside the test org.
- **G7 Arabic review**: native-speaker review of every new key in §6. Required before release.

## 10. Implementation packets (after the backend contract confirmation, `design.md` §15 O1, and the gates in §9)

Each packet owns its files. Rebase before editing; other agents share the checkout.

| Packet | Scope | Blocked on |
|---|---|---|
| D13 driver cash | cash tab states in §2, `cash_partial`, `cash_settled`, `cash_under_review` | ledger balance and dispute fields |
| D13 admin ledger | `src/app/admin/cash.tsx` states in §3, reverse confirm | reversal endpoint, reconcile residual |
| D14 capability | matrix rows and `err_payments_unavailable` only | capability flags from server |
| D15 ops case | severity, case status, role keys, degraded cards | case `severity`, `owner`, `dueAt` |
| D15 safety copy | the four changed keys in §5, emergency numbers from config | G4 for numbers |

Verification: `npm run lint`, `npx tsc --noEmit`, `npm test`. `npm run screens` after each UI change, then read the new PNGs in `ar/` and `en/`. Screenshots for: partial, settled, disputed, reversed, needs decision, capability Off, SOS received, safety degraded, and the admin case card with the safety severity.

Changed files: `docs/implementation/design-wp13-wp15.md` (this file, new). Nothing else.

— Claude Haiku 5.5, 2026-10-27
