#!/bin/sh
# Run on the VM: build-west-bank.sh <west-bank.geojson> [output dir]. A road graph holding only roads inside the West Bank, so no
# route leaves it (owner decision for the pilot, 6 November 2026). Builds beside the live graph; nothing live changes.
# The boundary is the outer ring of OpenStreetMap relation 1803010; that relation alone is Area C, and 1613659 is Areas A and B. It knows nothing of permits, gates or checkpoints inside the West Bank.
# Needs swap on a 1 GB VM; the caps keep it from starving the live containers. fallocate -l 3G /swap-wb && mkswap /swap-wb && swapon /swap-wb, then remove it.
set -eu
boundary=$1
out=${2:-/srv/osrm-wb}
image=ghcr.io/project-osrm/osrm-backend:v26.6.1-amd64-alpine
mkdir -p "$out"
cp "$boundary" "$out/boundary.geojson"
curl -fsSL -o "$out/all.osm.pbf" https://download.geofabrik.de/asia/israel-and-palestine-latest.osm.pbf
docker run --rm --memory=450m --memory-swap=3g -v "$out:/d" debian:bookworm-slim sh -c 'apt-get update -qq && apt-get install -qq -y osmium-tool >/dev/null && osmium extract -s simple -p /d/boundary.geojson -o /d/region.osm.pbf --overwrite /d/all.osm.pbf'
rm -f "$out/all.osm.pbf"
docker run --rm --memory=500m --memory-swap=3g -v "$out:/d" "$image" osrm-extract -p /opt/car.lua /d/region.osm.pbf
docker run --rm --memory=500m --memory-swap=3g -v "$out:/d" "$image" osrm-partition /d/region.osrm
docker run --rm --memory=500m --memory-swap=3g -v "$out:/d" "$image" osrm-customize /d/region.osrm
rm -f "$out/region.osm.pbf"
echo "built $out"
