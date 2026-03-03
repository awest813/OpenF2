"""
Fallout 1 .DAT (DAT1) archive reader and extractor.

DAT1 format (Fallout 1 only):
  - Big-endian header
  - Directory listing: list of directories each with a file list
  - LZSS compression (not zlib like DAT2)

Format reference: http://falloutmods.wikia.com/wiki/DAT_file_format

Usage:
    python dat1.py master.dat output_dir/
    python dat1.py master.dat output_dir/ --list
"""

from __future__ import annotations

import os
import sys
import struct
import argparse
from dataclasses import dataclass
from typing import List, Optional, BinaryIO


# ---------------------------------------------------------------------------
# LZSS decompression
# ---------------------------------------------------------------------------

_DICT_SIZE = 4096
_THRESHOLD = 2   # minimum match length to encode as reference


def lzss_decompress(data: bytes, expected_size: int) -> bytes:
    """
    Decompress Fallout 1 LZSS-compressed data.
    Uses a circular 4096-byte dictionary, initial fill value 0x20 (space).
    """
    out = bytearray()
    ring = bytearray(b' ' * _DICT_SIZE)
    ring_pos = 0xFEE  # initial ring buffer position (per Fallout 1 convention)

    src = 0
    n = len(data)

    while src < n and len(out) < expected_size:
        flags = data[src]
        src += 1

        for bit in range(8):
            if src >= n or len(out) >= expected_size:
                break

            if flags & (1 << bit):
                # Literal byte
                byte = data[src]
                src += 1
                out.append(byte)
                ring[ring_pos] = byte
                ring_pos = (ring_pos + 1) & 0xFFF
            else:
                # Back-reference: 2 bytes encode offset + length
                if src + 1 >= n:
                    break
                lo = data[src]
                hi = data[src + 1]
                src += 2

                offset = lo | ((hi & 0xF0) << 4)
                length = (hi & 0x0F) + _THRESHOLD + 1

                for _ in range(length):
                    if len(out) >= expected_size:
                        break
                    byte = ring[offset & 0xFFF]
                    out.append(byte)
                    ring[ring_pos] = byte
                    ring_pos = (ring_pos + 1) & 0xFFF
                    offset += 1

    return bytes(out)


# ---------------------------------------------------------------------------
# DAT1 structures
# ---------------------------------------------------------------------------

@dataclass
class Dat1File:
    filename: str
    attributes: int        # 0x20 = directory, 0x40 = compressed
    original_size: int
    packed_size: int
    offset: int            # absolute offset in DAT file

    @property
    def compressed(self) -> bool:
        return bool(self.attributes & 0x40)

    @property
    def is_dir(self) -> bool:
        return bool(self.attributes & 0x20)


def _read_u32_be(f: BinaryIO) -> int:
    return struct.unpack('>I', f.read(4))[0]


def _read_u16_be(f: BinaryIO) -> int:
    return struct.unpack('>H', f.read(2))[0]


def read_dat1(f: BinaryIO, posix_paths: bool = False) -> List[Dat1File]:
    """
    Parse a Fallout 1 DAT1 file and return all file entries.

    DAT1 layout:
        4 bytes  — number of directories
        4 bytes  — unknown
        4 bytes  — unknown
        4 bytes  — unknown
        Then for each directory:
            1 byte  — directory name length
            N bytes — directory name (no null terminator)
        Then for each directory again:
            4 bytes — number of files in directory
            4 bytes — unknown
            4 bytes — unknown
            4 bytes — unknown
            Then for each file:
                1 byte  — filename length
                N bytes — filename
                4 bytes — attributes (bit 6 = compressed)
                4 bytes — offset in DAT
                4 bytes — original (decompressed) size
                4 bytes — packed size (= original if uncompressed)
    """
    num_dirs = _read_u32_be(f)
    f.read(4 * 3)  # skip three unknown dwords

    # Read directory names
    dir_names: List[str] = []
    for _ in range(num_dirs):
        name_len = struct.unpack('B', f.read(1))[0]
        name = f.read(name_len).decode('latin-1')
        dir_names.append(name)

    files: List[Dat1File] = []

    for dir_name in dir_names:
        num_files = _read_u32_be(f)
        f.read(4 * 3)  # skip three unknown dwords

        for _ in range(num_files):
            fname_len = struct.unpack('B', f.read(1))[0]
            fname = f.read(fname_len).decode('latin-1')

            attributes = _read_u32_be(f)
            offset = _read_u32_be(f)
            original_size = _read_u32_be(f)
            packed_size = _read_u32_be(f)

            # Build full path
            if dir_name and dir_name != '.':
                full_path = dir_name + '\\' + fname
            else:
                full_path = fname

            if posix_paths:
                full_path = full_path.replace('\\', '/')

            files.append(Dat1File(
                filename=full_path,
                attributes=attributes,
                original_size=original_size,
                packed_size=packed_size,
                offset=offset,
            ))

    return files


def extract_dat1(
    dat_path: str,
    output_dir: str,
    file_filter: Optional[str] = None,
    verbose: bool = False,
) -> None:
    """Extract all (or filtered) files from a DAT1 archive."""
    with open(dat_path, 'rb') as f:
        entries = read_dat1(f, posix_paths=True)

        for entry in entries:
            if entry.is_dir:
                continue
            if file_filter and file_filter.lower() not in entry.filename.lower():
                continue

            dest = os.path.join(output_dir, entry.filename.replace('/', os.sep))
            os.makedirs(os.path.dirname(dest), exist_ok=True)

            f.seek(entry.offset)
            raw = f.read(entry.packed_size)

            if entry.compressed:
                try:
                    data = lzss_decompress(raw, entry.original_size)
                except Exception as exc:
                    print(f'WARNING: LZSS decompression failed for {entry.filename}: {exc}', file=sys.stderr)
                    data = raw
            else:
                data = raw

            with open(dest, 'wb') as out:
                out.write(data)

            if verbose:
                status = 'compressed' if entry.compressed else 'stored'
                print(f'  {entry.filename}  [{status}, {entry.original_size} bytes]')


def list_dat1(dat_path: str) -> None:
    """Print a directory listing of a DAT1 archive."""
    with open(dat_path, 'rb') as f:
        entries = read_dat1(f, posix_paths=True)

    total = 0
    for e in entries:
        if e.is_dir:
            continue
        flag = 'C' if e.compressed else ' '
        print(f'{flag} {e.original_size:>10}  {e.filename}')
        total += 1
    print(f'\n{total} files')


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description='Fallout 1 DAT1 archive tool')
    parser.add_argument('dat', help='Path to .DAT file')
    parser.add_argument('output', nargs='?', help='Output directory for extraction')
    parser.add_argument('--list', '-l', action='store_true', help='List contents only')
    parser.add_argument('--filter', '-f', help='Only extract files matching this substring')
    parser.add_argument('--verbose', '-v', action='store_true', help='Verbose output')
    args = parser.parse_args()

    if args.list:
        list_dat1(args.dat)
    else:
        if not args.output:
            parser.error('Output directory required for extraction')
        os.makedirs(args.output, exist_ok=True)
        print(f'Extracting {args.dat} → {args.output}')
        extract_dat1(args.dat, args.output, file_filter=args.filter, verbose=args.verbose)
        print('Done.')


if __name__ == '__main__':
    main()
