# Running the Wind pilot

For the owner. From 1.1.6 (23 November 2026) the pilot runs three services in one app: **rides** (private car or shared
seats, in town and between towns), **parcels**, and **orders from shops and restaurants** in Tulkarm. Start with people you know.

Production: <https://20.217.202.98.sslip.io>. Install page for everyone: <https://20.217.202.98.sslip.io/install.html>.

## Before the first invite

1. Sign in on the admin account and open **Settings**: check the ride price (base and per km), the shared seat discount
   (70% off the private fare per seat by default), the ₪20 parcel price and the commission.
2. Do one real trip of each kind yourself: a ride with one driver, a parcel, and a shop order from a shop you signed.
3. Keep a simple record of cash handed over, on paper or in WhatsApp. Backups run every hour and are copied off the server.

## Inviting people

Send the install link with this message. Android downloads the app; iPhone opens it in Safari and adds it to the Home Screen.

> السلام عليكم، هذا تطبيق ويند: مشاوير داخل البلد وبين المدن (سيارة خاصة أو مقعد مشترك أرخص)، توصيل طرود، وطلبات من المحلات والمطاعم.
> حمّل التطبيق من هذا الرابط: https://20.217.202.98.sslip.io/install.html
> سجّل برقم جوالك. الدفع نقداً للسائق، وبعد الدفع أعطه رمز الرحلة أو رمز التسليم الظاهر في التطبيق.
> لأي ملاحظة: «حسابي» ← «المساعدة والدعم».

## How each service works

**Ride.** The customer opens the app and sees nearby cars on the map, taps *Where to?*, chooses **private car** or
**shared seats** and the number of seats, and requests. Drivers accept the suggested price or offer their own (from half to
twice the suggestion); the customer picks one offer, follows the car on the map and chats with the driver if the price or
the meeting point needs a word. At the drop-off the customer pays cash and then gives the driver the **trip code**; the
driver enters it to finish.

**Shared seats between towns.** A driver going, say, Tulkarm → Ramallah sets *Heading to* Ramallah on the jobs screen. The
screen then shows riders and parcels **along the way** (Anabta, Nablus, Salfit…), never ones going backwards. The driver can
take several shared riders and parcels at once while the car has seats (a car 4, a motorcycle 1). A private ride, a load or
a shop order is taken alone.

**Parcel.** Fixed price; the sender gives the delivery code to the recipient, who gives it to the driver.

**Shop and restaurant orders (Tulkarm).** A shop owner signs up as a customer, opens **Account → My shop** (محلي) and
applies (category: restaurant, grocery, bakery or everyday goods). You approve it in **Admin → Approvals**, then set its terms
in **Admin → Shops**. The owner adds items and prices in merchant mode, accepts each order with a preparation time and marks it
ready; a captain collects it with the shop's pickup code and the customer pays cash at the door.

## Drivers

1. The driver registers in the app and chooses to work as a driver.
2. Open **Approvals** in admin, check who they are (ID, licence, plate), and approve them. Nobody takes jobs until approved.
3. Tell them: allow location, keep the jobs screen open when they want work (nearby customers then see a car where they
   are), and do not force-close the app while on a job.
4. Routes are not a guarantee of permitted roads. Routing avoids checkpoints reported closed, but the driver confirms the
   usable road.

## Every day

- **Dashboard:** orders stuck searching, shop orders that need attention, and the backup warning.
- **Cash:** owed against what was handed over.
- **Phone two or three users.** Feedback arrives on WhatsApp +972597127547.

## What to ask them

Did the driver find you? Was the price fair, for you and for the driver? Was the shared ride comfortable? Did the shop
order arrive right and on time? What confused you? Would you use it again?

## When something goes wrong

| Problem | Do this |
|---|---|
| Forgot password | Follow the recovery option shown on sign-in, or do an identity-checked admin reset. |
| The rider cannot give the trip code (phone off) | Admin opens the order and resets the code after phoning both. |
| Courier blocked while carrying a parcel | Phone them: they are not told. |
| Server down | The hourly Uptime workflow checks readiness; see `docs/operations/restore.md`. |

## Known limits of this pilot

- **Notifications with the app closed work on Android from app 1.1.6 (versionCode 44)**, live since 26 November. iPhones and older
  Android builds alert only while the app is open, so ask those drivers to keep the jobs screen open while waiting.
- Phone numbers are not verified by SMS at signup. Only invite people you know.
- iPhone is a Home Screen web app: location for a driver works only while the app is open.
- Passenger transport permission and insurance (G-RIDE) and the shop food-handling rules are the owner's legal side; no
  counsel review has been done.
