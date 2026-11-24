# Wake-on-LAN

The Deck app wakes the PC with a magic packet: on the home screen, when the PC is unreachable,
**Y** sends it ("Y weckt den PC") and waits up to 2 minutes for Sunshine to answer.

- The PC's MAC address is learned automatically from the Deck's ARP table after the first
  successful connection over the home network (settings `hostMac`). Before that, Y only reloads.
- The packet goes to 255.255.255.255, the /24 broadcast of the home address and the address itself,
  on UDP ports 9 and 7. It only works **on the home network**; over Tailscale the PC must already be running.

## PC side (Fedora, Intel I211 `enp5s0`, Gigabyte X570 AORUS ELITE)

1. Check the network card (needs root):

   ```bash
   sudo ethtool enp5s0 | grep -i wake
   ```

   `Supports Wake-on: pumbg` and `Wake-on: g` = ready. `Wake-on: d` = off.

2. If it says `d`, let NetworkManager turn it on for every boot (connection "LAN"):

   ```bash
   sudo nmcli connection modify LAN 802-3-ethernet.wake-on-lan magic
   sudo nmcli connection up LAN
   ```

3. BIOS (Gigabyte, F-key DEL at boot):
   - Settings → Platform Power → **ErP: Disabled** (with ErP on, the card has no power when the PC is off)
   - Settings → Platform Power → **Wake on LAN: Enabled** / "Power On By PCI-E: Enabled" (name depends on the BIOS version)
4. Test: shut the PC down, then on the Deck in the home Wi-Fi press Y on the PC chip.
   Wake from full shutdown needs step 3; wake from standby only needs step 1/2.
