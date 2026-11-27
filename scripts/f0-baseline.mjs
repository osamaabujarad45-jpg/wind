// F0 measures Android Activity Manager launch timing on an unlocked physical phone.
// Start with a signed-in release build. Keep the phone awake and idle during the run.
// ADB cannot apply the design's 3G profile to an unrooted phone. Use unshaped Wi-Fi/LTE
// and label it, or use an externally shaped Wi-Fi hotspot and verify the path to each
// origin. A hotspot does not shape a loopback API over adb reverse. Use --conditions
// to record the actual network, API/map provider, app language, text size and APK SHA.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const root = fileURLToPath(new URL('../', import.meta.url));
const launcherIntent = ['-a', 'android.intent.action.MAIN', '-c', 'android.intent.category.LAUNCHER'];
const foregroundDwellMs = 3000;
const homeDwellMs = 1000;
const unmeasured = [
  'Launch to usable controls, return to a rendered screen, and typing or step-change latency.',
  'Ride, parcel and shop journey timings, including quote latency after input settles.',
  'First useful map tiles, text-route readiness, map asset stages and reloads across routes.',
  'Mode switch timings, which also require the profile-switch feature.',
];

function findAdb() {
  const windows = process.platform === 'win32';
  const executable = windows ? 'adb.exe' : 'adb';
  const { ANDROID_HOME, LOCALAPPDATA } = process.env;
  const sdkPaths = [ANDROID_HOME, windows && LOCALAPPDATA && join(LOCALAPPDATA, 'Android', 'Sdk')];
  for (const sdk of sdkPaths) {
    if (!sdk) continue;
    const path = join(sdk, 'platform-tools', executable);
    if (existsSync(path)) return path;
  }
  return executable;
}

function selectDevice(output, serial) {
  const lines = output.split(/\r?\n/).slice(1).filter(line => line.trim());
  const devices = lines.map(line => line.trim().split(/\s+/, 2));
  if (!serial && devices.length > 1) throw new Error('Multiple devices attached. Specify --serial.');
  const selected = serial ? devices.find(([id]) => id === serial) : devices[0];
  if (!selected) throw new Error(serial ? `Device ${serial} is not listed by adb.` : 'No device is listed by adb.');
  if (selected[1] !== 'device') throw new Error(`Device ${selected[0]} is ${selected[1]}. Connect and authorize it first.`);
  if (selected[0].startsWith('emulator-')) throw new Error('Use a physical Android device for the F0 baseline.');
  return selected[0];
}

export function parseLaunch(output) {
  // Bringing the task to the front is a valid HOME return. Other non-start outcomes are not samples.
  const skipped = output.match(/^\s*Warning: Activity not started([^\r\n]*)/m)?.[1];
  const invalidStart = skipped !== undefined && !/^, its current task has been brought to the front\.?$/.test(skipped);
  if (invalidStart || /^\s*Error(?:\s|:)/m.test(output) || !/^\s*Status: ok\s*$/m.test(output) || !/^\s*Complete\s*$/m.test(output)) {
    throw new Error(`Android launch failed: ${output.trim()}`);
  }
  const totalTime = output.match(/^\s*TotalTime: (\d+)\s*$/m);
  const waitTime = output.match(/^\s*WaitTime: (\d+)\s*$/m);
  if (!waitTime) throw new Error(`Android launch did not report WaitTime: ${output.trim()}`);
  return {
    launchState: output.match(/^\s*LaunchState: ([A-Z]+)\s*$/m)?.[1] ?? null,
    totalTimeMs: totalTime ? Number(totalTime[1]) : null,
    waitTimeMs: Number(waitTime[1]),
  };
}

export function summarize(values) {
  const sorted = values.filter(value => value !== null).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const count = sorted.length;
  const percentile = p => sorted[Math.ceil(p * count) - 1];
  return { count, p50: percentile(0.5), p95: percentile(0.95), min: sorted[0], max: sorted.at(-1) };
}

export async function collectBaseline({ packageName, serial, runs }, adb, pause = delay) {
  if (!/^[A-Za-z][\w]*(?:\.[A-Za-z][\w]*)+$/.test(packageName)) throw new Error('Invalid Android package name.');
  if (!Number.isSafeInteger(runs) || runs < 1) throw new Error('--runs must be a positive integer.');

  const deviceSerial = selectDevice(adb('devices'), serial);
  const shell = (...args) => adb('-s', deviceSerial, 'shell', ...args).trim();
  const resolved = shell('cmd', 'package', 'resolve-activity', '--brief', ...launcherIntent, packageName);
  const activity = resolved.split(/\r?\n/).at(-1);
  const [activityPackage, activityClass, ...extra] = activity.split('/');
  if (activityPackage !== packageName || !/^[.\w$]+$/.test(activityClass ?? '') || extra.length) {
    throw new Error(`No launcher activity for ${packageName}: ${resolved}`);
  }
  const device = {
    serial: deviceSerial,
    model: shell('getprop', 'ro.product.model'),
    androidVersion: shell('getprop', 'ro.build.version.release'),
  };
  const info = shell('dumpsys', 'package', packageName);
  const versionCode = info.match(/^\s*versionCode=(\d+)\b/m)?.[1];
  const versionName = info.match(/^\s*versionName=([^\r\n]+)$/m)?.[1]?.trim();
  if (!versionCode || !versionName) throw new Error(`Unable to read versionCode and versionName for ${packageName}.`);
  const app = { packageName, activity, versionCode: Number(versionCode), versionName };

  // ADB joins shell arguments into a command string. Quote the component to preserve '$' in class names.
  const start = () => parseLaunch(shell('am', 'start', '-W', '-n', `'${activity}'`, ...launcherIntent));
  const processId = () => shell('pidof', packageName);
  const samples = { cold: [], warm: [] };
  for (let index = 0; index < runs; index += 1) {
    try {
      shell('am', 'force-stop', '--user', 'current', packageName);
      const cold = start();
      if (cold.launchState && cold.launchState !== 'UNKNOWN' && cold.launchState !== 'COLD') {
        throw new Error(`Android reported ${cold.launchState} after force-stop.`);
      }
      const pid = processId();
      await pause(foregroundDwellMs);
      shell('input', 'keyevent', 'KEYCODE_HOME');
      await pause(homeDwellMs);
      const warm = start();
      if (!pid || processId() !== pid || warm.launchState === 'COLD') {
        throw new Error('App process changed during the HOME return.');
      }
      samples.cold.push(cold);
      samples.warm.push(warm);
    } catch (error) {
      throw new Error(`Launch pair ${index + 1}/${runs}: ${error.message}`, { cause: error });
    }
  }
  const statistics = Object.fromEntries(Object.entries(samples).map(([kind, group]) => [kind, {
    totalTimeMs: summarize(group.map(sample => sample.totalTimeMs)),
    waitTimeMs: summarize(group.map(sample => sample.waitTimeMs)),
  }]));
  return { device, app, runs, samples, statistics };
}

