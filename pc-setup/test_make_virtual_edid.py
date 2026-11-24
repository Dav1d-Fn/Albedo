#!/usr/bin/env python3
# Self-check for make-virtual-edid.py: python3 pc-setup/test_make_virtual_edid.py
import importlib.util
import pathlib

spec = importlib.util.spec_from_file_location("edid", pathlib.Path(__file__).with_name("make-virtual-edid.py"))
edid = importlib.util.module_from_spec(spec)
spec.loader.exec_module(edid)

# Every mode survives a build and read back, including DisplayID ones (4K@100, wider than 4095).
extra_modes = edid.EXTRA_MODES + [(2560, 1600, 90), (5120, 1440, 120), (3440, 1440, 100)]
built = edid.build(extra_modes)
assert all(sum(built[offset:offset + 128]) % 256 == 0 for offset in range(0, len(built), 128))
assert edid.read_modes(built) == edid.BASE_MODES + [m for m in extra_modes if edid.fits_dtd(m)] \
    + [m for m in extra_modes if not edid.fits_dtd(m)], edid.read_modes(built)

# The default EDID reads back as the default list (what --keep sees on an unchanged PC).
assert edid.read_modes(edid.build(edid.EXTRA_MODES)) == edid.BASE_MODES + edid.EXTRA_MODES

for impossible in ([(1920, 1080, 500)], [(4096 + n, 2160, 120) for n in range(6)]):
    try:
        edid.build(impossible)
        raise AssertionError(f"{impossible} should be impossible")
    except edid.ImpossibleMode:
        pass
print("ok")
