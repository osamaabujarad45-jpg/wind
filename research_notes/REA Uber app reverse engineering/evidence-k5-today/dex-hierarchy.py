"""Find implementors and subclasses of a type across an APK's DEX files.

Unlike a direct-superclass scan, this matches interfaces too, which is how Kotlin
and Dagger wire most implementations.

Usage:
  python dex-hierarchy.py <apk> impls <InterfaceOrClass>       # direct implementors + subclasses
  python dex-hierarchy.py <apk> info <ClassName>...            # flags/super/ifaces/file
  python dex-hierarchy.py <apk> subclasses <ClassName>         # direct subclasses only
"""
import re
import struct
import sys
import zipfile

ACC_ABSTRACT = 0x0400
ACC_INTERFACE = 0x0200
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
            for k in range(u32(interfaces)):
                idx = u32(interfaces + 4 + 4 * k)
                if idx < len(types):
                    ifs.append(types[idx])
        name = cls[1:-1].replace("/", ".") if cls.startswith("L") else cls
        rows.append((name, supers, ifs, flags, bool(data_off)))
    return rows


def norm(desc):
    return desc if desc.startswith("L") else "L" + desc.replace(".", "/") + ";"


def main(apk, mode, names):
    zf = zipfile.ZipFile(apk)
    dexes = sorted(n for n in zf.namelist() if re.match(r"^classes\d*\.dex$", n))
    table = {}
    for d in dexes:
        for name, sup, ifs, flags, has_data in parse(zf.read(d)):
            table[name] = (d, sup, ifs, flags, has_data)

    if mode == "info":
        for n in names:
            row = table.get(n)
            if not row:
                print(f"{n}: NOT DEFINED")
                continue
            dex, sup, ifs, flags, has_data = row
            kind = "interface" if flags & ACC_INTERFACE else ("abstract" if flags & ACC_ABSTRACT else "class")
            print(f"{n}\n  file={dex} kind={kind} final={bool(flags & ACC_FINAL)} class_data={has_data}"
                  f"\n  extends={sup}\n  implements={', '.join(i[1:-1].replace('/', '.') for i in ifs) or '-'}")
        return

    target = norm(names[0])
    want_sub = mode in ("subclasses", "impls")
    want_if = mode == "impls"
    hits = []
    for name, (dex, sup, ifs, flags, has_data) in table.items():
        if want_sub and sup == target:
            hits.append((name, dex, "extends", flags))
        if want_if and target in ifs:
            hits.append((name, dex, "implements", flags))
    print(f"{mode} of {target}: {len(hits)}")
    for name, dex, how, flags in sorted(hits):
        kind = "abstract" if flags & ACC_ABSTRACT else "class"
        print(f"  {name}  ({dex}, {how}, {kind})")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], sys.argv[3:])
