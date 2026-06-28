fn obf_transform_byte(index: usize, byte: u8) -> u8 {
    let b = byte as u32;
    let mut r8d = ((b & 0x55) << 2) | (b & 0xAA);
    let cl = (index % 7) as u32;
    r8d = (r8d << 7) >> cl;
    r8d = r8d | (r8d >> 8);
    if index & 1 != 0 {
        r8d = !r8d;
    }
    r8d as u8
}

fn build_inverse_table(mod14: usize) -> [u8; 256] {
    let mut table = [0u8; 256];
    for plain in 0..256u16 {
        let enc = obf_transform_byte(mod14, plain as u8);
        table[enc as usize] = plain as u8;
    }
    table
}

pub fn obf_decrypt(data: &[u8]) -> Vec<u8> {
    let mut out = data.to_vec();
    for (i, b) in out.iter_mut().enumerate() {
        if *b == 0 {
            break;
        }
        *b = obf_transform_byte(i, *b);
    }
    out
}

pub fn obf_encrypt(data: &[u8]) -> Vec<u8> {
    let mut tables: [Option<[u8; 256]>; 14] = [None; 14];
    let mut out = data.to_vec();
    for (i, b) in out.iter_mut().enumerate() {
        if *b == 0 {
            break;
        }
        let m = i % 14;
        let table = tables[m].get_or_insert_with(|| build_inverse_table(m));
        *b = table[*b as usize];
    }
    out
}

pub fn obf_decode_to_string(data: &[u8]) -> String {
    let decrypted = obf_decrypt(data);
    let end = decrypted
        .iter()
        .position(|&b| b == 0)
        .unwrap_or(decrypted.len());
    String::from_utf8_lossy(&decrypted[..end]).into_owned()
}

pub fn obf_encode_from_string(s: &str) -> Vec<u8> {
    let mut plain = s.as_bytes().to_vec();
    plain.push(0);
    obf_encrypt(&plain)
}

pub fn read_null_terminated(data: &[u8], offset: usize) -> &[u8] {
    if offset >= data.len() {
        return &[];
    }
    let start = offset;
    let mut end = start;
    while end < data.len() && data[end] != 0 {
        end += 1;
    }
    if end < data.len() {
        &data[start..=end]
    } else {
        &data[start..end]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip_ascii() {
        let original = "Hello World";
        let encoded = obf_encode_from_string(original);
        let decoded = obf_decode_to_string(&encoded);
        assert_eq!(decoded, original);
    }

    #[test]
    fn roundtrip_japanese() {
        let original = "ガンダム";
        let encoded = obf_encode_from_string(original);
        let decoded = obf_decode_to_string(&encoded);
        assert_eq!(decoded, original);
    }

    #[test]
    fn roundtrip_empty() {
        let encoded = obf_encode_from_string("");
        let decoded = obf_decode_to_string(&encoded);
        assert_eq!(decoded, "");
    }

    #[test]
    fn transform_symmetry() {
        for idx in 0..28usize {
            let table = build_inverse_table(idx % 14);
            for plain in 1..=255u8 {
                let enc = obf_transform_byte(idx, plain);
                assert_eq!(table[enc as usize], plain, "idx={idx} plain={plain}");
            }
        }
    }
}
