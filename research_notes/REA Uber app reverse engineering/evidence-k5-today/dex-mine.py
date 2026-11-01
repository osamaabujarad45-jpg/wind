"""Summarize a members inventory (from dex-members.py) into report-ready JSON sets.

Usage: python dex-mine.py <members_txt> <out_dir>
Emits one JSON file per lane. Counts are exact; member lists are capped and the
cap is recorded in each file.
"""
import json
import os
import re
import sys
from collections import Counter

MEMBER_CAP = 80


def load(path):
    rows = []
    with open(path, encoding="utf-8", errors="backslashreplace") as fh:
        for line in fh:
            cls, methods, fields = (line.rstrip("\n").split("\t") + ["", ""])[:3]
            rows.append((cls, [m for m in methods.split(",") if m], [f for f in fields.split(",") if f]))
    return rows


def pack(rows, cap=MEMBER_CAP):
    out = {}
    for cls, methods, fields in rows:
        out[cls] = {"methods": methods[:cap], "fields": fields[:cap],
                    "methods_total": len(methods), "fields_total": len(fields)}
    return out


def dump(path, obj):
    json.dump(obj, open(path, "w", encoding="utf-8"), indent=1)


def main(members, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    rows = load(members)
    by_pkg = Counter()

    def sel(pred):
        return [r for r in rows if pred(r[0])]

    lanes = {
        "map-stack": lambda c: c.startswith(("com.uber.maps", "com.uber.mapssdk", "com.ubercab.android.map",
                                            "com.uber.rider_maps_sdk", "com.uber.routeshare.maps",
                                            "com.ubercab.maps", "com.uber.mapsudl")),
        "map-native-bridge": lambda c: bool(re.search(r"[Mm]ap.*(JNI|Native|Bridge)|(JNI|Native|Bridge).*[Mm]ap", c)),
        "screens": lambda c: bool(re.search(r"(Activity|Fragment|DialogFragment|BottomSheet|ViewController)$", c)),
        "ribs": lambda c: bool(re.search(r"(Router|Interactor|Builder|Scope|Presenter)$", c)),
        "persistence": lambda c: bool(re.search(r"(Dao|Entity|Database|Database_[0-9]+|Store|Preferences|KeyValue)$", c)),
        "network": lambda c: bool(re.search(r"(Api|ApiService|Service|Endpoints?|Interceptor|Authenticator)$", c))
                             and not c.startswith(("androidx.", "com.google.", "okhttp3.internal")),
        "design-system": lambda c: c.startswith(("com.ubercab.ui", "com.uber.design", "com.ubercab.design",
                                                 "com.ubercab.wasp", "com.uber.wasp")),
        "features": lambda c: c.startswith(("com.uber.", "com.ubercab.")),
    }

    summary = {"members_file": os.path.basename(members), "classes": len(rows),
               "member_cap": MEMBER_CAP, "lanes": {}}
    for name, pred in lanes.items():
        hit = sel(pred)
        summary["lanes"][name] = len(hit)
        if name == "features":
            mods = Counter(".".join(c.split(".")[:3]) for c, _, _ in hit)
            dump(os.path.join(out_dir, "feature-modules.json"),
                 {"class_total": len(hit), "top_200_modules": dict(mods.most_common(200))})
        else:
            dump(os.path.join(out_dir, f"{name}.json"),
                 {"class_total": len(hit), "member_cap": MEMBER_CAP, "classes": pack(hit)})

    dump(os.path.join(out_dir, "lane-summary.json"), summary)
    print(json.dumps(summary["lanes"], indent=1))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
