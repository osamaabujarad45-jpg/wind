import { Pressable } from 'react-native';
import type { DriverLocationDiagnostics } from './driver-location-diagnostics';
import { useFormat } from './parts';
import { useTheme } from './theme-context';
import { Card, Row, Txt, useCopy } from './ui';

// Presentation only: opening support cannot start tracking, request permission or send a location.
// Collapsed by default: the facts are for a support call, not for the driver's everyday job list.
export function DriverSupportCard({ diagnostics, open, onToggle }: { diagnostics: DriverLocationDiagnostics; open: boolean; onToggle: () => void }) {
  const { palette } = useTheme();
  const { c } = useCopy();
  const { time } = useFormat();
  const recordedAt = (value: number | null) => value === null ? c.locSupport_notRecorded : time(value);
  const registration = { registered: c.locSupport_registered, unregistered: c.locSupport_unregistered, unknown: c.locSupport_unknown,
    not_applicable: c.locSupport_notApplicable }[diagnostics.registration];
  const retry = { fresh_fix: c.locSupport_freshFix, none: c.locSupport_none, unknown: c.locSupport_unknown }[diagnostics.nextRetry];
  const rows = [
    [c.locSupport_fix, recordedAt(diagnostics.lastAcceptedFixAt)],
    [c.locSupport_acknowledgement, recordedAt(diagnostics.lastServerAcknowledgementAt)],
    [c.locSupport_requested, diagnostics.requested === null ? c.locSupport_unknown : diagnostics.requested ? c.locSupport_yes : c.locSupport_no],
    [c.locSupport_registration, registration],
    [c.locSupport_service, diagnostics.foregroundService === 'unknown' ? c.locSupport_serviceUnknown : c.locSupport_notApplicable],
    [c.locSupport_retry, retry],
  ];
  return <Card>
    <Row style={{ justifyContent: 'space-between', minHeight: 44 }}>
      {/* the title stays a heading for screen-reader navigation; only the action is the button */}
      <Txt variant="title" header style={{ flex: 1 }}>{c.locSupport_title}</Txt>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={`${open ? c.locSupport_hide : c.locSupport_show}: ${c.locSupport_title}`}
        onPress={onToggle} hitSlop={13} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
        {/* label is ~18px tall; 13px slop each side brings the target to 44pt */}
        <Txt variant="label" style={{ color: palette.olive }}>{open ? c.locSupport_hide : c.locSupport_show}</Txt>
      </Pressable>
    </Row>
    {open && rows.map(([label, value]) => <Txt key={label} variant="body" style={{ marginTop: 8 }}>{label}: {value}</Txt>)}
  </Card>;
}
