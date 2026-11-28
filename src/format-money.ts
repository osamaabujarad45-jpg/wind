const locales = { ar: 'ar-PS-u-nu-latn', en: 'en-GB' };

const formatters = {
  ar: createFormatters(locales.ar),
  en: createFormatters(locales.en),
};

function createFormatters(locale: string) {
  return {
    whole: new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }),
    decimal: new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  };
}

/** User-facing amounts are in shekels. Callers convert agorot before formatting. */
export function formatMoney(amount: number, language: keyof typeof locales, currency: string) {
  if (!Number.isFinite(amount)) return '—';
  const { whole, decimal } = formatters[language];
  const formatter = Number.isInteger(amount) ? whole : decimal;
  const digits = formatter.format(Math.abs(amount));
  const sign = amount < 0 && digits !== formatter.format(0) ? '−' : '';
  // Keep the sign, currency and amount on the same line: a word joiner stops a break between the minus and the shekel sign.
  return `${sign && `${sign}\u2060`}${currency}\u00a0${digits}`;
}
