/// The phone page behind the QR code: pick a picture, it is sent as the raw request body.
pub struct UploadPage;

impl UploadPage
{
    pub fn render(entry_name: &str, art_kind: &str) -> String
    {
        let kind_label = match art_kind
        {
            "cover" => "Cover (Hochformat)",
            "hero" => "Titelbild (Querformat, Hintergrund)",
            _ => "Logo (am besten PNG mit transparentem Hintergrund)",
        };
        include_str!("upload_page.html")
            .replace("{{ENTRY_NAME}}", &Self::escape_html(entry_name))
            .replace("{{KIND_LABEL}}", kind_label)
    }

    fn escape_html(text: &str) -> String
    {
        text.replace('&', "&amp;")
            .replace('<', "&lt;")
            .replace('>', "&gt;")
            .replace('"', "&quot;")
            .replace('\'', "&#39;")
    }
}
