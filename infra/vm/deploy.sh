#!/bin/sh
# Run on the VM: deploy.sh <image tag>. Takes a verified backup, starts the new image beside a named rollback container,
# and goes back by itself if the new one does not start or is not ready in 60 s. The database and routing graph stay on the
# host. Going back restores the code only: migrations are additive, and the backup is there if one ever is not.
set -eu
tag=$1
image=windprodacr.azurecr.io/wind-api:$tag
docker pull "$image"
/srv/wind-backup.sh
old=wind-api-pre-$tag
docker rm -f "$old" 2>/dev/null || true
docker stop wind-api
docker rename wind-api "$old"
start() {
  docker run -d --name wind-api --restart unless-stopped --network windnet -p 127.0.0.1:4000:4000 \
    --env-file /srv/wind-api.env -v /srv/wind-data:/data --log-opt max-size=20m --log-opt max-file=5 \
    --health-cmd "node -e \"fetch('http://127.0.0.1:4000/api/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))\"" \
    --health-interval 30s --health-timeout 5s --health-start-period 15s "$1" >/dev/null
}
rollback() {
  echo "new image is not ready: rolling back" >&2
  docker logs --tail 40 wind-api >&2 || true
  docker rm -f wind-api 2>/dev/null || true
  docker rename "$old" wind-api
  docker start wind-api
  exit 1
}
start "$image" || rollback
for _ in $(seq 1 30); do
  if curl -fsS -m 3 http://127.0.0.1:4000/api/ready >/dev/null 2>&1; then
    echo "deployed $tag; rollback container: $old"
    exit 0
  fi
  sleep 2
done
rollback
