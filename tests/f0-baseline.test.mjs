import assert from 'node:assert/strict';
import { collectBaseline, parseLaunch, summarize } from '../scripts/f0-baseline.mjs';

const cold = 'Starting: Intent { cmp=ps.wind.app/.MainActivity }\r\nStatus: ok\r\nLaunchState: COLD\r\nActivity: ps.wind.app/.MainActivity\r\nTotalTime: 940\r\nWaitTime: 953\r\nComplete\r\n';
const warm = 'Warning: Activity not started, its current task has been brought to the front\nStatus: ok\nLaunchState: HOT\nActivity: ps.wind.app/.MainActivity\nWaitTime: 74\nComplete\n';

assert.deepEqual(parseLaunch(cold), { launchState: 'COLD', totalTimeMs: 940, waitTimeMs: 953 });
assert.deepEqual(parseLaunch(warm), { launchState: 'HOT', totalTimeMs: null, waitTimeMs: 74 });
assert.throws(() => parseLaunch(cold.replace('Status: ok', 'Status: timeout')), /launch failed/i);
assert.throws(() => parseLaunch(cold.replace('WaitTime: 953', '')), /WaitTime/);
assert.throws(() => parseLaunch(warm.replace('its current task has been brought to the front',
  'intent has been delivered to currently running top-most instance.')), /launch failed/i);
assert.deepEqual(summarize([null, 30, 10, 0, 15]), { count: 4, p50: 10, p95: 30, min: 0, max: 30 });
assert.equal(summarize([null]), null);

const serial = 'R5CTB0FJP9Z';
const calls = [];
const options = { runs: 1, packageName: 'ps.wind.app' };
const stub = ({ warmPid = '1234', devices = `${serial}\tdevice\r\n` } = {}) => (...args) => {
  calls.push(args);
  if (args[0] === 'devices') return `List of devices attached\r\n${devices}\r\n`;
  assert.deepEqual(args.slice(0, 3), ['-s', serial, 'shell']);
  const command = args.slice(3).join(' ');
  if (command.startsWith('cmd package resolve-activity --brief ')) return 'priority=0 match=0x108000\nps.wind.app/.MainActivity\n';
  if (command === 'getprop ro.product.model') return 'SM-A5360\r\n';
  if (command === 'getprop ro.build.version.release') return '16\r\n';
  if (command === 'dumpsys package ps.wind.app') return 'Packages:\n  Package [ps.wind.app]:\n    versionCode=44 minSdk=24\n    versionName=1.1.6\n';
  if (command === 'am force-stop --user current ps.wind.app' || command === 'input keyevent KEYCODE_HOME') return '';
  if (command === 'pidof ps.wind.app') return calls.some(call => call.includes('KEYCODE_HOME')) ? warmPid : '1234';
  if (command.startsWith("am start -W -n 'ps.wind.app/.MainActivity' ")) return calls.some(call => call.includes('KEYCODE_HOME')) ? warm : cold;
  assert.fail(`Unexpected adb command: ${command}`);
};
const noDelay = async () => {};

const baseline = await collectBaseline(options, stub(), noDelay);
assert.deepEqual(baseline.device, { serial, model: 'SM-A5360', androidVersion: '16' });
assert.deepEqual(baseline.app, { packageName: 'ps.wind.app', activity: 'ps.wind.app/.MainActivity', versionCode: 44, versionName: '1.1.6' });
assert.deepEqual(baseline.samples, { cold: [parseLaunch(cold)], warm: [parseLaunch(warm)] });
assert.deepEqual(baseline.statistics.warm, { totalTimeMs: null, waitTimeMs: { count: 1, p50: 74, p95: 74, min: 74, max: 74 } });
assert.deepEqual(calls.filter(call => call[3] === 'am' || call[3] === 'input').map(call => call.slice(3, 5)), [
  ['am', 'force-stop'], ['am', 'start'], ['input', 'keyevent'], ['am', 'start'],
]);

calls.length = 0;
const multiple = stub({ devices: `${serial}\tdevice\r\nother\toffline\r\n` });
await assert.rejects(collectBaseline(options, multiple, noDelay), /--serial/);
assert.deepEqual(calls, [['devices']]);
await collectBaseline({ ...options, serial }, multiple, noDelay);

calls.length = 0;
await assert.rejects(collectBaseline(options, stub({ warmPid: '9876' }), noDelay), /process changed/i);
console.log('F0 baseline: ADB parsing, launch sequence, device selection and nearest-rank statistics passed');
