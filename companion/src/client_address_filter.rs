use std::net::IpAddr;

/// Decides which clients may talk to the companion: loopback, home network (private IPv4,
/// IPv6 ULA/link-local) and Tailscale (100.64.0.0/10). Everything else gets 403.
pub struct ClientAddressFilter;

impl ClientAddressFilter
{
    pub fn is_allowed(address: IpAddr) -> bool
    {
        match address
        {
            IpAddr::V4(ipv4_address) =>
            {
                let octets = ipv4_address.octets();
                let is_tailscale = octets[0] == 100 && (octets[1] & 0b1100_0000) == 64;
                ipv4_address.is_loopback() || ipv4_address.is_private() || is_tailscale
            }
            IpAddr::V6(ipv6_address) =>
            {
                if let Some(mapped_ipv4) = ipv6_address.to_ipv4_mapped()
                {
                    return Self::is_allowed(IpAddr::V4(mapped_ipv4));
                }
                let first_segment = ipv6_address.segments()[0];
                let is_unique_local = (first_segment & 0xfe00) == 0xfc00;
                let is_link_local = (first_segment & 0xffc0) == 0xfe80;
                ipv6_address.is_loopback() || is_unique_local || is_link_local
            }
        }
    }
}

#[cfg(test)]
mod tests
{
    use super::ClientAddressFilter;

    #[test]
    fn allows_home_network_and_tailscale_only()
    {
        let allowed = ["127.0.0.1", "192.168.178.50", "10.0.0.3", "172.20.1.1", "100.101.1.2", "::1", "fd7a:115c::1"];
        let blocked = ["8.8.8.8", "100.128.0.1", "2a02:8070::1", "172.32.0.1"];
        for address in allowed
        {
            assert!(ClientAddressFilter::is_allowed(address.parse().unwrap()), "{}", address);
        }
        for address in blocked
        {
            assert!(!ClientAddressFilter::is_allowed(address.parse().unwrap()), "{}", address);
        }
    }
}
