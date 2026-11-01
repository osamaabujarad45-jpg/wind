"""Measure decompilation coverage from a Java source tree produced from the APK.

Counts source files, files that carry a hard failure marker, and the marker
frequency by kind, so the coverage claim is a measurement rather than an opinion.

Usage: python jadx-coverage.py <source_dir> <out.json>
"""
import json
import os
import re
import sys

ERROR_RE = re.compile(r"JADX ERROR")
WARN_RE = re.compile(r"JADX WARN")


def main(src, dst):
    files = 0
    bytes_total = 0
    with_error = 0
    warnings = 0
    error_kinds = {}
    packages = set()
    for root, _dirs, names in os.walk(src):
        for n in names:
            if not n.endswith(".java"):
                continue
            p = os.path.join(root, n)
            files += 1
            bytes_total += os.path.getsize(p)
            rel = os.path.relpath(root, src)
            if rel != ".":
                packages.add(rel.replace(os.sep, "."))
            with open(p, encoding="utf-8", errors="replace") as fh:
                text = fh.read()
            if ERROR_RE.search(text):
                with_error += 1
                for line in text.splitlines():
                    if ERROR_RE.search(line):
                        key = line.strip()[:120]
                        error_kinds[key] = error_kinds.get(key, 0) + 1
            warnings += len(WARN_RE.findall(text))
    out = {
        "source_dir": os.path.basename(src),
        "java_files": files,
        "bytes": bytes_total,
        "packages": len(packages),
        "files_with_hard_error": with_error,
        "files_clean_share": round(1 - (with_error / files), 4) if files else None,
        "warning_markers": warnings,
        "top_error_markers": dict(sorted(error_kinds.items(), key=lambda kv: -kv[1])[:15]),
    }
    json.dump(out, open(dst, "w", encoding="utf-8"), indent=1)
    print(json.dumps(out, indent=1)[:1200])


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
