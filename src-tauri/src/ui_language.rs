use std::sync::atomic::{AtomicBool, Ordering};

static ENGLISH: AtomicBool = AtomicBool::new(true);

/// Language of the messages the Rust side hands to the UI. The frontend sets it from the
/// settings at start and whenever it changes; English until then.
pub struct UiLanguage;

impl UiLanguage
{
    /// "de" switches to German, anything else to English.
    pub fn set(language_code: &str)
    {
        ENGLISH.store(language_code != "de", Ordering::Relaxed);
    }

    /// "de" or "en", sent to the companion as Accept-Language.
    pub fn code() -> &'static str
    {
        if ENGLISH.load(Ordering::Relaxed)
        {
            "en"
        }
        else
        {
            "de"
        }
    }

    pub fn pick(german: &str, english: &str) -> String
    {
        if ENGLISH.load(Ordering::Relaxed)
        {
            english.to_string()
        }
        else
        {
            german.to_string()
        }
    }
}
