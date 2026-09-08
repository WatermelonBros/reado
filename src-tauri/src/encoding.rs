//! Text encodings: detecting one, decoding with it, and writing it back.
//!
//! Reado assumed UTF-8 everywhere, which is right for almost every file and
//! wrong in the way that costs you an afternoon: a latin-1 or Shift-JIS file
//! opened as UTF-8 either fails to decode (and shows as "binary") or comes back
//! full of replacement characters, and saving it then writes that damage to
//! disk.
//!
//! Detection is deliberately modest — a byte-order mark, then a UTF-8 validity
//! check, then a legacy fallback — because guessing between two 8-bit encodings
//! is not reliably possible, and the honest answer is to name a guess the reader
//! can override ("Reopen with Encoding").

use encoding_rs::Encoding;
use serde::{Deserialize, Serialize};

/// The encodings Reado offers, by the label the UI shows.
///
/// `encoding_rs` knows many more; this is the list worth putting in a menu —
/// the Unicode forms, the two 8-bit encodings that dominate western legacy
/// files, and the CJK ones people actually still hit.
pub const ENCODINGS: &[&str] = &[
    "utf-8",
    "utf-8-bom",
    "utf-16le",
    "utf-16be",
    "windows-1252",
    "iso-8859-1",
    "windows-1251",
    "shift_jis",
    "euc-jp",
    "gbk",
    "big5",
    "euc-kr",
];

/// How a file's bytes were read, and how they will be written back.
///
/// Crosses the command boundary as its label — one plain string, so the
/// frontend never has to know the shape of this enum.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Charset {
    Utf8,
    /// UTF-8 with a byte-order mark. Kept distinct from plain UTF-8 so a file
    /// that had a BOM keeps it — dropping one is a diff, and on some Windows
    /// tooling it is a breakage.
    Utf8Bom,
    Utf16Le,
    Utf16Be,
    /// Anything else, by its `encoding_rs` label.
    Other(&'static str),
}

impl Charset {
    /// The label the frontend shows and sends back.
    pub fn label(self) -> &'static str {
        match self {
            Charset::Utf8 => "utf-8",
            Charset::Utf8Bom => "utf-8-bom",
            Charset::Utf16Le => "utf-16le",
            Charset::Utf16Be => "utf-16be",
            Charset::Other(name) => name,
        }
    }

    /// Detect this file's encoding, or `None` when the bytes are not text at
    /// all.
    ///
    /// The fallback is windows-1252 — the 8-bit encoding a western legacy file
    /// is most likely to be, and a superset of latin-1's upper range. It has to
    /// be gated on {@link looks_textual}: every byte sequence decodes as
    /// windows-1252, so without that gate a PNG would open as text.
    pub fn detect_default(bytes: &[u8]) -> Option<Charset> {
        match detect(bytes, Charset::Other("windows-1252")) {
            Charset::Other(name) if !looks_textual(bytes) => {
                let _ = name;
                None
            }
            other => Some(other),
        }
    }

    /// Parse a label from the frontend. Unknown labels fall back to UTF-8 rather
    /// than failing: the alternative is a file that won't open at all.
    pub fn from_label(label: &str) -> Charset {
        match label.to_ascii_lowercase().as_str() {
            "utf-8" => Charset::Utf8,
            "utf-8-bom" => Charset::Utf8Bom,
            "utf-16le" => Charset::Utf16Le,
            "utf-16be" => Charset::Utf16Be,
            other => Encoding::for_label(other.as_bytes())
                .map(|e| Charset::Other(e.name()))
                .unwrap_or(Charset::Utf8),
        }
    }
}

impl Serialize for Charset {
    fn serialize<S: serde::Serializer>(&self, s: S) -> std::result::Result<S::Ok, S::Error> {
        s.serialize_str(self.label())
    }
}

impl<'de> Deserialize<'de> for Charset {
    fn deserialize<D: serde::Deserializer<'de>>(d: D) -> std::result::Result<Self, D::Error> {
        Ok(Charset::from_label(&String::deserialize(d)?))
    }
}

/// The byte-order mark for an encoding, if it has one.
fn bom(charset: Charset) -> &'static [u8] {
    match charset {
        Charset::Utf8Bom => &[0xEF, 0xBB, 0xBF],
        Charset::Utf16Le => &[0xFF, 0xFE],
        Charset::Utf16Be => &[0xFE, 0xFF],
        _ => &[],
    }
}

