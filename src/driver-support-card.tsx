import type { DriverLocationDiagnostics } from './driver-location-diagnostics';
import { Card, Txt, useCopy } from './ui';

const labels = {
  en: {
    title: 'Delivery location support', fix: 'Last accepted fix', acknowledgement: 'Last server acknowledgement',
    requested: 'Tracking requested', registration: 'Background task registration', service: 'Android foreground service', retry: 'Next retry',
    yes: 'Yes', no: 'No', unknown: 'Unknown', notRecorded: 'Not recorded', registered: 'Registered', unregistered: 'Not registered',
    not_applicable: 'Not applicable', fresh_fix: 'On the next fresh fix, subject to cadence; time is not guaranteed', none: 'No retry requested',
    serviceUnknown: 'Unknown — task registration does not confirm a running OS service',
  },
  ar: {
    title: 'دعم موقع التوصيل', fix: 'آخر قراءة موقع مقبولة', acknowledgement: 'آخر تأكيد من الخادم',
    requested: 'طلب تتبّع الموقع', registration: 'تسجيل مهمة الخلفية', service: 'خدمة أندرويد في المقدمة', retry: 'المحاولة التالية',
    yes: 'نعم', no: 'لا', unknown: 'غير معروف', notRecorded: 'غير مسجّل', registered: 'مسجّلة', unregistered: 'غير مسجّلة',
    not_applicable: 'لا ينطبق', fresh_fix: 'عند قراءة موقع جديدة حسب وتيرة الإرسال؛ لا يوجد موعد مضمون', none: 'لا توجد محاولة مطلوبة',
    serviceUnknown: 'غير معروف — تسجيل المهمة لا يؤكد تشغيل خدمة نظام التشغيل',
  },
};

// Presentation only: opening support cannot start tracking, request permission or send a location.
export function DriverSupportCard({ diagnostics }: { diagnostics: DriverLocationDiagnostics }) {
  const { language } = useCopy();
  const text = labels[language];
  const time = (value: number | null) => value === null ? text.notRecorded : new Date(value).toLocaleString(language);
  const rows = [
    [text.fix, time(diagnostics.lastAcceptedFixAt)],
    [text.acknowledgement, time(diagnostics.lastServerAcknowledgementAt)],
    [text.requested, diagnostics.requested === null ? text.unknown : diagnostics.requested ? text.yes : text.no],
    [text.registration, text[diagnostics.registration]],
    [text.service, diagnostics.foregroundService === 'unknown' ? text.serviceUnknown : text.not_applicable],
    [text.retry, text[diagnostics.nextRetry]],
  ];
  return <Card>
    <Txt variant="title" header>{text.title}</Txt>
    {rows.map(([label, value]) => <Txt key={label} variant="body" style={{ marginTop: 8 }}>{label}: {value}</Txt>)}
  </Card>;
}
