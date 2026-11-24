use std::fs;
use std::net::{Ipv4Addr, SocketAddr, ToSocketAddrs, UdpSocket};

/// Wake-on-LAN: learns the PC's MAC address from the Deck's ARP table and sends the magic packet.
///
/// The packet is a LAN broadcast, so it only reaches the PC from the home network.
/// Over Tailscale or from another network it goes nowhere; the caller says so in the UI.
pub struct WakeOnLan;

impl WakeOnLan
{
    const ARP_TABLE_PATH: &'static str = "/proc/net/arp";
    /// Port 9 ("discard") is the usual one, 7 ("echo") the other one some network cards listen on.
    const WAKE_PORTS: [u16; 2] = [9, 7];

    /// MAC of the PC as "aa:bb:cc:dd:ee:ff", when one of the addresses is an IPv4 neighbour on this LAN.
    /// Only right after a connection to the home address the ARP table has the entry.
    pub fn mac_address_for(addresses: &[String]) -> Option<String>
    {
        let arp_table = fs::read_to_string(Self::ARP_TABLE_PATH).ok()?;
        addresses
            .iter()
            .flat_map(|address| Self::ipv4_addresses(address))
            .find_map(|ipv4_address| Self::mac_in_arp_table(&arp_table, ipv4_address))
    }

    /// Sends the magic packet to the global broadcast and to the /24 broadcast and unicast of every IPv4 address.
    /// Returns the targets it was sent to, for the log.
    pub fn wake(mac_address: &str, addresses: &[String]) -> Result<Vec<String>, String>
    {
        let mac_bytes = Self::parse_mac(mac_address).ok_or_else(|| format!("invalid MAC address '{}'", mac_address))?;
        let packet = Self::magic_packet(&mac_bytes);

        let socket = UdpSocket::bind("0.0.0.0:0").map_err(|error| error.to_string())?;
        socket.set_broadcast(true).map_err(|error| error.to_string())?;

        let mut target_addresses = vec![Ipv4Addr::BROADCAST];
        for ipv4_address in addresses.iter().flat_map(|address| Self::ipv4_addresses(address))
        {
            // ponytail: assumes a /24 home network (Fritzbox default); read the interface netmask if that ever differs.
            let octets = ipv4_address.octets();
            let subnet_broadcast = Ipv4Addr::new(octets[0], octets[1], octets[2], 255);
            for target_address in [subnet_broadcast, ipv4_address]
            {
                if !target_addresses.contains(&target_address)
                {
                    target_addresses.push(target_address);
                }
            }
        }

        let mut sent_to = Vec::new();
        for target_address in target_addresses
        {
            for port in Self::WAKE_PORTS
            {
                let target = SocketAddr::from((target_address, port));
                // One unreachable target (e.g. a Tailscale address without route) must not stop the others.
                if socket.send_to(&packet, target).is_ok()
                {
                    sent_to.push(target.to_string());
                }
            }
        }
        if sent_to.is_empty()
        {
            return Err("magic packet could not be sent".to_string());
        }
        Ok(sent_to)
    }

    /// 6 x 0xFF, then the MAC 16 times.
    fn magic_packet(mac_bytes: &[u8; 6]) -> Vec<u8>
    {
        let mut packet = vec![0xFF; 6];
        for _ in 0..16
        {
            packet.extend_from_slice(mac_bytes);
        }
        packet
    }

    fn parse_mac(mac_address: &str) -> Option<[u8; 6]>
    {
        let parts: Vec<&str> = mac_address.trim().split([':', '-']).collect();
        if parts.len() != 6
        {
            return None;
        }
        let mut mac_bytes = [0u8; 6];
        for (byte_index, part) in parts.iter().enumerate()
        {
            mac_bytes[byte_index] = u8::from_str_radix(part, 16).ok()?;
        }
        if mac_bytes == [0u8; 6]
        {
            return None;
        }
        Some(mac_bytes)
    }

