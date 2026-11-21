use crate::request_language::RequestLanguage;

/// The phone page behind the QR code: pick a picture, it is sent as the raw request body.
/// Its texts follow the phone browser's language (Accept-Language of the page request).
pub struct UploadPage;

impl UploadPage
{
    pub fn render(entry_name: &str, art_kind: &str) -> String
    {
        let kind_label = match art_kind
        {
            "cover" => RequestLanguage::pick("Cover (Hochformat)", "Cover (portrait)"),
            "hero" => RequestLanguage::pick(
                "Titelbild (Querformat, Hintergrund)",
                "Title art (landscape, background)",
            ),
            _ => RequestLanguage::pick(
                "Logo (am besten PNG mit transparentem Hintergrund)",
                "Logo (ideally PNG with a transparent background)",
            ),
        };
        // Replaced inside JavaScript strings too, so none of these texts may contain a double quote.
        let texts = [
            ("{{LANGUAGE}}", RequestLanguage::pick("de", "en")),
            ("{{PAGE_TITLE}}", RequestLanguage::pick("Bild hochladen", "Upload image")),
            ("{{PICK_IMAGE}}", RequestLanguage::pick("Bild auswählen", "Choose image")),
            ("{{UPLOADING}}", RequestLanguage::pick("Wird hochgeladen …", "Uploading …")),
            (
                "{{DONE}}",
                RequestLanguage::pick(
                    "Fertig! Das Bild ist gleich auf dem Deck zu sehen. Du kannst diese Seite schließen.",
                    "Done! The image shows up on the Deck in a moment. You can close this page.",
                ),
            ),
            ("{{ERROR}}", RequestLanguage::pick("Fehler", "Error")),
            ("{{UNREACHABLE}}", RequestLanguage::pick("PC nicht erreichbar. Bist du im selben WLAN?", "PC unreachable. Are you on the same Wi-Fi?")),
        ];
        let mut page = include_str!("upload_page.html")
            .replace("{{ENTRY_NAME}}", &Self::escape_html(entry_name))
            .replace("{{KIND_LABEL}}", &kind_label);
        for (placeholder, text) in texts
        {
            page = page.replace(placeholder, &text);
        }
        page
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

#[cfg(test)]
mod tests
{
    use super::UploadPage;
    use crate::request_language::RequestLanguage;

    #[test]
    fn page_follows_the_browser_language()
    {
        RequestLanguage::set_from_header(Some("en-US,en;q=0.9"));
        let english_page = UploadPage::render("Hades II", "cover");
        assert!(english_page.contains("Choose image"));
        assert!(!english_page.contains("{{"));

        RequestLanguage::set_from_header(Some("de-DE,de;q=0.9"));
        let german_page = UploadPage::render("Hades II", "cover");
        assert!(german_page.contains("Bild auswählen"));
        assert!(german_page.contains("lang=\"de\""));
    }
}
