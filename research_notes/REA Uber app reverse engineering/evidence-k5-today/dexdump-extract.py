"""Extract one method's bytecode listing (or reference sites) from a dexdump -d dump.

Works on the platform disassembler's output: no decompiler, no timeout, full method set.

Format used by the dump:
    #20              : (in Lcom/pkg/Class;)
      name          : 'methodName'
      type          : '()V'
      code          -
      registers     : 7
      insns size    : 39 16-bit code units
hexaddr: ...                  |0000: instruction ... // resolved reference

Usage:
  python dexdump-extract.py <dump.txt> method <Class> <methodName> [maxLines]
  python dexdump-extract.py <dump.txt> refs <TypeDescriptor> [maxSites]
"""
import re
import sys

IN_RE = re.compile(r"^\s+#\d+\s+: \(in (L[^;]+;)\)")
NAME_RE = re.compile(r"^\s+name\s+: '([^']+)'")
INSN_RE = re.compile(r"^[0-9a-f]{6}:.*\|[0-9a-f]{4}: ")


def norm(desc):
    return desc if desc.startswith("L") else "L" + desc.replace(".", "/") + ";"


def method(dump, cls, name, max_lines):
    target = norm(cls)
    cur = cur_method = None
    out, emitted, found = [], 0, False
    with open(dump, encoding="utf-8", errors="replace") as fh:
        for line in fh:
            m = IN_RE.match(line)
            if m:
                cur = m.group(1)
                cur_method = None
                continue
            m = NAME_RE.match(line)
            if m:
                cur_method = m.group(1)
                if cur == target and cur_method == name:
                    found = True
                    out.append(f"method: {target}.{name}")
                continue
            if found and cur == target and cur_method == name and INSN_RE.match(line):
                if emitted < max_lines:
                    out.append(line.rstrip().split("|", 1)[-1])
                    emitted += 1
    print("\n".join(out) if out else f"{cls}.{name}: NOT FOUND (or no code)")
    print(f"[instructions shown: {emitted}]")


def refs(dump, type_desc, max_sites):
    cur = cur_method = None
    sites = []
    with open(dump, encoding="utf-8", errors="replace") as fh:
        for line in fh:
            m = IN_RE.match(line)
            if m:
                cur = m.group(1)
                continue
            m = NAME_RE.match(line)
            if m:
                cur_method = m.group(1)
                continue
            if INSN_RE.match(line) and type_desc in line:
                sites.append((cur, cur_method, line.rstrip().split("|", 1)[-1]))
                if len(sites) >= max_sites:
                    break
    print(f"{len(sites)} sites referencing {type_desc}")
    for c, mth, ins in sites:
        print(f"  {c}.{mth}\n      {ins}")


if __name__ == "__main__":
    if sys.argv[2] == "method":
        method(sys.argv[1], sys.argv[3], sys.argv[4], int(sys.argv[5]) if len(sys.argv) > 5 else 500)
    else:
        refs(sys.argv[1], sys.argv[3], int(sys.argv[4]) if len(sys.argv) > 4 else 60)
