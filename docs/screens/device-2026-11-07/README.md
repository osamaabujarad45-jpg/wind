# Wind on the physical phone — 2026-11-07

Captured on the owner's device, `SM-A5360` (adb `R5CTB0FJP9Z`), 1080×2400 px = **360×800 dp**
— the same width the automated audit measures at. Arabic, the app's default.

The build is a local debug APK of this branch, installed under a separate package name
(`ps.wind.audit`) so the owner's installed release app was never touched. It talks to a
throwaway seeded API (customer **ليلى حداد** `0599000001`, driver **أحمد يوسف**
`0599000002`, admin **إدارة ويند** `0599000009`, password `Screenshot_Secret1`).

Every screen was checked through the on-device accessibility tree (`uiautomator dump`),
which is what a screen reader sees: the visible text, the accessible names, the field
errors and the disabled-control reasons below are the real device tree, not a guess.

| Screenshot | Screen | What the device tree confirmed |
|---|---|---|
| [phone-01-launch.png](phone-01-launch.png) | Onboarding | The three slides carry "1 من 3" … "3 من 3" names, "تخطي" and "التالي" are real buttons |
| [phone-02-home.png](phone-02-home.png) | Customer home | The greeting, the three services, both live orders with their prices, cities and numbers, the 4-digit handover code notice, and the three-tab bottom bar |
| [phone-03-orders.png](phone-03-orders.png) | My orders | Two order cards with the service, the price, the route and the order number |
| [phone-04-order-detail.png](phone-04-order-detail.png) | Order detail | The status line "نبحث عن سائق" with its explanation, pickup and destination with their notes, the detail line and "إلغاء الطلب" |
| [phone-05-profile.png](phone-05-profile.png) | Account | The name, the phone, the avatar initial, the Wind Plus card with its end date, the referral code, the language row and "تسجيل الخروج" |
| [phone-06-services.png](phone-06-services.png) | Service picker | The three services as separate targets |
| [phone-07-booking.png](phone-07-booking.png) | Booking form | The service switcher, the city pickers, "استخدم موقعي الحالي" and the map options, the permission explanation, and the pickup/delivery fields with their hints |
| [phone-08-booking-scrolled.png](phone-08-booking-scrolled.png) | Booking form, lower half | Size, pickup time, the applied Plus discount, cash payment, the discount code, the prefilled contact number, and the disabled "اطلب" with its reason "اختر مكان الاستلام والتسليم لعرض السعر." |
| [phone-09-driver.png](phone-09-driver.png) | Driver jobs | "غير متصل" with the reason that no location is sent and no requests arrive, the optional background location with its privacy note, the city filters, the earnings share, the distance and "عميل جديد" |
| [phone-10-admin.png](phone-10-admin.png) | Admin dashboard | The commission and subscription totals, the completed-order cards and the 14-day chart with its axis dates, its "₪ 29 ↑" maximum label and a readable name per data point |
| [phone-11-admin-settings.png](phone-11-admin-settings.png) | Admin settings | The "حسابي" and cash rows, the pricing fields, the promo codes and the five-tab admin bar (no cash tab) |
| [phone-12-admin-account.png](phone-12-admin-account.png) | Admin account | The header with its back button, the admin's name, phone and "مشرف" badge, the language, the password, the roads, the help, the privacy, the sign-out and the delete account |

## What the device pass changed

* **The admin's sign-out was three scrolls down.** On the phone the sign-out in
  `src/app/admin/settings.tsx` sat below the pricing cards *and* the promo-code form, so
  leaving the admin account meant scrolling past both — and the admin bar already holds
  the five tabs the navigation limit allows, so there was no account tab to add. The
  settings now opens with a "حسابي" row that leads to a new `/admin/account` route: the
  same shared account screen the customer and the driver use, with a back button because it
  is a stack screen and not a tab. The sign-out is one tap from the settings, and the
  settings no longer repeats the language, the password or the sign-out.

## What it confirmed

* The Arabic layout is right-to-left on the device, not just in the web export.
* Every disabled control carries its reason on the device: the driver's offline state, the
  booking's "اطلب" button, the auth screen's phone recovery line.
* Every field error sits with its field: "تأكد من تعبئة الحقول المطلوبة." and "اكتب رمز الخصم أولاً."
* The chart is readable by a screen reader: each point is named with its date and both
  series ("1 تشرين الثاني: ₪ 0 + ₪ 0"), and the maximum label is announced.
* The bottom bars hold three tabs for the customer, three for the driver and five for the
  admin, and the admin's cash tab is a settings row instead.
* The app honours the phone's reduced-motion setting (Reanimated reports it and the
  animations stand down).
* No JavaScript errors were logged during the whole walkthrough.
