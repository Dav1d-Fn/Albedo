use std::net::{SocketAddr, TcpStream, ToSocketAddrs};
use std::sync::mpsc;
use std::thread;
use std::time::Duration;

/// Picks the first reachable address of the PC, like Moonlight does with its local and remote address.
///
/// All addresses are tried at the same time (TCP connect to Sunshine's HTTP port), but the list
/// order wins: the home address is taken whenever it answers, Tailscale only when it does not.
pub struct HostAddressPicker
{
    addresses: Vec<String>,
    timeout: Duration,
}

impl HostAddressPicker
{
    /// Sunshine's HTTP port, the one Moonlight asks first (`serverinfo`).
    const SUNSHINE_PORT: u16 = 47989;

    pub fn new(addresses: Vec<String>, timeout: Duration) -> Self
    {
        let addresses = addresses
            .into_iter()
            .map(|address| address.trim().to_string())
            .filter(|address| !address.is_empty())
            .collect();
        Self { addresses, timeout }
    }

    /// The first address in list order that accepts a connection, None when none does.
    pub fn pick(&self) -> Option<String>
    {
        if self.addresses.is_empty()
        {
            return None;
        }

        let (result_sender, result_receiver) = mpsc::channel::<(usize, bool)>();
        for (address_index, address) in self.addresses.iter().enumerate()
        {
            let result_sender = result_sender.clone();
            let address = address.clone();
            let timeout = self.timeout;
            thread::spawn(move ||
            {
                let reachable = Self::is_reachable(&address, timeout);
                // The receiver may be gone already when an earlier address won.
                let _ = result_sender.send((address_index, reachable));
            });
        }
        drop(result_sender);

        // None = no answer yet. Decide as soon as every address before the first reachable one failed.
        let mut answers: Vec<Option<bool>> = vec![None; self.addresses.len()];
        while let Ok((address_index, reachable)) = result_receiver.recv()
        {
            answers[address_index] = Some(reachable);
            for (candidate_index, answer) in answers.iter().enumerate()
            {
                match answer
                {
                    Some(true) => return Some(self.addresses[candidate_index].clone()),
                    Some(false) => continue,
                    None => break,
                }
            }
        }
        None
    }

    fn is_reachable(address: &str, timeout: Duration) -> bool
    {
        Self::socket_addresses(address)
            .iter()
            .any(|socket_address| TcpStream::connect_timeout(socket_address, timeout).is_ok())
    }

    /// Accepts IPv4, IPv6 (with or without brackets) and host names.
    fn socket_addresses(address: &str) -> Vec<SocketAddr>
    {
        let bare_address = address.trim_start_matches('[').trim_end_matches(']');
        match (bare_address, Self::SUNSHINE_PORT).to_socket_addrs()
        {
            Ok(socket_addresses) => socket_addresses.collect(),
            Err(_) => Vec::new(),
        }
    }
}

#[cfg(test)]
mod tests
{
    use std::net::TcpListener;

    use super::*;

    #[test]
    fn empty_list_picks_nothing()
    {
        let picker = HostAddressPicker::new(vec![" ".into()], Duration::from_millis(200));
        assert_eq!(picker.pick(), None);
    }

    #[test]
    fn unreachable_addresses_pick_nothing()
    {
        // 192.0.2.0/24 is reserved for documentation and never routed.
        let picker = HostAddressPicker::new(vec!["192.0.2.1".into(), "no-such-host.invalid".into()], Duration::from_millis(300));
        assert_eq!(picker.pick(), None);
    }

    #[test]
    fn skips_an_unreachable_first_address()
    {
        // Only works when nothing else listens on Sunshine's port here, which is the case on the Deck.
        let Ok(_listener) = TcpListener::bind(("127.0.0.1", HostAddressPicker::SUNSHINE_PORT)) else
        {
            return;
        };
        let picker = HostAddressPicker::new(vec!["192.0.2.1".into(), "127.0.0.1".into()], Duration::from_millis(500));
        assert_eq!(picker.pick(), Some("127.0.0.1".to_string()));
    }
}
