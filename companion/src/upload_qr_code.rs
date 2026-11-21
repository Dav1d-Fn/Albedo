use qrcode::render::svg;
use qrcode::QrCode;

/// The QR code of an upload link as scalable SVG: white quiet zone, only a viewBox
/// (no fixed width/height), so the launcher can size it freely.
pub struct UploadQrCode;

impl UploadQrCode
{
    pub fn svg_for(url: &str) -> Result<String, String>
    {
        let qr_code = QrCode::new(url.as_bytes()).map_err(|error| format!("QR-Code nicht erstellbar: {}", error))?;
        let rendered_svg = qr_code
            .render::<svg::Color>()
            .quiet_zone(true)
            .dark_color(svg::Color("#000000"))
            .light_color(svg::Color("#ffffff"))
            .build();
        Ok(Self::without_fixed_size(&rendered_svg))
    }

    /// Drops the XML declaration and the width/height attributes of the <svg> tag.
    fn without_fixed_size(rendered_svg: &str) -> String
    {
        let svg_start = rendered_svg.find("<svg").unwrap_or(0);
        let svg_text = &rendered_svg[svg_start..];
        let tag_end = svg_text.find('>').unwrap_or(svg_text.len());
        let (opening_tag, rest) = svg_text.split_at(tag_end);
        let cleaned_tag: String = opening_tag
            .split(' ')
            .filter(|attribute| !attribute.starts_with("width=") && !attribute.starts_with("height="))
            .collect::<Vec<&str>>()
            .join(" ");
        format!("{}{}", cleaned_tag, rest)
    }
}

#[cfg(test)]
mod tests
{
    use super::UploadQrCode;

    #[test]
    fn makes_a_scalable_svg()
    {
        let svg_text = UploadQrCode::svg_for("http://192.168.178.20:47995/upload/abc").expect("qr code");
        let opening_tag = &svg_text[..svg_text.find('>').expect("tag end")];
        assert!(svg_text.starts_with("<svg"));
        assert!(opening_tag.contains("viewBox="));
        assert!(!opening_tag.contains("width=") && !opening_tag.contains("height="));
    }
}
