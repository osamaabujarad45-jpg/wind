import type { DriverLocationDiagnostics } from './driver-location-diagnostics';
import { Card, Txt, useCopy } from './ui';

// Presentation only: opening support cannot start tracking, request permission or send a location.
export function DriverSupportCard({ diagnostics }: { diagnostics: DriverLocationDiagnostics }) {
  const { c, language } = useCopy();
  const time = (value: number | null) => value === null ? c.locSupport_notRecorded : new Date(value).toLocaleString(language);
  const registration = { registered: c.locSupport_registered, unregistered: c.locSupport_unregistered, unknown: c.locSupport_unknown,
    not_applicable: c.locSupport_notApplicable }[diagnostics.registration];
  const retry = { fresh_fix: c.locSupport_freshFix, none: c.locSupport_none, unknown: c.locSupport_unknown }[diagnostics.nextRetry];
  const rows = [
    [c.locSupport_fix, time(diagnostics.lastAcceptedFixAt)],
    [c.locSupport_acknowledgement, time(diagnostics.lastServerAcknowledgementAt)],
    [c.locSupport_requested, diagnostics.requested === null ? c.locSupport_unknown : diagnostics.requested ? c.locSupport_yes : c.locSupport_no],
    [c.locSupport_registration, registration],
    [c.locSupport_service, diagnostics.foregroundService === 'unknown' ? c.locSupport_serviceUnknown : c.locSupport_notApplicable],
    [c.locSupport_retry, retry],
  ];
  return <Card>
    <Txt variant="title" header>{c.locSupport_title}</Txt>
    {rows.map(([label, value]) => <Txt key={label} variant="body" style={{ marginTop: 8 }}>{label}: {value}</Txt>)}
  </Card>;
}
