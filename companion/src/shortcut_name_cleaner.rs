/// Turns the name of a non-Steam shortcut into a readable game name for the library and the
/// Sunshine app: "Mario Kart 8 Deluxe [0100152000022000]+[v1.7.2] (nsw2u)_patched" becomes
/// "Mario Kart 8 Deluxe", "Pokemon.Scarlet.NSW-nogrp" becomes "Pokemon Scarlet" and
/// "PokemonEmerald.exe" becomes "Pokemon Emerald".
///
/// Conservative on purpose: Sunshine app names must stay unique, so brackets that carry real
/// information ("(Nintendo Switch)" vs. "(Nintendo Wii U)", "(Recomp, 16:9)") stay. Only square
/// brackets (title ids, versions) and parentheses made of release words go away.
pub struct ShortcutNameCleaner;

impl ShortcutNameCleaner
{
    /// Words of file releases that are not part of the game's name.
    const RELEASE_WORDS: [&'static str; 8] = [
        "nsw", "nsp", "xci", "nsw2u", "rom", "iso", "patched", "repack",
    ];

    pub fn clean(raw_name: &str) -> String
    {
        let mut name = raw_name.trim().to_string();

        let was_executable = name.to_lowercase().ends_with(".exe");
        if was_executable
        {
            name.truncate(name.len() - ".exe".len());
        }

        // "Pokemon.Scarlet.NSW-nogrp": dots stand for spaces, the last "-group" is the release group.
        if !name.contains(' ') && name.contains('.')
        {
            if let Some(dash_position) = name.rfind('-')
            {
                let release_group = &name[dash_position + 1..];
                if !release_group.is_empty()
                    && release_group
                        .chars()
                        .all(|character| character.is_ascii_alphanumeric())
                {
                    name.truncate(dash_position);
                }
            }
            name = name.replace('.', " ");
        }

        // "PokemonEmerald.exe" -> "Pokemon Emerald"; only for program files, a name like
        // "EmulationStationDE" stays as it is.
        if was_executable && !name.contains(' ')
        {
            name = Self::split_camel_case(&name);
        }

        name = Self::remove_brackets(&name);
        name = name.replace('_', " ");

        let kept_words: Vec<&str> = name
            .split_whitespace()
            .filter(|word| !Self::is_release_word(word))
            .collect();
        let cleaned_name = kept_words
            .join(" ")
            .trim_matches(|character: char| character.is_whitespace() || "+:-–".contains(character))
            .to_string();

        if cleaned_name.is_empty()
        {
            raw_name.trim().to_string()
        }
        else
        {
            cleaned_name
        }
    }

    fn is_release_word(word: &str) -> bool
    {
        Self::RELEASE_WORDS.contains(&word.to_lowercase().as_str())
    }

    fn split_camel_case(name: &str) -> String
    {
        let mut result = String::new();
        let mut previous_character: Option<char> = None;
        for character in name.chars()
        {
            if let Some(previous) = previous_character
            {
                if previous.is_lowercase() && character.is_uppercase()
                {
                    result.push(' ');
                }
            }
            result.push(character);
            previous_character = Some(character);
        }
        result
    }

    /// Drops every "[...]" and every "(...)" whose words are all release words.
    fn remove_brackets(name: &str) -> String
    {
        let mut result = String::new();
        let mut remaining = name;
        while let Some(open_position) = remaining.find(['[', '('])
        {
            let open_character = remaining[open_position..].chars().next().unwrap_or('[');
            let close_character = if open_character == '[' { ']' } else { ')' };
            let Some(close_offset) = remaining[open_position..].find(close_character)
            else
            {
                break;
            };
            let close_position = open_position + close_offset;
            let inside = &remaining[open_position + 1..close_position];
            let is_junk = open_character == '['
                || inside
                    .split(|character: char| character.is_whitespace() || character == ',')
                    .filter(|word| !word.is_empty())
                    .all(Self::is_release_word);

            result.push_str(&remaining[..open_position]);
            if is_junk
            {
                result.push(' ');
            }
            else
            {
                result.push_str(&remaining[open_position..=close_position]);
            }
            remaining = &remaining[close_position + 1..];
        }
        result.push_str(remaining);
        result
    }
}

#[cfg(test)]
mod tests
{
    use super::ShortcutNameCleaner;

    #[test]
    fn cleans_release_names_and_keeps_real_information()
    {
        let expectations = [
            (
                "Mario Kart 8 Deluxe [0100152000022000]+[v1.7.2] (nsw2u)_patched",
                "Mario Kart 8 Deluxe",
            ),
            ("Pokemon.Scarlet.NSW-nogrp", "Pokemon Scarlet"),
            (
                "Super.Mario.Bros.Wonder.NSW-nogrp",
                "Super Mario Bros Wonder",
            ),
            ("PokemonEmerald.exe", "Pokemon Emerald"),
            ("EmulationStationDE", "EmulationStationDE"),
            ("Super Smash Bros. Ultimate", "Super Smash Bros. Ultimate"),
            (
                "Mario + Rabbids Kingdom Battle",
                "Mario + Rabbids Kingdom Battle",
            ),
            (
                "Super Mario 3D World + Bowser’s Fury",
                "Super Mario 3D World + Bowser’s Fury",
            ),
            (
                "Zelda: Ocarina of Time (Recomp, 16:9)",
                "Zelda: Ocarina of Time (Recomp, 16:9)",
            ),
            (
                "The Legend of Zelda: Breath of the Wild (Nintendo Wii U)",
                "The Legend of Zelda: Breath of the Wild (Nintendo Wii U)",
            ),
            (
                "Pokemon Legends Arceus (GBA)",
                "Pokemon Legends Arceus (GBA)",
            ),
            ("[0100152000022000]", "[0100152000022000]"),
        ];
        for (raw_name, expected_name) in expectations
        {
            assert_eq!(
                ShortcutNameCleaner::clean(raw_name),
                expected_name,
                "for {:?}",
                raw_name
            );
        }
    }
}
