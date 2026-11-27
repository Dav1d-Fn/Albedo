# Wake-on-LAN

The Deck app wakes the PC with a magic packet: when the PC is unreachable, the home screen shows a
status panel in place of the games with the button **PC aufwecken** (A; Y does the same anywhere on
the home screen). It sends the packet and waits up to 2 minutes for Sunshine to answer, showing the
seconds; then the list loads by itself. On timeout the panel says so and offers "Erneut versuchen".
While the panel shows, the Deck checks every 5 s whether Sunshine answers (TCP connect to port 47989),
so a PC started by hand is picked up without pressing anything.

- The PC's MAC address is learned automatically from the Deck's ARP table after the first
  successful connection over the home network (settings `hostMac`). Before that, the panel explains
  that the MAC is still unknown and A / Y only retry.
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
4. Test: shut the PC down, then on the Deck in the home Wi-Fi press A on "PC aufwecken" (or Y).
   Wake from full shutdown needs step 3; wake from standby only needs step 1/2.
