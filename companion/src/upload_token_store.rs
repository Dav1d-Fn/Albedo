use crate::request_language::RequestLanguage;
use std::collections::HashMap;
use std::fs::File;
use std::io::Read;
use std::time::{Duration, Instant};

/// What one upload link may change.
#[derive(Clone)]
pub struct UploadTicket
{
    pub entry_id: String,
    pub art_kind: String,
    expires_at: Instant,
}

/// One-time links for the phone upload (QR code on the Deck). Kept in memory only:
/// a restart of the service invalidates open links, which is fine for a 10-minute link.
pub struct UploadTokenStore
{
    tickets_by_token: HashMap<String, UploadTicket>,
}

impl UploadTokenStore
{
    pub const LIFETIME: Duration = Duration::from_secs(600);

    pub fn new() -> UploadTokenStore
    {
        UploadTokenStore { tickets_by_token: HashMap::new() }
    }

    pub fn issue(&mut self, entry_id: &str, art_kind: &str) -> Result<String, String>
    {
        self.tickets_by_token.retain(|_, ticket| ticket.expires_at > Instant::now());
        let token = Self::random_token()?;
        let ticket = UploadTicket
        {
            entry_id: entry_id.to_string(),
            art_kind: art_kind.to_string(),
            expires_at: Instant::now() + Self::LIFETIME,
        };
        self.tickets_by_token.insert(token.clone(), ticket);
        Ok(token)
    }

    /// The ticket of a token that is still valid; does not use it up.
    pub fn find(&self, token: &str) -> Option<UploadTicket>
    {
        self.tickets_by_token
            .get(token)
            .filter(|ticket| ticket.expires_at > Instant::now())
            .cloned()
    }

    /// Called after a successful upload: the link works only once.
    pub fn use_up(&mut self, token: &str)
    {
        self.tickets_by_token.remove(token);
    }

    /// 128 bits from the kernel's random source as hex.
    fn random_token() -> Result<String, String>
    {
        let mut random_bytes = [0u8; 16];
        File::open("/dev/urandom")
            .and_then(|mut random_source| random_source.read_exact(&mut random_bytes))
            .map_err(|error| format!("{}: {}", RequestLanguage::pick("Kein Zufall verfügbar", "No randomness available"), error))?;
        Ok(random_bytes.iter().map(|byte| format!("{:02x}", byte)).collect())
    }
}