function markdown(result) {
  const { timestamp, gitSha, device, app, runs, samples, statistics, conditions } = result;
  const rows = Object.entries(statistics).flatMap(([kind, metrics]) =>
    Object.entries(metrics).map(([metric, summary]) => summary
      ? `| ${kind} | ${metric} | ${summary.count}/${runs} | ${summary.p50} | ${summary.p95} | ${summary.min} | ${summary.max} |`
      : `| ${kind} | ${metric} | 0/${runs} | — | — | — | — |`));
  return [
    '# F0 Android launch baseline',
    '',
    `- Run started at ${timestamp}. Harness git SHA \`${gitSha}\`.`,
    `- ${device.model} running Android ${device.androidVersion} (\`${device.serial}\`).`,
    `- \`${app.packageName}\` ${app.versionName} (versionCode ${app.versionCode}), launcher \`${app.activity}\`.`,
    `- Operator-reported conditions: ${conditions}`,
    '',
    'The harness applies no network shaping. For unshaped runs, label Wi-Fi or LTE. To approximate 3G on a physical phone, use an externally shaped Wi-Fi hotspot and verify 1.2 Mbps down, 400 kbps up, 300 ms RTT and 1% loss. Shape and verify the loopback API path separately if using adb reverse.',
    '',
    `Each of the ${runs} pairs starts with a force-stop and launch, then ${foregroundDwellMs} ms in the foreground, HOME, ${homeDwellMs} ms in the background and a relaunch in the same process. Process-cold runs retain disk caches and app data.`,
    `Android launch states (cold / warm): ${Object.values(samples).map(group => [...new Set(group.map(sample => sample.launchState ?? 'unreported'))].join(', ')).join(' / ')}. Warm means return after HOME here and may include Android HOT launches.`,
    '',
    'Android Activity Manager timings in milliseconds. These cover the OS launch, before any app-specific usability milestone. Percentiles use nearest rank over reported values. Missing TotalTime is omitted from its statistics.',
    '',
    '| Case | Metric | Samples | p50 | p95 | Min | Max |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: |',
    ...rows,
    '',
    '## Design §7 timings awaiting F2 timing marks',
    '',
    ...unmeasured.map(metric => `- ${metric}`),
    '',
    'Compressed bytes by origin, peak memory and renderer count/growth, the location shutoff check and duplicate-write drills also need separate app or lab evidence.',
    '',
  ].join('\n');
}

async function main() {
  const { values } = parseArgs({ options: {
    runs: { type: 'string', default: '30' },
    package: { type: 'string', default: 'ps.wind.app' },
    serial: { type: 'string' },
    conditions: { type: 'string' },
    help: { type: 'boolean', short: 'h' },
  } });
  if (values.help) {
    console.log('Usage: node scripts/f0-baseline.mjs [--runs 30] [--package ps.wind.app] [--serial DEVICE] [--conditions "network, API/map provider, language, text size, APK SHA"]');
    return;
  }

  const adbPath = findAdb();
  const adb = (...args) => execFileSync(adbPath, args, { encoding: 'utf8', timeout: 60_000, windowsHide: true });
  const gitSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
  const timestamp = new Date().toISOString();
  const baseline = await collectBaseline({ packageName: values.package, serial: values.serial, runs: Number(values.runs) }, adb);
  const conditions = values.conditions?.trim().replace(/\s+/g, ' ') || 'Unreported (transport, external shaping and app conditions unknown).';
  const result = { timestamp, gitSha, conditions, foregroundDwellMs, homeDwellMs, ...baseline };
  const parent = join(root, '.artifacts', 'f0');
  mkdirSync(parent, { recursive: true });
  const out = join(parent, timestamp.replaceAll(':', '-'));
  mkdirSync(out);
  writeFileSync(join(out, 'baseline.json'), JSON.stringify(result, null, 2) + '\n');
  writeFileSync(join(out, 'summary.md'), markdown(result));
  console.log(`Wrote F0 baseline to ${out}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
