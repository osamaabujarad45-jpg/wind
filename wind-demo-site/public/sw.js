// Wind Web Push (SPEC-web-push.md). The payload is { kind, order, url, lang }: no names, places or message text.
const words = {
  ar: { title: 'ويند', assigned: 'قبل سائق طلبك', at_pickup: 'وصل السائق إلى نقطة الاستلام', in_transit: 'طلبك في الطريق',
    completed: 'تم التسليم', returned: 'أُعيد الطلب إلى المرسل', message: 'رسالة جديدة بخصوص الطلب', job: 'طلب جديد متاح لك',
    released: 'اعتذر السائق؛ نبحث لك عن سائق آخر', cancelled: 'أُلغي الطلب',
    offer: 'عرض سائق سعراً لطلبك', offer_accepted: 'قُبل سعرك: توجّه إلى الاستلام',
    on_hold: 'تعذّر التسليم؛ سيتصل بك الدعم', returning: 'سيُعاد الطلب إلى المرسل؛ افتح التطبيق لرمز الإرجاع', decided: 'قرر الدعم في مشكلة التسليم',
    approved: 'تمت الموافقة على حسابك: يمكنك قبول الطلبات', support: 'حدّث الدعم طلبك', cash: 'تغيّر رصيد النقد لديك: افتح الأرباح للتأكيد',
    attention: 'طلب يحتاج قرارك', safety: 'بلاغ سلامة جديد: افتح الطلب الآن', plan: 'تم الرد على طلب اشتراكك',
    destination_request: 'طلب الزبون تغيير الوجهة: افتح الطلب للموافقة أو الرفض', destination_accepted: 'وافق السائق على تغيير الوجهة', destination_declined: 'رفض السائق تغيير الوجهة' },
  en: { title: 'Wind', assigned: 'A driver accepted your order', at_pickup: 'Your driver is at pickup', in_transit: 'Your order is on its way',
    completed: 'Delivered', returned: 'Returned to the sender', message: 'New message about your order', job: 'A new job is available',
    released: 'Your driver dropped out; finding another', cancelled: 'The order was cancelled',
    offer: 'A driver offered a price', offer_accepted: 'Your price was accepted: go to pickup',
    on_hold: 'Delivery problem: support will contact you', returning: 'Your order is being returned: open the app for the return code', decided: 'Support decided on a delivery problem',
    approved: 'Driver account approved. You can take jobs now.', support: 'Support updated your order', cash: 'Your cash balance changed: open earnings to confirm',
    attention: 'A request needs your decision', safety: 'New safety report: open the order now', plan: 'Your plan request was answered',
    destination_request: 'The customer requested a new destination: open the order to accept or decline', destination_accepted: 'The driver accepted the new destination', destination_declined: 'The driver declined the new destination' },
};
const code = id => `W-${String(id).padStart(5, '0')}`;
const sameOrigin = value => {
  try { const url = new URL(String(value), self.location.origin); return url.origin === self.location.origin ? url.href : '/'; } catch { return '/'; }
};
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { /* unreadable payload: show the generic line */ }
  const t = words[data.lang === 'en' ? 'en' : 'ar'];
  const body = `${t[data.kind] ?? t.message}${data.order && data.kind !== 'job' ? ` · ${code(data.order)}` : ''}`;
  event.waitUntil(self.registration.showNotification(t.title, {
    body, lang: data.lang === 'en' ? 'en' : 'ar', dir: data.lang === 'en' ? 'ltr' : 'rtl',
    icon: '/icons/icon-192.png', badge: '/icons/icon-192.png',
    tag: data.kind === 'job' ? 'jobs' : data.order ? `order-${data.order}` : data.kind, renotify: true,
    data: { url: sameOrigin(data.url) },
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = sameOrigin(event.notification.data?.url ?? '/');
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const open = list.find(c => new URL(c.url).origin === self.location.origin);
    return open ? open.focus().then(c => c.navigate(url)).catch(() => self.clients.openWindow(url)) : self.clients.openWindow(url);
  }));
});
