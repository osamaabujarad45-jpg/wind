// Wind Web Push (SPEC-web-push.md). The payload is { kind, order, url, lang }: no names, places or message text.
const words = {
  ar: { title: 'ويند', assigned: 'قبل سائق طلبك', at_pickup: 'وصل السائق إلى نقطة الاستلام', in_transit: 'طلبك في الطريق',
    completed: 'تم التسليم', returned: 'أُعيد الطلب إلى المرسل', message: 'رسالة جديدة بخصوص الطلب', job: 'طلب جديد متاح لك' },
  en: { title: 'Wind', assigned: 'A driver accepted your order', at_pickup: 'Your driver is at pickup', in_transit: 'Your order is on its way',
    completed: 'Delivered', returned: 'Returned to the sender', message: 'New message about your order', job: 'A new job is available' },
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
    tag: data.kind === 'job' ? 'jobs' : `order-${data.order}`, renotify: true,
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
