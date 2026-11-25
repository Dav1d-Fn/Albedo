#!/usr/bin/env python3
# Builds the EDID for the virtual streaming monitor (a free connector forced to "connected").
# Timings are CVT reduced blanking v1. Base block holds 4 modes, each CTA extension 6 more
# (DTDs only, no data blocks); as many extensions as the mode list needs. A DTD can only hold
# pixel clocks up to 655.35 MHz and sizes up to 4095, other modes (4K@100) go into a DisplayID
# extension (Type I timings, at most 5).
# Usage: make-virtual-edid.py [--keep old.bin] [--mode 3440x1440@100 ...] <out.bin>
#        make-virtual-edid.py [--keep old.bin] [--mode ...] --list   (prints the resulting mode list)
# --keep reads the modes of an existing EDID (the installed one), so added modes stay.
# An impossible mode ends with exit code 2 and the reason on stderr.
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
DTD_MAX_SIZE = 4095  # 12 bits
DISPLAYID_MAX_MODES = 5  # Type I timings in one DisplayID block
MAX_EXTENSIONS = 255  # the extension count is one byte
MIN_SIZE, MAX_SIZE = 640, 8192
MIN_FPS, MAX_FPS = 24, 360


class ImpossibleMode(Exception):
    pass


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


def fits_dtd(mode):
    width, height, _ = mode
    return cvt_rb(*mode)["clock"] <= DTD_MAX_CLOCK_KHZ and width <= DTD_MAX_SIZE and height <= DTD_MAX_SIZE


def displayid_timing(t):
    # DisplayID 1.3 Type I detailed timing: every value is stored minus 1, 24-bit clock in 10 kHz
    def word(value, flag=0):
        return [(value - 1) & 0xFF, ((value - 1) >> 8) | flag]
    clock = t["clock"] // 10 - 1
    aspect_code = {(16, 9): 4, (16, 10): 5, (4, 3): 2}.get(aspect(t["width"], t["height"]), 8)
    return bytes([clock & 0xFF, (clock >> 8) & 0xFF, clock >> 16, aspect_code]  # progressive
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
    for mode in extra_modes:
        check_mode(mode)
    dtd_modes = [m for m in extra_modes if fits_dtd(m)]
    fast_modes = [m for m in extra_modes if m not in dtd_modes]
    assert all(fits_dtd(m) for m in BASE_MODES)
    if len(fast_modes) > DISPLAYID_MAX_MODES:
        raise ImpossibleMode(f"at most {DISPLAYID_MAX_MODES} modes above 655 MHz pixel clock or 4095 pixels, "
                             f"this would be {len(fast_modes)}")
    chunks = [dtd_modes[start:start + DTDS_PER_EXTENSION]
              for start in range(0, len(dtd_modes), DTDS_PER_EXTENSION)]
    base[126] = len(chunks) + (1 if fast_modes else 0)
    if base[126] > MAX_EXTENSIONS:
        raise ImpossibleMode("too many modes for one EDID")
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


def check_mode(mode):
    width, height, fps = mode
    if not (MIN_SIZE <= width <= MAX_SIZE and MIN_SIZE // 2 <= height <= MAX_SIZE):
        raise ImpossibleMode(f"{width}x{height}: size must be {MIN_SIZE}..{MAX_SIZE} wide")
    if not MIN_FPS <= fps <= MAX_FPS:
        raise ImpossibleMode(f"{fps} Hz: refresh rate must be {MIN_FPS}..{MAX_FPS}")


def read_modes(edid):
    """Modes of an EDID: DTDs of the base block and CTA extensions, Type I timings of DisplayID blocks.
    Refresh rates are rounded (CVT-RB rounds the pixel clock down to 250 kHz)."""
    def from_timing(clock_khz, width, hblank, height, vblank):
        return (width, height, round(clock_khz * 1000 / ((width + hblank) * (height + vblank))))

    def dtd(data):
        clock = data[0] | data[1] << 8
        if clock == 0:
            return None  # display descriptor, not a timing
        return from_timing(clock * 10, data[2] | (data[4] >> 4) << 8, data[3] | (data[4] & 0xF) << 8,
                           data[5] | (data[7] >> 4) << 8, data[6] | (data[7] & 0xF) << 8)

    modes = []
    for offset in range(54, 126, 18):
        modes.append(dtd(edid[offset:offset + 18]))
    for block_start in range(128, len(edid), 128):
        block = edid[block_start:block_start + 128]
        if block[0] == 0x02:
            for offset in range(block[2], 127 - 18 + 1, 18):
                modes.append(dtd(block[offset:offset + 18]))
        elif block[0] == 0x70:
            section_end = 1 + 4 + block[2]
            position = 5
            while position + 3 <= section_end:
                tag, length = block[position], block[position + 2]
                if tag == 0x03:
                    for timing_start in range(position + 3, position + 3 + length, 20):
                        t = block[timing_start:timing_start + 20]

                        def word(index, mask=0xFF):
                            return (t[index] | (t[index + 1] & mask) << 8) + 1
                        clock_khz = ((t[0] | t[1] << 8 | t[2] << 16) + 1) * 10
                        modes.append(from_timing(clock_khz, word(4), word(6), word(12), word(14)))
                position += 3 + length
    unique_modes = []
    for mode in modes:
        if mode is not None and mode not in unique_modes:
            unique_modes.append(mode)
    return unique_modes


def parse_mode(text):
    match = re.fullmatch(r"(\d+)x(\d+)@(\d+)", text)
    if not match:
        raise argparse.ArgumentTypeError(f"{text}: expected WIDTHxHEIGHT@FPS, e.g. 3440x1440@100")
    return tuple(int(part) for part in match.groups())


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="EDID for the virtual streaming monitor")
    parser.add_argument("--mode", action="append", type=parse_mode, default=[],
                        help="extra mode WIDTHxHEIGHT@FPS, can be repeated")
    parser.add_argument("--keep", help="existing EDID whose modes stay in the new one")
    parser.add_argument("--list", action="store_true", help="print the resulting modes and exit")
    parser.add_argument("output", nargs="?", help="EDID file to write")
    arguments = parser.parse_args()
    wanted_modes = EXTRA_MODES + arguments.mode
    if arguments.keep:
        wanted_modes = read_modes(open(arguments.keep, "rb").read()) + wanted_modes
    extra_modes = []
    for mode in wanted_modes:
        if mode not in BASE_MODES and mode not in extra_modes:
            extra_modes.append(mode)
    try:
        edid = build(extra_modes)
    except ImpossibleMode as reason:
        print(reason, file=sys.stderr)
        sys.exit(2)
    if arguments.list:
        print(" ".join(f"{w}x{h}@{f}" for w, h, f in BASE_MODES + extra_modes))
        sys.exit(0)
    if not arguments.output:
        parser.error("output file missing")
    assert len(edid) == 128 * (1 + edid[126])
    assert all(sum(edid[offset:offset + 128]) % 256 == 0 for offset in range(0, len(edid), 128))
    open(arguments.output, "wb").write(edid)
