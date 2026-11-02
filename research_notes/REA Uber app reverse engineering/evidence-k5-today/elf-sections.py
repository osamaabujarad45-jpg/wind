"""Deterministic ELF reader: section table + per-section byte entropy + ASCII runs.

Reads nothing but the given local files. Output is one JSON object per library.
Usage: python elf-sections.py <lib.so> [<lib.so> ...]
"""
import json
import math
import sys
from collections import Counter


def entropy(b):
    if not b:
        return 0.0
    c = Counter(b)
    n = len(b)
    return -sum((v / n) * math.log2(v / n) for v in c.values())


def ascii_runs(b, minimum=6):
    runs, cur = [], []
    for x in b:
        if 0x20 <= x <= 0x7E:
            cur.append(chr(x))
        else:
            if len(cur) >= minimum:
                runs.append("".join(cur))
            cur = []
    if len(cur) >= minimum:
        runs.append("".join(cur))
    return runs


def parse(path):
    d = open(path, "rb").read()
    assert d[:4] == b"\x7fELF", "not ELF"
    is64 = d[4] == 2
    assert is64, "expected ELF64"
    e_shoff = int.from_bytes(d[0x28:0x30], "little")
    e_shentsize = int.from_bytes(d[0x3A:0x3C], "little")
    e_shnum = int.from_bytes(d[0x3C:0x3E], "little")
    e_shstrndx = int.from_bytes(d[0x3E:0x40], "little")

    def sh(i):
        o = e_shoff + i * e_shentsize
        return {
            "name_off": int.from_bytes(d[o:o + 4], "little"),
            "type": int.from_bytes(d[o + 4:o + 8], "little"),
            "flags": int.from_bytes(d[o + 8:o + 16], "little"),
            "addr": int.from_bytes(d[o + 16:o + 24], "little"),
            "offset": int.from_bytes(d[o + 24:o + 32], "little"),
            "size": int.from_bytes(d[o + 32:o + 40], "little"),
        }

    headers = [sh(i) for i in range(e_shnum)]
    strtab = headers[e_shstrndx]
    names = d[strtab["offset"]:strtab["offset"] + strtab["size"]]

    def name_at(off):
        end = names.find(b"\x00", off)
        return names[off:end].decode("latin1")

    sections = []
    for h in headers:
        nm = name_at(h["name_off"])
        body = d[h["offset"]:h["offset"] + h["size"]] if h["type"] != 8 else b""
        sections.append({
            "name": nm,
            "type": h["type"],
            "addr": hex(h["addr"]),
            "offset": h["offset"],
            "size": h["size"],
            "entropy": round(entropy(body), 3) if body else None,
            "ascii_runs_6plus": len(ascii_runs(body)) if body else 0,
        })

    runs = ascii_runs(d)
    return {
        "file": path.replace("\\", "/").split("/")[-1],
        "bytes": len(d),
        "file_entropy": round(entropy(d), 3),
        "file_ascii_runs_6plus": len(runs),
        "file_ascii_runs_unique": len(set(runs)),
        "section_count": e_shnum,
        "sections": sections,
        "file_runs_unique_text": sorted(set(runs)),
    }


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    keep_runs = "--no-runs" not in sys.argv
    out = [parse(p) for p in args]
    if not keep_runs:
        for o in out:
            o.pop("file_runs_unique_text", None)
    print(json.dumps(out, indent=1))
