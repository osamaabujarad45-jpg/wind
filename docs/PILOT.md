# Running the Wind pilot

For the owner. Parcels only, one city first, couriers and customers you know.

## Before the first invite

1. Sign in on the admin account and open **Settings**: confirm the ₪20 parcel price and the commission.
2. Do one real delivery yourself with one courier, a real parcel and real cash.
3. Keep a simple record of cash handed over, on paper or in WhatsApp. Backups run nightly, so a server failure can lose up to a day.

## Inviting people

Send the APK link with this message. Android asks to allow installing from this source once.

> السلام عليكم، هذه نسخة تجريبية من تطبيق ويند لتوصيل الطرود. حمّل التطبيق من الرابط، وسجّل برقم جوالك وبريدك الصحيح (نستخدم البريد لاسترجاع كلمة المرور).
> الدفع نقدًا للسائق. أعطِ السائق رمز التسليم عند الاستلام فقط.
> لأي ملاحظة: «حسابي» ← «المساعدة والدعم» ← «أرسل رأيك في التطبيق». رأيك يهمنا جدًا.

iPhone users can use the web app at <https://windapi236.swedencentral.cloudapp.azure.com> in the browser. Closed-app alerts there depend on the browser.

## Couriers

1. The courier registers in the app and chooses to work as a driver.
2. Open **Users** in admin, check who they are, and approve them. Nobody takes jobs until approved.
3. Tell them: keep location on, allow background location, and do not force-close the app while on a job.
4. Routes are not a guarantee of permitted roads or a West Bank boundary. A sandbox route crossed the Green Line. Routing avoids checkpoints reported closed, but does not establish permits or current gate access. The courier must confirm the usable road; drive times are uncalibrated estimates.

## Every day

- **Dashboard:** orders stuck searching, and the backup warning.
- **Cash:** owed against what was handed over.
- **Phone two or three users.** Feedback arrives on WhatsApp +972597127547.

## What to ask them

Did the courier find the place? Was the price fair for the courier? Did the alert arrive with the app closed? What confused you? Would you use it again?

Watch for: the flat ₪20 on long trips, password-reset email landing in spam, and couriers missing jobs because Android killed the app.

## When something goes wrong

| Problem | Do this |
|---|---|
| Forgot password | Follow the recovery option actually shown on sign-in. Email recovery requires a configured provider; check spam when a link was requested. Otherwise contact support for an identity-checked admin reset. |
| Courier blocked while carrying a parcel | Phone them: they are not told. |
| Customer cannot be blocked | They have an open order. Cancel it or wait for delivery. |
| Server down | The hourly GitHub Uptime workflow checks readiness; notification receipt and a minutes-level alert are not yet proven. See `docs/operations/restore.md`. |

## Known limits of this pilot

- Phone numbers and email are not verified at signup, so a mistyped email can lose an account to whoever owns that address. Only invite people you know.
- TalkBack has never been tried by a person.
- The Firebase project is named `wind-development` and is used for production alerts.
- Rides and freight are off. Public parcels and PostgreSQL cutover precede rides. Service configuration alone does not enable dispatch/presence or boarding: those have separate runtime gates and require reviewed activation plus owner authorization. Simulated-GPS Chrome journeys do not establish native or road acceptance. Freight remains later scope.
- Only the owner's legal review can say whether this may run commercially; none has been done.
