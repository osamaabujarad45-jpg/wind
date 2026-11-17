const { AndroidConfig, withAndroidManifest } = require('expo/config-plugins');

module.exports = config => withAndroidManifest(config, mod => {
  const manifest = mod.modResults.manifest;
  const permission = 'android.permission.RECEIVE_BOOT_COMPLETED';
  manifest['uses-permission'] ??= [];
  if (!manifest['uses-permission'].some(item => item.$['android:name'] === permission)) {
    manifest['uses-permission'].push({ $: { 'android:name': permission } });
  }
  const application = AndroidConfig.Manifest.getMainApplicationOrThrow(mod.modResults);
  application.receiver ??= [];
  const name = 'expo.modules.deadlinewake.DeadlineWakeReceiver';
  application.receiver = application.receiver.filter(item => item.$['android:name'] !== name);
  application.receiver.push({
    $: { 'android:name': name, 'android:exported': 'false' },
    'intent-filter': [{ action: ['BOOT_COMPLETED', 'USER_UNLOCKED', 'TIME_SET', 'TIMEZONE_CHANGED', 'MY_PACKAGE_REPLACED']
      .map(action => ({ $: { 'android:name': `android.intent.action.${action}` } })) }],
  });
  return mod;
});