/// Whether these bytes could be text in *some* 8-bit encoding.
///
/// Control characters are the tell: a legacy text file has tabs, newlines and
/// the odd escape; a binary file is full of the rest of the C0 range. This is
/// what stands between "read anything as windows-1252" and opening a PNG in the
/// editor, because that encoding maps every possible byte to a character.
pub fn looks_textual(bytes: &[u8]) -> bool {
    !bytes
        .iter()
        // ESC is allowed: an ANSI-coloured log is text, and a common one.
        .any(|b| b.is_ascii_control() && !matches!(b, b'\t' | b'\n' | b'\r' | 0x0B | 0x0C | 0x1B))
}

/// Detect a file's encoding from its bytes.
///
/// A BOM is definitive. Otherwise valid UTF-8 is taken as UTF-8 — the only
/// encoding whose structure is self-verifying, which is what makes this safe.
/// Anything else is *some* 8-bit encoding, and `fallback` (the reader's choice,
/// or windows-1252) names which one we will read it as.
pub fn detect(bytes: &[u8], fallback: Charset) -> Charset {
    if bytes.starts_with(&[0xEF, 0xBB, 0xBF]) {
        return Charset::Utf8Bom;
    }
    if bytes.starts_with(&[0xFF, 0xFE]) {
        return Charset::Utf16Le;
    }
    if bytes.starts_with(&[0xFE, 0xFF]) {
        return Charset::Utf16Be;
    }
    if std::str::from_utf8(bytes).is_ok() {
        return Charset::Utf8;
    }
    fallback
}

/// Decode `bytes` as `charset`. Returns `None` when the bytes can't be text in
/// that encoding at all (only possible for the UTF forms; the 8-bit encodings
/// map every byte to something).
pub fn decode(bytes: &[u8], charset: Charset) -> Option<String> {
    let body = bytes.strip_prefix(bom(charset)).unwrap_or(bytes);
    match charset {
        Charset::Utf8 | Charset::Utf8Bom => std::str::from_utf8(body).ok().map(str::to_owned),
        Charset::Utf16Le | Charset::Utf16Be => {
            let enc = if charset == Charset::Utf16Le {
                encoding_rs::UTF_16LE
            } else {
                encoding_rs::UTF_16BE
            };
            let (text, had_errors) = enc.decode_without_bom_handling(body);
            (!had_errors).then(|| text.into_owned())
        }
        Charset::Other(name) => {
            let enc = Encoding::for_label(name.as_bytes())?;
            let (text, _, had_errors) = enc.decode(body);
            (!had_errors).then(|| text.into_owned())
        }
    }
}

/// Encode `text` as `charset`, byte-order mark included where the encoding has
/// one. Returns `None` when the text contains characters the encoding cannot
/// represent — better to refuse the save than to write `?` over someone's data.
pub fn encode(text: &str, charset: Charset) -> Option<Vec<u8>> {
    let mut out = bom(charset).to_vec();
    match charset {
        Charset::Utf8 | Charset::Utf8Bom => out.extend_from_slice(text.as_bytes()),
        Charset::Utf16Le | Charset::Utf16Be => {
            for unit in text.encode_utf16() {
                let pair = if charset == Charset::Utf16Le {
                    unit.to_le_bytes()
                } else {
                    unit.to_be_bytes()
                };
                out.extend_from_slice(&pair);
            }
        }
        Charset::Other(name) => {
            let enc = Encoding::for_label(name.as_bytes())?;
            let (bytes, _, had_unmappable) = enc.encode(text);
            if had_unmappable {
                return None;
            }
            out.extend_from_slice(&bytes);
        }
    }
    Some(out)
}

