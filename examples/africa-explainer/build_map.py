"""Turn Natural Earth 110m countries into SVG paths for Africa, written as map.js."""
import json
from pathlib import Path

SRC = Path(__file__).with_name("ne_110m_admin_0_countries.geojson")
OUT = Path(__file__).with_name("map.js")
BOX = 1000.0  # output square in px

data = json.loads(SRC.read_text())
feats = [f for f in data["features"] if f["properties"].get("CONTINENT") == "Africa"]
# Include Madagascar etc. (already Africa). Drop tiny islands far away? keep all.

def rings(geom):
    if geom["type"] == "Polygon":
        yield from geom["coordinates"]
    elif geom["type"] == "MultiPolygon":
        for poly in geom["coordinates"]:
            yield from poly

lons, lats = [], []
for f in feats:
    for ring in rings(f["geometry"]):
        for lon, lat in ring:
            lons.append(lon); lats.append(lat)
min_lon, max_lon, min_lat, max_lat = min(lons), max(lons), min(lats), max(lats)
# equirectangular, uniform scale so shape is not stretched
scale = BOX / max(max_lon - min_lon, max_lat - min_lat)
w = (max_lon - min_lon) * scale
h = (max_lat - min_lat) * scale
ox = (BOX - w) / 2
oy = (BOX - h) / 2

def project(lon, lat):
    return round(ox + (lon - min_lon) * scale, 2), round(oy + (max_lat - lat) * scale, 2)

countries = {}
for f in feats:
    props = f["properties"]
    iso = props.get("ADM0_A3") or props.get("ISO_A3")
    d = []
    cx = cy = n = 0
    for ring in rings(f["geometry"]):
        pts = [project(lon, lat) for lon, lat in ring]
        d.append("M" + " L".join(f"{x} {y}" for x, y in pts) + " Z")
        for x, y in pts:
            cx += x; cy += y; n += 1
    countries[iso] = {"name": props.get("NAME", iso), "d": " ".join(d), "cx": round(cx / n, 1), "cy": round(cy / n, 1)}

payload = {
    "box": BOX,
    "countries": countries,
    "proj": {"min_lon": min_lon, "max_lat": max_lat, "scale": scale, "ox": ox, "oy": oy},
}
OUT.write_text("window.AFRICA = " + json.dumps(payload) + ";\n")
print(f"{len(countries)} countries, bounds lon {min_lon:.1f}..{max_lon:.1f} lat {min_lat:.1f}..{max_lat:.1f}, wrote {OUT.name} ({OUT.stat().st_size // 1024} KB)")
