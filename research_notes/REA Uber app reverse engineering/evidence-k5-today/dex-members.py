"""Per-class member inventory from an APK's DEX files (methods and fields, by name).

Read-only DEX parsing, no dependencies, no execution of package content.

Usage: python dex-members.py <apk> <out_txt>
Output: one line per class:  ClassName<TAB>method1,method2,...<TAB>field1,field2,...
"""
import re
import struct
import sys
import zipfile


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
    u16 = lambda o: struct.unpack_from("<H", buf, o)[0]
    strings_n, strings_off = u32(0x38), u32(0x3C)
    types_n, types_off = u32(0x40), u32(0x44)
    field_n, field_off = u32(0x50), u32(0x54)
    method_n, method_off = u32(0x58), u32(0x5C)
    class_n, class_off = u32(0x60), u32(0x64)

    strings = [mutf8(buf, u32(strings_off + 4 * i)) for i in range(strings_n)]
    types = [strings[u32(types_off + 4 * i)] for i in range(types_n)]

    # Bucket member names by declaring class straight from the id tables: every
    # declaration and every self-reference resolves to the same entry, so this is
    # the class's member set without walking class_data_item chains.
    methods_by_class, fields_by_class = {}, {}
    for i in range(method_n):
        o = method_off + 8 * i
        methods_by_class.setdefault(types[u16(o)], []).append(strings[u32(o + 4)])
    for i in range(field_n):
        o = field_off + 8 * i
        fields_by_class.setdefault(types[u16(o)], []).append(strings[u32(o + 4)])

    out = []
    for i in range(class_n):
        cls = types[u32(class_off + 32 * i)]
        out.append((cls, methods_by_class.get(cls, []), fields_by_class.get(cls, [])))
    return out


def main(apk, out_txt):
    zf = zipfile.ZipFile(apk)
    names = sorted(n for n in zf.namelist() if re.match(r"^classes\d*\.dex$", n))
    with open(out_txt, "w", encoding="utf-8", errors="backslashreplace") as fh:
        total = 0
        for name in names:
            rows = parse(zf.read(name))
            for cls, methods, fields in rows:
                fh.write(f"{cls[1:-1].replace('/', '.')}\t{','.join(methods)}\t{','.join(fields)}\n")
            total += len(rows)
            print(f"{name}: {len(rows)} classes", flush=True)
    print(f"total classes: {total}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