/// The encodings the "Reopen with Encoding" menu offers.
#[tauri::command]
pub fn list_encodings() -> Vec<&'static str> {
    ENCODINGS.to_vec()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_byte_order_mark_is_definitive() {
        assert_eq!(detect(b"\xEF\xBB\xBFhi", Charset::Utf8), Charset::Utf8Bom);
        assert_eq!(detect(b"\xFF\xFEh\0", Charset::Utf8), Charset::Utf16Le);
        assert_eq!(detect(b"\xFE\xFF\0h", Charset::Utf8), Charset::Utf16Be);
    }

    #[test]
    fn valid_utf8_is_read_as_utf8() {
        // The one encoding whose structure verifies itself, which is what makes
        // detection safe rather than a guess.
        assert_eq!(detect("caffè ☕".as_bytes(), Charset::Utf8), Charset::Utf8);
    }

    #[test]
    fn anything_else_falls_back_to_the_named_encoding() {
        // 0xE8 is "è" in latin-1 and invalid UTF-8.
        let latin1 = b"caff\xE8";
        assert_eq!(
            detect(latin1, Charset::Other("windows-1252")),
            Charset::Other("windows-1252")
        );
    }

    #[test]
    fn a_latin1_file_decodes_to_the_text_it_meant() {
        // The whole point: opened as UTF-8 this file is "binary" or mojibake.
        let bytes = b"caff\xE8\n";
        assert!(decode(bytes, Charset::Utf8).is_none());
        assert_eq!(
            decode(bytes, Charset::Other("windows-1252")).unwrap(),
            "caffè\n"
        );
    }

    #[test]
    fn every_offered_encoding_round_trips_ascii() {
        for label in ENCODINGS {
            let charset = Charset::from_label(label);
            let bytes = encode("hello\n", charset).unwrap_or_else(|| panic!("encode {label}"));
            assert_eq!(
                decode(&bytes, charset).unwrap_or_else(|| panic!("decode {label}")),
                "hello\n",
                "{label}"
            );
        }
    }

    #[test]
    fn a_utf8_bom_survives_a_round_trip() {
        // Dropping a BOM is a diff, and on some Windows tooling a breakage.
        let bytes = encode("hi", Charset::Utf8Bom).unwrap();
        assert!(bytes.starts_with(&[0xEF, 0xBB, 0xBF]));
        assert_eq!(decode(&bytes, Charset::Utf8Bom).unwrap(), "hi");
        assert_eq!(detect(&bytes, Charset::Utf8), Charset::Utf8Bom);
    }

    #[test]
    fn utf16_round_trips_both_ways_round() {
        for charset in [Charset::Utf16Le, Charset::Utf16Be] {
            let bytes = encode("caffè ☕", charset).unwrap();
            assert_eq!(detect(&bytes, Charset::Utf8), charset);
            assert_eq!(decode(&bytes, charset).unwrap(), "caffè ☕");
        }
    }

    #[test]
    fn refuses_to_encode_what_the_charset_cannot_hold() {
        // Writing "?" over someone's emoji is worse than refusing the save.
        assert!(encode("☕", Charset::Other("windows-1252")).is_none());
        assert!(encode("☕", Charset::Utf8).is_some());
    }

    #[test]
    fn binary_is_not_read_as_latin1_just_because_it_can_be() {
        // Every byte sequence decodes as windows-1252, so without the textual
        // gate a PNG would open in the editor as mojibake.
        assert_eq!(Charset::detect_default(b"\x89PNG\r\n\x1a\n"), None);
        assert!(!looks_textual(b"\x89PNG\r\n\x1a\n"));
    }

    #[test]
    fn ordinary_text_passes_the_textual_gate() {
        assert!(looks_textual(b"caff\xE8\n\tindented\r\n"));
        // An ANSI-coloured log is text, and a common one.
        assert!(looks_textual(b"\x1b[31mred\x1b[0m\n"));
        assert_eq!(
            Charset::detect_default(b"caff\xE8"),
            Some(Charset::Other("windows-1252"))
        );
        assert_eq!(Charset::detect_default(b"plain"), Some(Charset::Utf8));
    }

    #[test]
    fn an_unknown_label_reads_as_utf8_rather_than_failing() {
        assert_eq!(Charset::from_label("not-an-encoding"), Charset::Utf8);
        assert_eq!(Charset::from_label("UTF-8"), Charset::Utf8);
        assert_eq!(
            Charset::from_label("latin1"),
            Charset::Other("windows-1252")
        );
    }

    #[test]
    fn labels_round_trip_through_parsing() {
        for label in ENCODINGS {
            let parsed = Charset::from_label(label);
            assert_eq!(
                Charset::from_label(parsed.label()),
                parsed,
                "{label} -> {}",
                parsed.label()
            );
        }
    }
}
