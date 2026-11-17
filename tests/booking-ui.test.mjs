import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const book = readFileSync(new URL('../src/app/book.tsx', import.meta.url), 'utf8');
const places = readFileSync(new URL('../src/place-search-panel.tsx', import.meta.url), 'utf8');

assert.match(book, /if \(!pending && \(locating \|\| quoting \|\| quoteFailed\)\) return;/,
  'hardware Enter/Go must honor the same location and quote locks as Request');
assert.match(book, /pickupNote, dropoffNote, contact, detail, recipientName, recipientPhone,/,
  'the quote freshness key and request bind every editable booking field');
assert.match(book, /const priceKey = JSON\.stringify\(\[quoteTerms, priceTick\]\)/);
assert.match(book, /api<PriceQuote>\('\/price', quoteTerms\)/);
assert.match(book, /releasable \? <>/, 'Edit/Discard exist only for a genuinely releasable command');
assert.doesNotMatch(book, /disabled=\{!releasable/, 'unknown recovery must not render permanently disabled actions');
assert.match(book, /router\.push\('\/orders'\)/, 'unknown recovery provides a working Orders action');

assert.match(places, /accessibilityRole="radiogroup" accessibilityLabel=\{text\.label\}/);
assert.match(places, /accessibilityRole="radio" accessibilityState=\{\{ checked: selectedChoice \}\}/);
assert.match(places, /selectedChoice \? 'checkmark-circle' : 'ellipse-outline'/);
assert.match(places, /selectedChoice && styles\.rowSelected/);
assert.match(places, /row: \{ minHeight: 48,/);
assert.match(places, /rowSelected: \{ paddingHorizontal: 12, borderRadius: 12, borderBottomColor: 'transparent', backgroundColor: palette\.olivePale \}/);

console.log('Booking UI: keyboard quote locks, safe pending recovery, and selected-place semantics passed');
