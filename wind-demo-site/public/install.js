const toggle = document.getElementById('language');
const copy = document.getElementById('copy-link');
const status = document.getElementById('copy-status');
let language = navigator.language.startsWith('ar') ? 'ar' : 'en';
function translate() {
  document.documentElement.lang = language;
  document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
  document.querySelectorAll('[data-ar][data-en]').forEach(node => { node.textContent = node.dataset[language]; });
  toggle.textContent = language === 'ar' ? 'English' : 'العربية';
  toggle.setAttribute('aria-label', language === 'ar' ? 'Read in English' : 'اقرأ بالعربية');
  document.title = document.querySelector('h1').textContent;
  status.textContent = '';
}
toggle.hidden = false;
toggle.addEventListener('click', () => { language = language === 'ar' ? 'en' : 'ar'; translate(); });
copy.hidden = false;
copy.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(new URL('/install.html', location.origin).href);
    status.textContent = language === 'ar' ? 'نُسخ رابط التثبيت. أرسله وافتحه في Safari.' : 'Install link copied. Send it and open it in Safari.';
  } catch {
    status.textContent = language === 'ar' ? 'تعذر النسخ. استخدم مشاركة في Safari لإرسال هذه الصفحة.' : 'Copy is unavailable. Use Safari’s Share menu to send this page.';
  }
});
const standalone = navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
document.getElementById('installed').hidden = !standalone;
document.getElementById('steps').hidden = standalone;
translate();
