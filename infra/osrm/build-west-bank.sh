#!/bin/sh
# Run on the VM: build-west-bank.sh <west-bank.geojson> [output dir] [source .osm.pbf]. A road graph holding only roads inside the West Bank, so no
# route leaves it (owner decision for the pilot, 6 November 2026). Builds beside the live graph; nothing live changes.
# The boundary is the outer ring of OpenStreetMap relation 1803010; that relation alone is Area C, and 1613659 is Areas A and B. It knows nothing of permits, gates or checkpoints inside the West Bank.
# Needs swap on a 1 GB VM; the caps keep it from starving the live containers. fallocate -l 3G /swap-wb && mkswap /swap-wb && swapon /swap-wb, then remove it.
# Reproducible (Fable GEO-01): the downloaded extract is kept as $out/source.osm.pbf and BUILD-MANIFEST records its checksum and
# OSM replication timestamp, the boundary, the image digest and every graph file's checksum. OSRM's threaded build is not
# byte-identical (15 Nov 2026: same source, two builds, different graph_sha256), so reproducibility means identical routes:
# rebuild from the same source (third argument), serve both and compare distance, duration and geometry for fixed pairs.
# Geometry never proves a road is legal to drive.
set -eu
boundary=$1
out=${2:-/srv/osrm-wb}
source=${3:-}
image=ghcr.io/project-osrm/osrm-backend:v26.6.1-amd64-alpine
url=https://download.geofabrik.de/asia/israel-and-palestine-latest.osm.pbf
mkdir -p "$out"
cp "$boundary" "$out/boundary.geojson"
if [ -n "$source" ]; then cp "$source" "$out/source.osm.pbf"; url="file:$source"; else curl -fsSL -o "$out/source.osm.pbf" "$url"; fi
docker run --rm --memory=450m --memory-swap=3g -v "$out:/d" debian:bookworm-slim sh -c 'apt-get update -qq && apt-get install -qq -y osmium-tool >/dev/null && osmium extract -s simple -p /d/boundary.geojson -o /d/region.osm.pbf --overwrite /d/source.osm.pbf && osmium fileinfo -g header.option.osmosis_replication_timestamp /d/source.osm.pbf > /d/source.timestamp'
docker run --rm --memory=500m --memory-swap=3g -v "$out:/d" "$image" osrm-extract -p /opt/car.lua /d/region.osm.pbf
docker run --rm --memory=500m --memory-swap=3g -v "$out:/d" "$image" osrm-partition /d/region.osrm
docker run --rm --memory=500m --memory-swap=3g -v "$out:/d" "$image" osrm-customize /d/region.osrm
rm -f "$out/region.osm.pbf"
{
  echo "built_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "source_url=$url"
  echo "source_sha256=$(sha256sum "$out/source.osm.pbf" | cut -d' ' -f1)"
  echo "source_osm_timestamp=$(cat "$out/source.timestamp")"
  echo "boundary_sha256=$(sha256sum "$out/boundary.geojson" | cut -d' ' -f1)"
  echo "image=$(docker image inspect --format '{{index .RepoDigests 0}}' "$image")"
  echo "profile=/opt/car.lua (in image)"
  # ponytail: one combined hash of the graph files; diff the per-file lines below when it changes.
  (cd "$out" && sha256sum region.osrm* | sort -k2) | sed 's/^/graph /'
  echo "graph_sha256=$(cd "$out" && sha256sum region.osrm* | sort -k2 | sha256sum | cut -d' ' -f1)"
} > "$out/BUILD-MANIFEST"
rm -f "$out/source.timestamp"
echo "built $out"; grep -E '^(source_osm_timestamp|graph_sha256)=' "$out/BUILD-MANIFEST"
