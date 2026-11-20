use std::collections::BTreeMap;
use std::net::Ipv4Addr;
use std::time::{Duration, Instant};

use mdns_sd::{ServiceDaemon, ServiceEvent};
use serde::Serialize;

/// A Sunshine/GameStream host found on the local network.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveredHost
{
    pub name: String,
    pub address: String,
}

/// Finds Sunshine hosts via mDNS (`_nvstream._tcp`), the same way Moonlight does.
pub struct HostDiscovery;

impl HostDiscovery
{
    const SERVICE_TYPE: &'static str = "_nvstream._tcp.local.";

    /// Browses for `duration` and returns one entry per host (blocking).
    pub fn search(duration: Duration) -> Result<Vec<DiscoveredHost>, String>
    {
        let daemon = ServiceDaemon::new().map_err(|error| error.to_string())?;
        let receiver = daemon.browse(Self::SERVICE_TYPE).map_err(|error| error.to_string())?;

        // Keyed by instance name; the same host answers once per network interface.
        let mut hosts: BTreeMap<String, DiscoveredHost> = BTreeMap::new();
        let deadline = Instant::now() + duration;

        while let Some(remaining) = deadline.checked_duration_since(Instant::now())
        {
            let Ok(event) = receiver.recv_timeout(remaining) else
            {
                break;
            };
            if let ServiceEvent::ServiceResolved(service) = event
            {
                let name = service.fullname.trim_end_matches(Self::SERVICE_TYPE).trim_end_matches('.').to_string();
                let addresses: Vec<Ipv4Addr> = service.get_addresses_v4().into_iter().collect();
                if let Some(address) = Self::preferred_address(&addresses)
                {
                    hosts.insert(name.clone(), DiscoveredHost { name, address: address.to_string() });
                }
            }
        }

        let _ = daemon.shutdown();
        Ok(hosts.into_values().collect())
    }

    /// Picks the address most likely reachable from the Deck.
    // ponytail: naive ranking (home LAN first, Docker bridge last); add a reachability probe if it picks wrong.
    fn preferred_address(addresses: &[Ipv4Addr]) -> Option<Ipv4Addr>
    {
        addresses.iter().copied().min_by_key(|address|
        {
            let octets = address.octets();
            if octets[0] == 192 && octets[1] == 168
            {
                0
            }
            else if octets[0] == 10
            {
                1
            }
            else if octets[0] == 172 && octets[1] == 17
            {
                // Docker default bridge.
                9
            }
            else if address.is_private()
            {
                2
            }
            else
            {
                // Tailscale (100.x) and anything else.
                5
            }
        })
    }
}

#[cfg(test)]
mod tests
{
    use super::*;

    #[test]
    fn prefers_home_network_over_docker_and_tailscale()
    {
        let addresses = [Ipv4Addr::new(172, 17, 0, 1), Ipv4Addr::new(100, 64, 1, 2), Ipv4Addr::new(192, 168, 178, 20)];
        assert_eq!(HostDiscovery::preferred_address(&addresses), Some(Ipv4Addr::new(192, 168, 178, 20)));
    }
}

#[cfg(test)]
mod network_tests
{
    use super::*;

    /// Needs a Sunshine host on the LAN: `cargo test -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn finds_hosts_on_the_network()
    {
        let hosts = HostDiscovery::search(Duration::from_secs(3)).unwrap();
        for host in &hosts
        {
            println!("found {} at {}", host.name, host.address);
        }
        assert!(!hosts.is_empty());
    }
}
