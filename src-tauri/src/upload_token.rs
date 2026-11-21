use serde::{Deserialize, Serialize};

/// Answer of the companion's `POST /api/upload-token`: a one-time page for the phone to send a picture.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadToken
{
    /// Upload page on the PC, with the address the launcher reached the companion on.
    pub url: String,
    /// QR code of `url` as SVG (viewBox only, scales freely).
    pub qr_svg: String,
    pub expires_in_seconds: u64,
}
