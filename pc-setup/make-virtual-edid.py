#!/usr/bin/env python3
# Builds the EDID for the virtual streaming monitor (a free connector forced to "connected").
# Timings are CVT reduced blanking v1. Base block holds 4 modes, each CTA extension 6 more
# (DTDs only, no data blocks); as many extensions as the mode list needs. A DTD can only hold
# pixel clocks up to 655.35 MHz, faster modes (4K@100) go into a DisplayID extension (Type I timings).
# Usage: make-virtual-edid.py [--mode 3440x1440@100 ...] <out.bin>
#        make-virtual-edid.py --list   (prints the default mode list)
import argparse
import re
import sys

# Vendor/product header: made-up manufacturer "DFR", 10-bit DisplayPort, 60 x 34 cm, sRGB-ish colors.
HEADER = bytes.fromhex(
    "00ffffffffffff00" "10d2010001000000" "002401" "04a53c227802" "ee91a3544c99260f5054"
    "000000" + "0101" * 8)

BASE_MODES = [(1920, 1080, 100), (2560, 1440, 100), (3840, 2160, 60), (1280, 800, 90)]
EXTRA_MODES = [(1920, 1080, 60), (2560, 1440, 60), (1280, 720, 60),
               (1280, 800, 60), (1280, 720, 40), (1920, 1080, 120),
               (2560, 1440, 120), (3840, 2160, 100)]
DTDS_PER_EXTENSION = 6  # (127 - 4) // 18
DTD_MAX_CLOCK_KHZ = 655350


def cvt_rb(width, height, refresh):
    vsync = {(16, 9): 5, (16, 10): 6, (4, 3): 4}.get(aspect(width, height), 7)
    h_period_us = (1e6 / refresh - 460) / (height + 3)
    vblank = max(int(460 / h_period_us) + 1, 3 + vsync + 6)
    h_total = width + 160
    v_total = height + vblank
    pixel_clock_khz = int(refresh * h_total * v_total / 1000 / 250) * 250
    return dict(width=width, height=height, hblank=160, vblank=vblank, hfront=48, hsync=32,
                vfront=3, vsync=vsync, clock=pixel_clock_khz)


def aspect(width, height):
    for ratio in ((16, 9), (16, 10), (4, 3)):
        if width * ratio[1] == height * ratio[0]:
            return ratio
    return None


def detailed_timing(t):
    clock = t["clock"] // 10
    return bytes([
        clock & 0xFF, clock >> 8,
        t["width"] & 0xFF, t["hblank"] & 0xFF, ((t["width"] >> 8) << 4) | (t["hblank"] >> 8),
        t["height"] & 0xFF, t["vblank"] & 0xFF, ((t["height"] >> 8) << 4) | (t["vblank"] >> 8),
        t["hfront"] & 0xFF, t["hsync"] & 0xFF, ((t["vfront"] & 0xF) << 4) | (t["vsync"] & 0xF),
        ((t["hfront"] >> 8) << 6) | ((t["hsync"] >> 8) << 4) | ((t["vfront"] >> 4) << 2) | (t["vsync"] >> 4),
        0x58, 0x54, 0x21,  # 600 x 340 mm image size
        0, 0,
        0x1A,  # digital separate sync, +hsync -vsync (CVT-RB)
    ])


def displayid_timing(t):
    # DisplayID 1.3 Type I detailed timing: every value is stored minus 1, 24-bit clock in 10 kHz
    def word(value, flag=0):
        return [(value - 1) & 0xFF, ((value - 1) >> 8) | flag]
    clock = t["clock"] // 10 - 1
    return bytes([clock & 0xFF, (clock >> 8) & 0xFF, clock >> 16, 0x04]  # 16:9, progressive
                 + word(t["width"]) + word(t["hblank"]) + word(t["hfront"], 0x80) + word(t["hsync"])
                 + word(t["height"]) + word(t["vblank"]) + word(t["vfront"]) + word(t["vsync"]))


def displayid_extension(modes):
    payload = bytes([0x03, 0x00, 20 * len(modes)]) + b"".join(displayid_timing(cvt_rb(*m)) for m in modes)
    section = bytes([0x13, len(payload), 0x00, 0x00]) + payload
    section += bytes([(-sum(section)) & 0xFF])
    ext = bytearray(128)
    ext[0] = 0x70
    ext[1:1 + len(section)] = section
    return with_checksum(ext)


def with_checksum(block):
    block = bytearray(block)
    block[127] = (-sum(block[:127])) & 0xFF
    return bytes(block)


def build(extra_modes):
    base = bytearray(128)
    base[0:54] = HEADER
    base[54:126] = b"".join(detailed_timing(cvt_rb(*m)) for m in BASE_MODES)
    dtd_modes = [m for m in extra_modes if cvt_rb(*m)["clock"] <= DTD_MAX_CLOCK_KHZ]
    fast_modes = [m for m in extra_modes if m not in dtd_modes]
    assert all(cvt_rb(*m)["clock"] <= DTD_MAX_CLOCK_KHZ for m in BASE_MODES)
    assert len(fast_modes) <= 5  # 5 Type I timings fit one DisplayID block
    chunks = [dtd_modes[start:start + DTDS_PER_EXTENSION]
              for start in range(0, len(dtd_modes), DTDS_PER_EXTENSION)]
    base[126] = len(chunks) + (1 if fast_modes else 0)
    blocks = [with_checksum(base)]
    for chunk in chunks:
        ext = bytearray(128)
        ext[0:4] = bytes([0x02, 0x03, 4, 0x00])
        dtds = b"".join(detailed_timing(cvt_rb(*m)) for m in chunk)
        ext[4:4 + len(dtds)] = dtds
        blocks.append(with_checksum(ext))
    if fast_modes:
        blocks.append(displayid_extension(fast_modes))
    return b"".join(blocks)


def parse_mode(text):
    match = re.fullmatch(r"(\d+)x(\d+)@(\d+)", text)
    if not match:
        raise argparse.ArgumentTypeError(f"{text}: expected WIDTHxHEIGHT@FPS, e.g. 3440x1440@100")
    return tuple(int(part) for part in match.groups())


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="EDID for the virtual streaming monitor")
    parser.add_argument("--mode", action="append", type=parse_mode, default=[],
                        help="extra mode WIDTHxHEIGHT@FPS, can be repeated")
    parser.add_argument("--list", action="store_true", help="print the default modes and exit")
    parser.add_argument("output", nargs="?", help="EDID file to write")
    arguments = parser.parse_args()
    if arguments.list:
        print(" ".join(f"{w}x{h}@{f}" for w, h, f in BASE_MODES + EXTRA_MODES))
        sys.exit(0)
    if not arguments.output:
        parser.error("output file missing")
    extra_modes = EXTRA_MODES + [m for m in arguments.mode if m not in BASE_MODES + EXTRA_MODES]
    edid = build(extra_modes)
    assert len(edid) == 128 * (1 + edid[126])
    assert all(sum(edid[offset:offset + 128]) % 256 == 0 for offset in range(0, len(edid), 128))
    open(arguments.output, "wb").write(edid)
