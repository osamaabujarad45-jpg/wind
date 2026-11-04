#!/bin/sh
# Every minute on the VM (/etc/cron.d/wind). Docker's restart policy only catches a process that exits: this catches one that
# is up but not answering. Three failures in a row restart that container, and the restart is logged.
state=/run/wind-watchdog
mkdir -p "$state"
check() { # name, command
  if sh -c "$2" >/dev/null 2>&1; then
    rm -f "$state/$1"
    return
  fi
  count=$(( $(cat "$state/$1" 2>/dev/null || echo 0) + 1 ))
  echo "$count" > "$state/$1"
  if [ "$count" -ge 3 ]; then
    logger -t wind-watchdog "restarting $1 after $count failed checks"
    docker restart "$1" >/dev/null
    rm -f "$state/$1"
  fi
}
check wind-api "curl -fsS -m 8 http://127.0.0.1:4000/api/ready"
check wind-osrm "docker exec wind-api node -e \"fetch(process.env.OSRM_URL+'/nearest/v1/driving/35.0279,32.3116',{signal:AbortSignal.timeout(8000)}).then(r=>process.exit(r.ok?0:1),()=>process.exit(1))\""
