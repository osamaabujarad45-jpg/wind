#!/bin/bash
# Publish a signed Android APK on the install page (/install.html → /download/wind.apk). Run on the VM as root:
#   sudo bash publish-apk.sh /tmp/wind-1.1.6-vc43.apk <sha256> 1.1.6 43
# The SHA-256 is checked before anything moves. The versioned file is kept; wind.apk and latest.json are replaced
# atomically (a download in progress keeps reading the old file). Caddy serves /srv/wind-public (provision.sh).
set -euo pipefail
APK=${1:?apk file}
SHA=${2:?sha256 of the apk}
VERSION=${3:?version name, e.g. 1.1.6}
CODE=${4:?versionCode, e.g. 43}
[[ "$SHA" =~ ^[0-9a-f]{64}$ ]] || { echo "invalid sha256" >&2; exit 1; }
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "invalid version" >&2; exit 1; }
[[ "$CODE" =~ ^[0-9]{1,6}$ ]] || { echo "invalid versionCode" >&2; exit 1; }
[ -f "$APK" ] || { echo "no such file: $APK" >&2; exit 1; }
echo "$SHA  $APK" | sha256sum -c - >/dev/null || { echo "sha256 mismatch" >&2; exit 1; }
# An APK is a zip: refuse anything else before it reaches phones.
[ "$(head -c 2 "$APK")" = "PK" ] || { echo "not an APK" >&2; exit 1; }
DIR=/srv/wind-public/download
install -d -m 755 /srv/wind-public "$DIR"
NAME="wind-$VERSION-vc$CODE.apk"
install -m 644 "$APK" "$DIR/.$NAME.new" && mv -f "$DIR/.$NAME.new" "$DIR/$NAME"
cp -f "$DIR/$NAME" "$DIR/.wind.apk.new" && chmod 644 "$DIR/.wind.apk.new" && mv -f "$DIR/.wind.apk.new" "$DIR/wind.apk"
BYTES=$(stat -c %s "$DIR/wind.apk")
printf '{"version":"%s","versionCode":%s,"bytes":%s,"sha256":"%s","file":"%s","publishedAt":%s}\n' \
  "$VERSION" "$CODE" "$BYTES" "$SHA" "$NAME" "$(date +%s)000" > "$DIR/.latest.json.new"
chmod 644 "$DIR/.latest.json.new" && mv -f "$DIR/.latest.json.new" "$DIR/latest.json"
echo "published $NAME ($BYTES bytes)"
