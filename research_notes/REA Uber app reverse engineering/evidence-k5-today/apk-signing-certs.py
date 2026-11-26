"""Read the signing certificates out of an APK Signature Scheme v2/v3 block.

Reads only local bytes; prints SHA-256 and SHA-512 of each certificate DER.

Usage: python apk-signing-certs.py <apk>
"""
import hashlib
import struct
import sys

V2_ID = 0x7109871A
V3_ID = 0xF05368C0
MAGIC = b"APK Sig Block 42"


def read_uint64(buf, off):
    return struct.unpack_from("<Q", buf, off)[0]


def len_prefixed(buf, off):
    n = struct.unpack_from("<I", buf, off)[0]
    return buf[off + 4:off + 4 + n], off + 4 + n


def find_signing_block(data):
    eocd = data.rfind(b"PK\x05\x06")
    if eocd < 0:
        raise SystemExit("no EOCD")
    cd_off = struct.unpack_from("<I", data, eocd + 16)[0]
    # signing block ends right before the central directory
    end = cd_off
    size = read_uint64(data, end - 24)
    start = end - size - 8
    if data[start + 8:start + 24] != MAGIC and data[end - 16:end] != MAGIC:
        raise SystemExit("signing block magic not found")
    return start + 8, end - 24


def pairs(data, lo, hi):
    off = lo
    while off < hi:
        n = read_uint64(data, off)
        pid = struct.unpack_from("<I", data, off + 8)[0]
        value = data[off + 12:off + 8 + n]
        yield pid, value
        off += 8 + n


def certs_from_value(value):
    signers, _ = len_prefixed(value, 0)
    off = 0
    out = []
    while off < len(signers):
        signer, off = len_prefixed(signers, off)
        signed_data, _ = len_prefixed(signer, 0)
        # signed data: digests, certificates, additional attributes
        _, o = len_prefixed(signed_data, 0)
        certs, _ = len_prefixed(signed_data, o)
        c = 0
        while c < len(certs):
            der, c = len_prefixed(certs, c)
            out.append(der)
    return out


def main(path):
    data = open(path, "rb").read()
    lo, hi = find_signing_block(data)
    seen = 0
    for pid, value in pairs(data, lo, hi):
        if pid not in (V2_ID, V3_ID):
            continue
        for der in certs_from_value(value):
            seen += 1
            print(f"block=0x{pid:08x} bytes={len(der)} "
                  f"sha256={hashlib.sha256(der).hexdigest()} sha512={hashlib.sha512(der).hexdigest()}")
    print(f"certificates found: {seen}")


if __name__ == "__main__":
    main(sys.argv[1])
