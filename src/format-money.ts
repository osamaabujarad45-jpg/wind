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

/** User-facing amounts are in whole shekels. Callers convert agorot before formatting. */
export function formatMoney(amount: number, language: keyof typeof locales, currency: string) {
  const { whole, decimal } = formatters[language];
  const digits = (Number.isInteger(amount) ? whole : decimal).format(Math.abs(amount));
  // Keep the currency and amount on the same line.
  return `${amount < 0 ? '−' : ''}${currency}\u00a0${digits}`;
}