    /// IPv4 addresses of an address or host name; IPv6 and unresolvable names give none.
    fn ipv4_addresses(address: &str) -> Vec<Ipv4Addr>
    {
        let bare_address = address.trim().trim_start_matches('[').trim_end_matches(']');
        if let Ok(ipv4_address) = bare_address.parse::<Ipv4Addr>()
        {
            return vec![ipv4_address];
        }
        match (bare_address, 0).to_socket_addrs()
        {
            Ok(socket_addresses) => socket_addresses
                .filter_map(|socket_address| match socket_address
                {
                    SocketAddr::V4(ipv4_socket) => Some(*ipv4_socket.ip()),
                    SocketAddr::V6(_) => None,
                })
                .collect(),
            Err(_) => Vec::new(),
        }
    }

    /// `/proc/net/arp` columns: IP address, HW type, Flags, HW address, Mask, Device.
    /// Flags 0x0 means incomplete (no answer), so that MAC is not used.
    fn mac_in_arp_table(arp_table: &str, ipv4_address: Ipv4Addr) -> Option<String>
    {
        arp_table.lines().skip(1).find_map(|line|
        {
            let columns: Vec<&str> = line.split_whitespace().collect();
            if columns.len() < 4 || columns[0].parse::<Ipv4Addr>().ok()? != ipv4_address || columns[2] == "0x0"
            {
                return None;
            }
            Self::parse_mac(columns[3]).map(|_| columns[3].to_lowercase())
        })
    }
}

#[cfg(test)]
mod tests
{
    use super::*;

    const SAMPLE_ARP_TABLE: &str = "IP address       HW type     Flags       HW address            Mask     Device\n\
                                    192.168.178.1    0x1         0x2         3c:a6:2f:00:11:22     *        wlan0\n\
                                    192.168.178.36   0x1         0x2         B4:2E:99:9F:D1:D9     *        wlan0\n\
                                    192.168.178.50   0x1         0x0         00:00:00:00:00:00     *        wlan0\n";

    #[test]
    fn finds_mac_in_arp_table()
    {
        let pc_address = Ipv4Addr::new(192, 168, 178, 36);
        assert_eq!(WakeOnLan::mac_in_arp_table(SAMPLE_ARP_TABLE, pc_address), Some("b4:2e:99:9f:d1:d9".to_string()));
    }

    #[test]
    fn ignores_incomplete_and_unknown_entries()
    {
        assert_eq!(WakeOnLan::mac_in_arp_table(SAMPLE_ARP_TABLE, Ipv4Addr::new(192, 168, 178, 50)), None);
        assert_eq!(WakeOnLan::mac_in_arp_table(SAMPLE_ARP_TABLE, Ipv4Addr::new(10, 0, 0, 1)), None);
    }

    #[test]
    fn builds_magic_packet()
    {
        let mac_bytes = WakeOnLan::parse_mac("b4-2e-99-9f-d1-d9").unwrap();
        let packet = WakeOnLan::magic_packet(&mac_bytes);

        assert_eq!(packet.len(), 102);
        assert_eq!(&packet[0..6], &[0xFF; 6]);
        assert_eq!(&packet[6..12], &mac_bytes);
        assert_eq!(&packet[96..102], &mac_bytes);
        assert_eq!(WakeOnLan::parse_mac("00:00:00:00:00:00"), None);
        assert_eq!(WakeOnLan::parse_mac("not a mac"), None);
    }

    /// Needs port 9, so run it as root or in a namespace:
    /// `unshare -rn sh -c 'ip link set lo up && cargo test wake_on_lan -- --ignored'`
    #[test]
    #[ignore]
    fn packet_arrives_on_port_9()
    {
        let listener = UdpSocket::bind("0.0.0.0:9").expect("port 9 needs root or `unshare -rn`");
        listener.set_read_timeout(Some(std::time::Duration::from_secs(2))).unwrap();

        let sent_to = WakeOnLan::wake("b4:2e:99:9f:d1:d9", &["127.0.0.1".to_string()]).unwrap();
        let mut received = [0u8; 200];
        let (received_length, _) = listener.recv_from(&mut received).unwrap();

        assert!(sent_to.contains(&"127.0.0.1:9".to_string()));
        assert_eq!(received_length, 102);
        assert_eq!(&received[..received_length], WakeOnLan::magic_packet(&WakeOnLan::parse_mac("b4:2e:99:9f:d1:d9").unwrap()).as_slice());
    }
}
