export type PhoneNumber = { display: string; e164: string; canonicalGroup: string; national: string;
  callingCode: '970'|'972'; countryContext: 'PS'; aliases: string[] };

/** Explicit Palestinian mobile scope only. A numbering context is not a nationality assertion. */
export function parsePhoneNumber(value: unknown, context: unknown): PhoneNumber | null {
  if (typeof value!=='string' || value.length>64 || context!=='PS') return null;
  const display=value.trim();
  let digits=display.replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-0x660)).replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-0x6f0)).replace(/[\s().-]/g,'');
  if (digits.startsWith('00')) digits='+'+digits.slice(2);
  let callingCode: '970'|'972'='970',national: string;
  const international=/^\+(970|972)(5[69]\d{7})$/.exec(digits);
  if (international) { callingCode=international[1] as '970'|'972'; national=international[2]; }
  else if (/^05[69]\d{7}$/.test(digits)) national=digits.slice(1);
  else if (/^5[69]\d{7}$/.test(digits)) national=digits;
  else return null;
  // Preserve the supplied international form; equivalence exists only as a reviewed mapping.
  return {display,e164:`+${callingCode}${national}`,canonicalGroup:`+970${national}`,national:`0${national}`,
    callingCode,countryContext:'PS',aliases:[`+970${national}`,`+972${national}`]};
}
