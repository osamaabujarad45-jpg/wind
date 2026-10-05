# Road routing for Wind (SPEC-routing-eta.md). Private service: Wind reaches it at http://osrm.railway.internal:5000.
# Each deploy downloads a fresh OpenStreetMap extract, so redeploying refreshes the road graph.
FROM ghcr.io/project-osrm/osrm-backend:v26.6.1-amd64-alpine
WORKDIR /data
ADD https://download.geofabrik.de/asia/israel-and-palestine-latest.osm.pbf region.osm.pbf
RUN PROFILE=$(ls /opt/car.lua 2>/dev/null || find / -path '*profiles/car.lua' 2>/dev/null | head -1) \
  && echo "profile: $PROFILE" \
  && osrm-extract -p "$PROFILE" region.osm.pbf \
  && osrm-partition region.osrm \
  && osrm-customize region.osrm \
  && rm region.osm.pbf
EXPOSE 5000
# "::" listens on IPv6 and IPv4, which Railway's private network may use either of.
CMD ["osrm-routed", "--algorithm", "mld", "--ip", "::", "--port", "5000", "--max-table-size", "100", "region.osrm"]
