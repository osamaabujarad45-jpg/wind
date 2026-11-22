#!/bin/sh
# Run on the VM: build-west-bank.sh <west-bank.geojson> <output dir> [pinned source .osm.pbf]. A road graph holding only roads
# inside the West Bank, so no route leaves it (owner decision for the pilot, 6 November 2026). Builds beside the live graph:
# the output may not be the live /srv/osrm; promote a verified build by pointing the wind-osrm container at it.
# The boundary is the outer ring of OpenStreetMap relation 1803010; that relation alone is Area C, and 1613659 is Areas A and B.
# It knows nothing of permits, gates or checkpoints inside the West Bank. Geometry never proves a road is legal to drive.
# Reproducible (Fable GEO-01): the extract is kept as <out>/source.osm.pbf and BUILD-MANIFEST records its checksum and OSM
# timestamp, the boundary, image digests, the osmium version, every graph file's checksum and a fixed route corpus. OSRM's
# threaded build is not byte-identical (15 Nov 2026: same source, two builds, different graph files), so two builds agree
# when their `route` lines agree: rebuild from the kept source (third argument) and diff the two manifests' route lines.
# Memory: capped without extra swap so the live API on this 4 GiB VM keeps its RAM. osmium needs more than 1 GiB for this
# extract (OOM-killed at 1 GiB, 15 Nov) and gets 2 GiB; the OSRM steps peaked near 0.1 GiB and get 1 GiB.
set -eu
boundary=$1
out=$2
source=${3:-}
# The live graph is whatever the /srv/osrm link points at (Israel host), so the guard compares resolved paths, and an output that
# already holds a graph is refused too: osrm-extract would rewrite files under a running server (Haiku PR #104 H1).
live_link=${WIND_OSRM_LIVE:-/srv/osrm}
case $(realpath -m "$out") in "$(realpath -m "$live_link")"|/srv/osrm|/srv/osrm/) echo "refusing to build into the live graph $live_link" >&2; exit 2;; esac
[ ! -e "$out/region.osrm.mldgr" ] || { echo "refusing: $out already holds a graph; build into a new directory" >&2; exit 2; }
image=ghcr.io/project-osrm/osrm-backend@sha256:ef49d1a83c0aa0707aad2338127f96f39af78374bb6c1b3ffa07cf13b92ac572 # v26.6.1-amd64-alpine
url=https://download.geofabrik.de/asia/israel-and-palestine-latest.osm.pbf
mkdir -p "$out"
cp "$boundary" "$out/boundary.geojson"
if [ -n "$source" ]; then
  [ "$(realpath "$source")" = "$(realpath -m "$out/source.osm.pbf")" ] || cp "$source" "$out/source.osm.pbf"
  url="file:$(realpath "$source")"
else
  curl -fsSL -o "$out/source.osm.pbf.part" "$url" && mv "$out/source.osm.pbf.part" "$out/source.osm.pbf" # never truncate a kept extract
fi
docker run --rm --memory=2g --memory-swap=2g -v "$out:/d" debian:bookworm-slim sh -euc 'apt-get update -qq && apt-get install -qq -y osmium-tool >/dev/null
  osmium extract -s simple -p /d/boundary.geojson -o /d/region.osm.pbf --overwrite /d/source.osm.pbf
  osmium fileinfo -g header.option.osmosis_replication_timestamp /d/source.osm.pbf > /d/.timestamp
  osmium --version | head -1 > /d/.osmium'
for step in "osrm-extract -p /opt/car.lua /d/region.osm.pbf" "osrm-partition /d/region.osrm" "osrm-customize /d/region.osrm"; do
  docker run --rm --memory=1g --memory-swap=1g -v "$out:/d" "$image" $step
done
rm -f "$out/region.osm.pbf"

# Every value is computed before the manifest is written, so a failure stops the script instead of writing an empty field.
ls "$out"/region.osrm.* >/dev/null
timestamp=$(cat "$out/.timestamp"); osmium=$(cat "$out/.osmium"); rm -f "$out/.timestamp" "$out/.osmium"
[ -n "$timestamp" ] || { echo "source has no replication timestamp" >&2; exit 1; }
source_sha=$(sha256sum "$out/source.osm.pbf" | cut -d' ' -f1)
boundary_sha=$(sha256sum "$out/boundary.geojson" | cut -d' ' -f1)
graph=$(cd "$out" && LC_ALL=C sha256sum region.osrm* | LC_ALL=C sort -k2)

# Route corpus: fixed West Bank pairs served from this graph on a loopback port, then the server is removed.
port=5199
# The same flags as production's wind-osrm unit, so the corpus proves the way the graph is served (Haiku PR #104 L1).
docker run -d --rm --name osrm-corpus --read-only --user 65534:65534 --cap-drop=ALL --security-opt no-new-privileges --pids-limit 256 --memory=1g --memory-swap=1g -p 127.0.0.1:$port:5000 -v "$out:/data:ro" "$image" osrm-routed --algorithm mld --max-table-size 100 /data/region.osrm >/dev/null
trap 'docker rm -f osrm-corpus >/dev/null 2>&1 || true' EXIT
for i in $(seq 1 30); do curl -fs "http://127.0.0.1:$port/nearest/v1/driving/35.2034,31.9038" >/dev/null && break; sleep 1; done
routes=$(for pair in "tulkarm-ramallah 35.0279,32.3116;35.2034,31.9038" "nablus-ramallah 35.2544,32.2211;35.2034,31.9038" \
  "hebron-ramallah 35.0955,31.5326;35.2034,31.9038" "bethlehem-hebron 35.2007,31.7054;35.0955,31.5326" \
  "jenin-nablus 35.2908,32.4594;35.2544,32.2211" "albireh-local 35.2160,31.9100;35.2312,31.8971"; do
  set -- $pair
  curl -fsS "http://127.0.0.1:$port/route/v1/driving/$2?overview=full" | python3 -c 'import hashlib,json,sys
r=json.load(sys.stdin)["routes"][0]; print(sys.argv[1], round(r["distance"],1), round(r["duration"],1), hashlib.sha256(r["geometry"].encode()).hexdigest()[:16])' "$1"
done)
[ "$(printf '%s\n' "$routes" | wc -l)" -eq 6 ] || { echo "route corpus incomplete" >&2; exit 1; }

{
  echo "built_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "source_url=$url"
  echo "source_sha256=$source_sha"
  echo "source_osm_timestamp=$timestamp"
  echo "boundary_sha256=$boundary_sha"
  echo "osrm_image=$image"
  echo "osmium=$osmium (debian:bookworm-slim)"
  echo "profile=/opt/car.lua (in osrm_image)"
  printf '%s\n' "$graph" | sed 's/^/graph /'
  printf '%s\n' "$routes" | sed 's/^/route /'
} > "$out/BUILD-MANIFEST"
echo "built $out"; grep -E '^source_osm_timestamp=|^route ' "$out/BUILD-MANIFEST"
