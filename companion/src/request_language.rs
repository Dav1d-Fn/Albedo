use std::sync::atomic::{AtomicBool, Ordering};

static GERMAN: AtomicBool = AtomicBool::new(false);

/// Language of the request being answered, from its Accept-Language header: the launcher sends
/// its UI language, a phone's browser sends the phone's. Requests are handled one after another,
/// so one global switch is enough. English unless German comes first.
pub struct RequestLanguage;

impl RequestLanguage
{
    pub fn set_from_header(accept_language: Option<&str>)
    {
        GERMAN.store(
            accept_language.map(Self::prefers_german).unwrap_or(false),
            Ordering::Relaxed,
        );
    }

    /// The first German or English tag decides; browsers list languages in order of preference.
    /// "de-DE,de;q=0.9,en;q=0.8" -> true, "en-US,de;q=0.5" -> false.
    pub fn prefers_german(accept_language: &str) -> bool
    {
        for language_range in accept_language.split(',')
        {
            let tag = language_range
                .split(';')
                .next()
                .unwrap_or_default()
                .trim()
                .to_ascii_lowercase();
            let primary_subtag = tag.split('-').next().unwrap_or_default();
            if primary_subtag == "de"
            {
                return true;
            }
            if primary_subtag == "en"
            {
                return false;
            }
        }
        false
    }

    pub fn is_german() -> bool
    {
        GERMAN.load(Ordering::Relaxed)
    }

    pub fn pick(german: &str, english: &str) -> String
    {
        if Self::is_german()
        {
            german.to_string()
        }
        else
        {
            english.to_string()
        }
    }
}

#[cfg(test)]
mod tests
{
    use super::RequestLanguage;

    #[test]
    fn first_german_or_english_tag_decides()
    {
        assert!(RequestLanguage::prefers_german(
            "de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7"
        ));
        assert!(RequestLanguage::prefers_german("de"));
        assert!(RequestLanguage::prefers_german("fr-FR, DE;q=0.8, en;q=0.5"));
        assert!(!RequestLanguage::prefers_german("en-US,de;q=0.5"));
        assert!(!RequestLanguage::prefers_german("fr"));
        assert!(!RequestLanguage::prefers_german(""));
    }
}
