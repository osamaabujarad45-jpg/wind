# SPEC: pending-driver-help

Status: loop 22, 8 Oct 2026, owner standing instruction (fill gaps and fix wrong logic).

## Problem (measured)

Production Wind had 3 drivers waiting in `pending` (8 Oct). Their screen said «حسابك بانتظار الموافقة. تواصل مع
الدعم لمعرفة المطلوب.» with no button. Production sets no support line (`EXPO_PUBLIC_SUPPORT_WHATSAPP` /
`EXPO_PUBLIC_SUPPORT_CONTACT` are absent from the served bundle), so every support link in the app is hidden and the
instruction cannot be followed.

## Design (client only)

- With a support line configured: «يتحقق فريق ويند من بياناتك قبل أول طلب. راسلنا لترتيب التحقق، ثم تظهر لك الطلبات هنا.» plus «راسلنا على واتساب» (or «تواصل مع الدعم» when the line is email or a web page). Updated 9 Nov 2026.
- Without one: «وصل طلبك لفريق ويند. سنتصل بك على <phone> لترتيب التحقق، ثم تظهر لك الطلبات هنا.» Admins are now
  alerted on every driver signup (SPEC-driver-signup-alert.md), so the call-back is a promise the system supports.

## Owner action

Set the support WhatsApp number (`EXPO_PUBLIC_SUPPORT_WHATSAPP`, international digits, e.g. 970599…) for the web
build and the next APK. Until then the Help page says WhatsApp support is unavailable and other "contact support"
messages have no link.

## Acceptance criteria

Both variants rendered and checked in screenshots (the no-support one from a one-off capture); tsc, lint, `npm test`.
