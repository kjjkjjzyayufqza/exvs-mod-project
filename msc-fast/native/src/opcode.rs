pub const CMD_BEGIN: u8 = 0x02;
pub const CMD_END: u8 = 0x03;
pub const CMD_JUMP: u8 = 0x04;
pub const CMD_JUMP5: u8 = 0x05;
pub const CMD_RETURN: u8 = 0x06;
pub const CMD_RETURN_VOID: u8 = 0x07;
pub const CMD_PUSH_INT: u8 = 0x0A;
pub const CMD_PUSH_VAR: u8 = 0x0B;
pub const CMD_PUSH_SHORT: u8 = 0x0D;
pub const CMD_NOT: u8 = 0x2B;
pub const CMD_PRINTF: u8 = 0x2C;
pub const CMD_SYS: u8 = 0x2D;
pub const CMD_TRY: u8 = 0x2E;
pub const CMD_CALL: u8 = 0x2F;
pub const CMD_SET_MAIN: u8 = 0x30;
pub const CMD_CALL3: u8 = 0x31;
pub const CMD_IF: u8 = 0x34;
pub const CMD_IF_NOT: u8 = 0x35;
pub const CMD_ELSE: u8 = 0x36;
pub const CMD_I2F: u8 = 0x38;
pub const CMD_F2I: u8 = 0x39;

/// Parameter format chars; empty means opcode-only.
pub fn format_of(op: u8) -> &'static [u8] {
    match op {
        0x02 => b"HH",
        0x04 | 0x05 | 0x0A | 0x2E | 0x34 | 0x35 | 0x36 => b"I",
        0x0B | 0x14 | 0x15 | 0x1C..=0x24 | 0x3F..=0x45 => b"BH",
        0x0D => b"H",
        0x2C | 0x2F | 0x30 | 0x31 | 0x38 | 0x39 => b"B",
        0x2D => b"BB",
        _ => b"",
    }
}

pub fn size_of(op: u8) -> usize {
    1 + format_of(op)
        .iter()
        .map(|c| match c {
            b'B' => 1,
            b'H' => 2,
            b'I' => 4,
            _ => 0,
        })
        .sum::<usize>()
}

pub fn assign_int(op: &str) -> u8 {
    match op {
        "=" => 0x1C,
        "+=" => 0x1D,
        "-=" => 0x1E,
        "*=" => 0x1F,
        "/=" => 0x20,
        "%=" => 0x21,
        "&=" => 0x22,
        "|=" => 0x23,
        "^=" => 0x24,
        _ => panic!("unsupported assign {op}"),
    }
}

pub fn binary_int(op: &str) -> u8 {
    match op {
        "+" => 0x0E,
        "-" => 0x0F,
        "*" => 0x10,
        "/" => 0x11,
        "%" => 0x12,
        "==" => 0x25,
        "!=" => 0x26,
        "<" => 0x27,
        "<=" => 0x28,
        ">" => 0x29,
        ">=" => 0x2A,
        "&" => 0x16,
        "|" => 0x17,
        "^" => 0x19,
        "<<" => 0x1A,
        ">>" => 0x1B,
        _ => panic!("unsupported binary {op}"),
    }
}
