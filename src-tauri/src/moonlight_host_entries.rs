use std::collections::HashMap;

/// The `[hosts]` section of Moonlight.conf as "<host number>\<key>" -> value.
pub struct MoonlightHostEntries
{
    values: HashMap<String, String>,
}

impl MoonlightHostEntries
{
    const ADDRESS_KEYS: [&'static str; 5] = ["localaddress", "manualaddress", "remoteaddress", "ipv6address", "hostname"];

    pub fn parse(config_text: &str) -> Self
    {
        let mut values = HashMap::new();
        let mut in_hosts_section = false;

        for line in config_text.lines()
        {
            let line = line.trim();
            if line.starts_with('[')
            {
                in_hosts_section = line == "[hosts]";
                continue;
            }
            if !in_hosts_section
            {
                continue;
            }
            if let Some((key, value)) = line.split_once('=')
            {
                values.insert(key.to_string(), value.to_string());
            }
        }
        Self { values }
    }

    pub fn value(&self, host_number: &str, key: &str) -> Option<&String>
    {
        self.values.get(&format!("{}\\{}", host_number, key))
    }

    /// The host whose stored address or name matches what the launcher uses.
    pub fn host_number_for_address(&self, address: &str) -> Option<String>
    {
        let address = address.trim();
        self.values.iter().find_map(|(key, value)|
        {
            let (host_number, field) = key.split_once('\\')?;
            let is_address_field = Self::ADDRESS_KEYS.contains(&field);
            if is_address_field && value.eq_ignore_ascii_case(address)
            {
                Some(host_number.to_string())
            }
            else
            {
                None
            }
        })
    }

    /// (app id, app name) pairs from keys like `1\apps\3\id` and `1\apps\3\name`.
    pub fn apps_of(&self, host_number: &str) -> Vec<(String, String)>
    {
        let apps_prefix = format!("{}\\apps\\", host_number);
        let mut apps = Vec::new();

        for (key, app_id) in &self.values
        {
            let Some(app_key) = key.strip_prefix(&apps_prefix) else
            {
                continue;
            };
            let Some(app_number) = app_key.strip_suffix("\\id") else
            {
                continue;
            };
            if let Some(app_name) = self.values.get(&format!("{}{}\\name", apps_prefix, app_number))
            {
                apps.push((app_id.clone(), app_name.clone()));
            }
        }
        apps
    }
}

#[cfg(test)]
mod tests
{
    use super::*;

    const SAMPLE_CONFIG: &str = "[General]\nfoo=bar\n\n[hosts]\n1\\apps\\1\\id=111\n1\\apps\\1\\name=Desktop\n\
                                 1\\apps\\2\\id=222\n1\\apps\\2\\name=Elden Ring\n1\\localaddress=192.168.178.36\n\
                                 1\\uuid=AAAA\n2\\localaddress=192.168.178.50\n2\\uuid=BBBB\nsize=2\n";

    #[test]
    fn finds_host_by_address()
    {
        let entries = MoonlightHostEntries::parse(SAMPLE_CONFIG);

        assert_eq!(entries.host_number_for_address("192.168.178.36"), Some("1".to_string()));
        assert_eq!(entries.value("1", "uuid"), Some(&"AAAA".to_string()));
        assert_eq!(entries.host_number_for_address("10.0.0.1"), None);
    }

    #[test]
    fn maps_app_ids_to_names()
    {
        let entries = MoonlightHostEntries::parse(SAMPLE_CONFIG);
        let mut apps = entries.apps_of("1");
        apps.sort();

        assert_eq!(apps, vec![("111".to_string(), "Desktop".to_string()), ("222".to_string(), "Elden Ring".to_string())]);
    }
}
