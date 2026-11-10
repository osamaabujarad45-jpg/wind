#!/bin/sh
# Run on the VM: deploy.sh <image tag> <sha256:digest> <source revision>.
# The tag only names the release and its rollback container. The image is pulled and run by digest, and its revision
# label must be the gated commit, so a tag that moved after the release was checked cannot change what runs.
# Takes a verified backup, starts the new image beside a named rollback container, and goes back by itself if the new
# one does not start or is not ready after 30 checks (one to two and a half minutes). The database and routing graph stay on the host. Going back restores the
# code only: migrations are additive, and the backup is there if one ever is not.
set -eu
die() { echo "$1" >&2; exit 2; }
hex() { case "$1" in ''|*[!0-9a-f]*) return 1 ;; esac; [ "${#1}" -eq "$2" ]; }
[ $# -eq 3 ] || die "usage: deploy.sh <image tag> <sha256:digest> <source revision>"
tag=$1 digest=$2 revision=$3
case "$tag" in ''|*[!A-Za-z0-9._-]*) die "bad image tag" ;; esac
case "$digest" in sha256:*) hex "${digest#sha256:}" 64 || die "digest must be sha256:<64 hex>" ;; *) die "digest must be sha256:<64 hex>" ;; esac
hex "$revision" 40 || die "revision must be the full 40-hex commit"
image=windprodacr.azurecr.io/wind-api@$digest
old=wind-api-pre-$tag
# A tag deployed before still owns its rollback container: replacing it would lose the way back.
if docker inspect "$old" >/dev/null 2>&1; then die "$old exists: $tag was already deployed"; fi
docker pull "$image"
built=$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$image")
if [ "$built" != "$revision" ]; then
  echo "image $digest was built from '$built', not $revision: not deploying" >&2
  exit 1
fi
id=$(docker image inspect --format '{{.Id}}' "$image")
/srv/wind-backup.sh
docker stop wind-api
docker rename wind-api "$old" || { docker start wind-api; exit 1; }
start() {
  docker run -d --name wind-api --restart unless-stopped --network windnet -p 127.0.0.1:4000:4000 \
    --env-file /srv/wind-api.env -v /srv/wind-data:/data --log-opt max-size=20m --log-opt max-file=5 \
    --health-cmd "node -e \"fetch('http://127.0.0.1:4000/api/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))\"" \
    --health-interval 30s --health-timeout 5s --health-start-period 15s "$1" >/dev/null
}
rollback() {
  echo "$1: rolling back" >&2
  docker logs --tail 40 wind-api >&2 || true
  docker rm -f wind-api 2>/dev/null || true
  docker rename "$old" wind-api
  docker start wind-api
  exit 1
}
start "$image" || rollback "new image did not start"
[ "$(docker inspect --format '{{.Image}}' wind-api)" = "$id" ] || rollback "running image is not $digest"
for _ in $(seq 1 30); do
  if curl -fsS -m 3 http://127.0.0.1:4000/api/ready >/dev/null 2>&1; then
    echo "deployed $tag: $digest from $revision; rollback container: $old"
    exit 0
  fi
  sleep 2
done
rollback "new image is not ready"
