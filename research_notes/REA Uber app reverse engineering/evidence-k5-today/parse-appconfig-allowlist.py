"""Parse the AppConfig.<clinit> instruction listing into the IPC allowlist table.

Input : ipc-allowlist-appconfig.txt (produced by dexdump-extract.py)
Output: ipc-allowlist-appconfig.json  { family: [[packageName, packageType], ...] }
"""
import json
import os
import re
import sys

SRC = sys.argv[1]
DST = sys.argv[2]

CONST = re.compile(r'const-string v(\d+), "([^"]+)"')
ENUM = re.compile(r'sget-object v(\d+), Lcom/uber/identity/ipcutils/model/AppPackage\$PackageType;\.(\w+)')
NEWPKG = re.compile(r'new-instance v(\d+), Lcom/uber/identity/ipcutils/model/AppPackage;')
INITPKG = re.compile(r'invoke-direct \{v(\d+), (v\d+), (v\d+)\}, Lcom/uber/identity/ipcutils/model/AppPackage;\.<init>')
SPUT = re.compile(r'sput-object v\d+, Lcom/uber/identity/ipcutils/model/AppConfig;\.(\w+):')

reg, current, result = {}, [], {}

with open(SRC, encoding="utf-8", errors="replace") as fh:
    for line in fh:
        m = CONST.search(line)
        if m:
            reg["v" + m.group(1)] = m.group(2)
            continue
        m = ENUM.search(line)
        if m:
            reg["v" + m.group(1)] = m.group(2)
            continue
        if NEWPKG.search(line):
            continue
        m = INITPKG.search(line)
        if m:
            current.append([reg.get(m.group(2), "?"), reg.get(m.group(3), "?")])
            continue
        m = SPUT.search(line)
        if m and current:
            result[m.group(1)] = current
            current = []

if current:
    result["(trailing)"] = current

with open(DST, "w", encoding="utf-8") as fh:
    json.dump(result, fh, indent=1)

total = sum(len(v) for v in result.values())
print(f"families: {len(result)}  package entries: {total}")
for fam, entries in result.items():
    print(f"{fam}: {len(entries)}")
    for pkg, kind in entries:
        print(f"   {kind:<11} {pkg}")
