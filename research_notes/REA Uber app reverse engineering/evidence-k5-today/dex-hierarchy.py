"""Class hierarchy + access flags from an APK's DEX files.

Answers three questions cheaply, without any decompiler:
  - which code file defines a class,
  - is a member-bearing class abstract/interface (i.e. no bodies to read),
  - which classes extend/implement a given class.

Usage:
  python dex-hierarchy.py <apk> info <ClassName>...
  python dex-hierarchy.py <apk> subclasses <ClassName>
"""
import re
import struct
import sys
import zipfile

ACC_ABSTRACT = 0x0400
ACC_INTERFACE = 0x0200
ACC_PUBLIC = 0x0001
ACC_FINAL = 0x0010


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
    _, off = uleb128(buf, off)
    end = off
    while buf[end] != 0:
        end += 1
    return buf[off:end].replace(b"\xc0\x80", b"\x00").decode("utf-8", "surrogatepass")


def parse(buf):
    u32 = lambda o: struct.unpack_from("<I", buf, o)[0]
    strings_n, strings_off = u32(0x38), u32(0x3C)
    types_n, types_off = u32(0x40), u32(0x44)
    class_n, class_off = u32(0x60), u32(0x64)
    strings = [mutf8(buf, u32(strings_off + 4 * i)) for i in range(strings_n)]
    types = [strings[u32(types_off + 4 * i)] for i in range(types_n)]
    rows = []
    for i in range(class_n):
        o = class_off + 32 * i
        cls = types[u32(o)]
        flags = u32(o + 4)
        super_idx = u32(o + 8)
        interfaces = u32(o + 12)
        data_off = u32(o + 24)
        supers = types[super_idx] if super_idx != 0xFFFFFFFF and super_idx < len(types) else None
        ifs = []
        if interfaces:
            n = u32(interfaces)
            for k in range(n):
                idx = u32(interfaces + 4 + 4 * k)
                if idx < len(types):
                    ifs.append(types[idx])
        rows.append((cls[1:-1].replace("/", ".") if cls.startswith("L") else cls, supers, ifs, flags, bool(data_off)))
    return rows


def main(apk, mode, names):
    zf = zipfile.ZipFile(apk)
    dexes = sorted(n for n in zf.namelist() if re.match(r"^classes\d*\.dex$", n))
    all_rows = {}
    for d in dexes:
        for cls, sup, ifs, flags, has_data in parse(zf.read(d)):
            all_rows[cls] = (d, sup, ifs, flags, has_data)

    def describe(name):
        row = all_rows.get(name)
        if not row:
            print(f"{name}: NOT DEFINED IN THIS APK")
            return
        dex, sup, ifs, flags, has_data = row
        kind = "interface" if flags & ACC_INTERFACE else ("abstract" if flags & ACC_ABSTRACT else "class")
        print(f"{name}\n  file={dex} kind={kind} final={bool(flags & ACC_FINAL)} class_data={has_data}"
              f"\n  extends={sup}\n  implements={', '.join(ifs) if ifs else '-'}")

    if mode == "info":
        for n in names:
            describe(n)
    elif mode == "subclasses":
        target = names[0]
        hits = [(c, v) for c, v in all_rows.items() if v[1] and v[1][1:-1].replace("/", ".") == target]
        print(f"direct subclasses of {target}: {len(hits)}")
        for c, v in sorted(hits):
            kind = "abstract" if v[3] & ACC_ABSTRACT else "class"
            print(f"  {c}  ({v[0]}, {kind})")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], sys.argv[3:])
