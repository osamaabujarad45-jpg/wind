"""Read-only DEX inventory for an APK: class names, member-name histograms, and
pattern-filtered string sets (API paths, SQL, URLs, map style names).

No dependencies; parses the DEX format directly. Writes JSON only; never executes
anything from the package.

Usage: python dex-inventory.py <apk> <out_dir>
"""
import json
import os
import re
import struct
import sys
import zipfile

PATH_RE = re.compile(r"^/[A-Za-z0-9_\-/{}.$:]{2,120}$")
URL_RE = re.compile(r"^(https?|wss?|grpc)://[^\s\"'<>]{4,200}$")
SQL_RE = re.compile(r"^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|REPLACE|PRAGMA|BEGIN|WITH)\b", re.I)
TEMPLATE_RE = re.compile(r"^[A-Za-z0-9_./\-]*\{[A-Za-z0-9_]+\}[A-Za-z0-9_./\-]*$")


def uleb128(buf, off):
    result = shift = 0
    while True:
        b = buf[off]
        off += 1
        result |= (b & 0x7F) << shift
        if not b & 0x80:
            return result, off
        shift += 7


def mutf8(buf, off):
    # off points at the uleb128 utf16 length
    _, off = uleb128(buf, off)
    end = off
    while buf[end] != 0:
        end += 1
    raw = buf[off:end]
    # Repair modified UTF-8: C0 80 -> NUL, and keep lone surrogates.
    raw = raw.replace(b"\xc0\x80", b"\x00")
    return raw.decode("utf-8", "surrogatepass")


def u32(buf, off):
    return struct.unpack_from("<I", buf, off)[0]


def u16(buf, off):
    return struct.unpack_from("<H", buf, off)[0]


def parse_dex(buf):
    assert buf[:4] == b"dex\n", "not a dex"
    string_ids_size, string_ids_off = u32(buf, 0x38), u32(buf, 0x3C)
    type_ids_size, type_ids_off = u32(buf, 0x40), u32(buf, 0x44)
    method_ids_size, method_ids_off = u32(buf, 0x58), u32(buf, 0x5C)
    field_ids_size, field_ids_off = u32(buf, 0x50), u32(buf, 0x54)
    class_defs_size, class_defs_off = u32(buf, 0x60), u32(buf, 0x64)

    strings = [mutf8(buf, u32(buf, string_ids_off + 4 * i)) for i in range(string_ids_size)]
    types = [strings[u32(buf, type_ids_off + 4 * i)] for i in range(type_ids_size)]

    methods = []
    for i in range(method_ids_size):
        o = method_ids_off + 8 * i
        methods.append((types[u16(buf, o)], strings[u32(buf, o + 4)]))
    fields = []
    for i in range(field_ids_size):
        o = field_ids_off + 8 * i
        fields.append((types[u16(buf, o)], strings[u32(buf, o + 4)]))

    classes = []
    for i in range(class_defs_size):
        o = class_defs_off + 32 * i
        classes.append(types[u32(buf, o)])

    return {
        "strings": strings,
        "types": types,
        "methods": methods,
        "fields": fields,
        "classes": classes,
    }


def main(apk, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    zf = zipfile.ZipFile(apk)
    dex_names = sorted(n for n in zf.namelist() if re.match(r"^classes\d*\.dex$", n))
    all_classes, method_names, field_names = [], {}, {}
    paths, urls, sql, templates, hosts = set(), set(), set(), set(), set()
    string_dump = open(os.path.join(out_dir, "dex-strings-all.txt"), "w", encoding="utf-8",
                       errors="backslashreplace")
    per_dex = []

    for name in dex_names:
        info = parse_dex(zf.read(name))
        per_dex.append({
            "dex": name,
            "strings": len(info["strings"]),
            "types": len(info["types"]),
            "methods": len(info["methods"]),
            "fields": len(info["fields"]),
            "classes": len(info["classes"]),
        })
        all_classes.extend(c[1:-1].replace("/", ".") for c in info["classes"] if c.startswith("L"))
        for _, m in info["methods"]:
            method_names[m] = method_names.get(m, 0) + 1
        for _, f in info["fields"]:
            field_names[f] = field_names.get(f, 0) + 1
        for s in info["strings"]:
            string_dump.write(s.replace("\n", "\\n") + "\n")
            if PATH_RE.match(s) or (s.startswith("/") and len(s) < 121):
                paths.add(s)
            if URL_RE.match(s):
                urls.add(s)
            if SQL_RE.match(s) and len(s) < 500:
                sql.add(s)
            if TEMPLATE_RE.match(s) and "/" in s:
                templates.add(s)
        print(f"{name}: {per_dex[-1]}", flush=True)
    string_dump.close()

    pkgs = {}
    for c in all_classes:
        parts = c.split(".")
        key = ".".join(parts[:2])
        pkgs[key] = pkgs.get(key, 0) + 1

    rel = lambda p: os.path.join(out_dir, p)
    json.dump({
        "apk": os.path.basename(apk),
        "apk_bytes": os.path.getsize(apk),
        "dex_count": len(dex_names),
        "per_dex": per_dex,
        "class_total": len(all_classes),
        "unique_method_names": len(method_names),
        "unique_field_names": len(field_names),
    }, open(rel("dex-inventory-summary.json"), "w", encoding="utf-8"), indent=1)
    open(rel("dex-classes.txt"), "w", encoding="utf-8").write("\n".join(sorted(all_classes)))
    json.dump(dict(sorted(pkgs.items(), key=lambda kv: -kv[1])[:400]),
              open(rel("dex-package-histogram.json"), "w", encoding="utf-8"), indent=1)
    json.dump(dict(sorted(method_names.items(), key=lambda kv: -kv[1])[:800]),
              open(rel("dex-method-names.json"), "w", encoding="utf-8"), indent=1)
    json.dump(sorted(paths), open(rel("dex-api-paths.json"), "w", encoding="utf-8"), indent=1)
    json.dump(sorted(urls), open(rel("dex-urls.json"), "w", encoding="utf-8"), indent=1)
    json.dump(sorted(sql), open(rel("dex-sql-strings.json"), "w", encoding="utf-8"), indent=1)
    json.dump(sorted(templates), open(rel("dex-path-templates.json"), "w", encoding="utf-8"), indent=1)
    print(json.dumps({"classes": len(all_classes), "paths": len(paths), "urls": len(urls),
                      "sql": len(sql), "templates": len(templates)}, indent=1))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
