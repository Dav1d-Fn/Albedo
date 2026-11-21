use serde_json::{Map, Value};

/// Reads Steam's binary VDF (shortcuts.vdf) into a JSON tree.
/// Each field is a type byte, a NUL-terminated key and the value:
/// 0x00 nested map (ends with 0x08), 0x01 NUL-terminated string, 0x02 little-endian u32.
pub struct BinaryVdfReader<'bytes>
{
    bytes: &'bytes [u8],
    position: usize,
}

impl<'bytes> BinaryVdfReader<'bytes>
{
    pub fn parse(bytes: &'bytes [u8]) -> Option<Value>
    {
        let mut reader = BinaryVdfReader { bytes, position: 0 };
        reader.read_map()
    }

    fn read_map(&mut self) -> Option<Value>
    {
        let mut map = Map::new();
        loop
        {
            let type_byte = self.read_byte()?;
            if type_byte == 0x08
            {
                return Some(Value::Object(map));
            }
            let key = self.read_string()?;
            let value = match type_byte
            {
                0x00 => self.read_map()?,
                0x01 => Value::String(self.read_string()?),
                0x02 => Value::from(self.read_u32()?),
                _ => return None, // unknown type: the rest cannot be trusted
            };
            map.insert(key, value);
        }
    }

    fn read_byte(&mut self) -> Option<u8>
    {
        let byte = *self.bytes.get(self.position)?;
        self.position += 1;
        Some(byte)
    }

    fn read_string(&mut self) -> Option<String>
    {
        let remaining_bytes = self.bytes.get(self.position..)?;
        let string_length = remaining_bytes.iter().position(|byte| *byte == 0)?;
        let text = String::from_utf8_lossy(&remaining_bytes[..string_length]).to_string();
        self.position += string_length + 1;
        Some(text)
    }

    fn read_u32(&mut self) -> Option<u32>
    {
        let number_bytes: [u8; 4] = self.bytes.get(self.position..self.position + 4)?.try_into().ok()?;
        self.position += 4;
        Some(u32::from_le_bytes(number_bytes))
    }
}

#[cfg(test)]
mod tests
{
    use super::BinaryVdfReader;

    #[test]
    fn reads_nested_maps_strings_and_numbers()
    {
        let mut bytes = Vec::new();
        bytes.extend(b"\x00shortcuts\x00");
        bytes.extend(b"\x000\x00");
        bytes.extend(b"\x02appid\x00");
        bytes.extend(3_000_000_000u32.to_le_bytes());
        bytes.extend(b"\x01appname\x00Zelda\x00");
        bytes.extend(b"\x08\x08\x08");

        let tree = BinaryVdfReader::parse(&bytes).expect("valid vdf");
        assert_eq!(tree["shortcuts"]["0"]["appid"], 3_000_000_000u64);
        assert_eq!(tree["shortcuts"]["0"]["appname"], "Zelda");
        assert!(BinaryVdfReader::parse(&bytes[..bytes.len() - 2]).is_none());
    }
}
