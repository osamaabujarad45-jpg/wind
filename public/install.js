const toggle = document.getElementById('language');
const copy = document.getElementById('copy-link');
const status = document.getElementById('copy-status');
function preferredLanguage() {
  try {
    const saved = localStorage.getItem('language');
    if (saved === 'ar' || saved === 'en') return saved;
  } catch { /* The install guide also works when browser storage is unavailable. */ }
  return String(navigator.language || '').startsWith('ar') ? 'ar' : 'en';
}
let language = preferredLanguage();
let apk = null; // /download/latest.json, once read: { version, versionCode, bytes, sha256 }
const megabytes = bytes => Math.max(1, Math.round(bytes / 1048576));
function describeApk() {
  const meta = document.getElementById('apk-meta'), sha = document.getElementById('apk-sha');
  if (!meta || !apk) return;
  meta.textContent = language === 'ar' ? `الإصدار ${apk.version} · ${megabytes(apk.bytes)} م.ب · أندرويد 7 أو أحدث` : `Version ${apk.version} · ${megabytes(apk.bytes)} MB · Android 7 or newer`;
  if (sha && apk.sha256) sha.textContent = `SHA-256 ${apk.sha256}`;
}
function translate() {
  document.documentElement.lang = language;
  document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
  document.querySelectorAll('[data-ar][data-en]').forEach(node => { node.textContent = node.dataset[language]; });
  toggle.textContent = language === 'ar' ? 'English' : 'العربية';
  toggle.setAttribute('aria-label', language === 'ar' ? 'Read in English' : 'اقرأ بالعربية');
  document.title = document.querySelector('h1').textContent;
  status.textContent = '';
  describeApk();
}
toggle.hidden = false;
toggle.addEventListener('click', () => {
  language = language === 'ar' ? 'en' : 'ar';
  try { localStorage.setItem('language', language); } catch { /* The choice still applies for this visit. */ }
  translate();
});
const link = typeof location === 'undefined' ? '/install.html' : new URL('/install.html', location.origin).href;
const shown = document.getElementById('install-url');
if (shown) shown.textContent = link;
copy.hidden = false;
copy.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(link);
    status.textContent = language === 'ar' ? 'نُسخ الرابط. أرسله على واتساب: أندرويد يحمّل التطبيق، وآيفون يفتحه في Safari.' : 'Link copied. Send it on WhatsApp: Android downloads the app, iPhone opens it in Safari.';
  } catch {
    status.textContent = language === 'ar' ? 'تعذر النسخ. انسخ الرابط الظاهر أعلاه.' : 'Copy is unavailable. Copy the link shown above.';
  }
});
// The phone's own section comes first; a computer shows both. iPadOS reports a Mac with touch.
const agent = String(navigator.userAgent || '');
const ios = /iPhone|iPad|iPod/i.test(agent) || (/Macintosh/i.test(agent) && navigator.maxTouchPoints > 1);
const android = /Android/i.test(agent);
const platforms = document.getElementById('platforms'), iphone = document.getElementById('iphone'), androidPart = document.getElementById('android');
if (ios && platforms && iphone && platforms.prepend) platforms.prepend(iphone);
if (ios && androidPart) androidPart.classList?.add('other');
if (android && iphone) iphone.classList?.add('other');
const standalone = navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
document.getElementById('installed').hidden = !standalone;
document.getElementById('steps').hidden = standalone;
// The APK's version, size and fingerprint, written beside it at release (infra/vm-israel/publish-apk.sh).
if (typeof fetch === 'function') fetch('/download/latest.json', { cache: 'no-cache' })
  .then(response => response.ok ? response.json() : null)
  .then(info => { if (info && typeof info.version === 'string' && Number.isFinite(info.bytes)) { apk = info; describeApk(); } })
  .catch(() => undefined);
translate();
