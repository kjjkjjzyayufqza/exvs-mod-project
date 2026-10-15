//! Over Boost stage `info/plan_param.spbin` (spawn plan).
//!
//! Little-endian. Magic `A9 B8 AC AF`, then three counts (spawn pairs,
//! markers, respawn points), then four `u64` section offsets. Section 0 is
//! the limit and a zero pad. The other three sections are fixed-stride
//! records. Every non-empty unpacked map in the local stage corpus uses this
//! layout and ends on the last respawn record.
//!
//! The fourth word of a marker is an `f32` here. MBON stores a small integer
//! in the same slot. Most Over Boost markers are `0`; a few are `pi/2`, `pi`,
//! or about eight degrees. That role is not proven, so the reader keeps the
//! raw float. A spawn pair's trailing words are usually `1`, and the second
//! point is `3.5` on some stages. Those are kept too.

use serde::{Deserialize, Serialize};

pub const PLAN_PARAM_MAGIC: [u8; 4] = [0xA9, 0xB8, 0xAC, 0xAF];
const HEADER_LEN: usize = 0x30;
const LIMIT_STRIDE: usize = 8;
const PAIR_STRIDE: usize = 32;
const MARKER_STRIDE: usize = 16;
const RESPAWN_STRIDE: usize = 16;

/// One spawn-plan file.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanParam {
    pub limit: f32,
    pub limit_padding: f32,
    pub spawn_pairs: Vec<SpawnPair>,
    pub markers: Vec<SpawnMarker>,
    pub respawn_points: Vec<RespawnPoint>,
}

/// Two points. Each trailing word is stored as shipped.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpawnPair {
    pub first: [f32; 4],
    pub second: [f32; 4],
}

/// A marker position plus its unresolved fourth float.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpawnMarker {
    pub position: [f32; 3],
    pub parameter: f32,
}

/// A respawn position. The fourth float is `0` on every file checked so far.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RespawnPoint {
    pub position: [f32; 3],
    pub padding: f32,
}

/// Write `plan_param.spbin` bytes in the canonical section order.
///
/// Every float is stored with its original bits, including a marker angle and
/// a spawn word of `3.5`.
pub fn write_plan_param(plan: &PlanParam) -> Vec<u8> {
    let pairs_at = HEADER_LEN + LIMIT_STRIDE;
    let markers_at = pairs_at + plan.spawn_pairs.len() * PAIR_STRIDE;
    let respawn_at = markers_at + plan.markers.len() * MARKER_STRIDE;
    let mut out = Vec::with_capacity(respawn_at + plan.respawn_points.len() * RESPAWN_STRIDE);
    out.extend_from_slice(&PLAN_PARAM_MAGIC);
    push_u32(&mut out, plan.spawn_pairs.len() as u32);
    push_u32(&mut out, plan.markers.len() as u32);
    push_u32(&mut out, plan.respawn_points.len() as u32);
    for offset in [HEADER_LEN, pairs_at, markers_at, respawn_at] {
        push_u64(&mut out, offset as u64);
    }
    push_f32(&mut out, plan.limit);
    push_f32(&mut out, plan.limit_padding);
    for pair in &plan.spawn_pairs {
        for value in pair.first.into_iter().chain(pair.second) {
            push_f32(&mut out, value);
        }
    }
    for marker in &plan.markers {
        for value in marker.position {
            push_f32(&mut out, value);
        }
        push_f32(&mut out, marker.parameter);
    }
    for point in &plan.respawn_points {
        for value in point.position {
            push_f32(&mut out, value);
        }
        push_f32(&mut out, point.padding);
    }
    out
}

/// Read `plan_param.spbin` bytes.
pub fn parse_plan_param(bytes: &[u8]) -> Result<PlanParam, String> {
    if bytes.len() < HEADER_LEN {
        return Err(format!(
            "plan_param is {} bytes, header needs {HEADER_LEN}",
            bytes.len()
        ));
    }
    if bytes[..4] != PLAN_PARAM_MAGIC {
        return Err(format!(
            "plan_param magic {:02X?}, expected {:02X?}",
            &bytes[..4],
            PLAN_PARAM_MAGIC
        ));
    }
    let pair_count = read_u32(bytes, 4)? as usize;
    let marker_count = read_u32(bytes, 8)? as usize;
    let respawn_count = read_u32(bytes, 12)? as usize;
    let limit_at = read_u64(bytes, 16)?;
    let pairs_at = read_u64(bytes, 24)?;
    let markers_at = read_u64(bytes, 32)?;
    let respawn_at = read_u64(bytes, 40)?;

    if limit_at != HEADER_LEN as u64 {
        return Err(format!(
            "plan_param limit section at {limit_at:#X}, expected {HEADER_LEN:#X}"
        ));
    }
    let pairs_at = expect_offset("spawn pairs", pairs_at, HEADER_LEN + LIMIT_STRIDE)?;
    let markers_at = expect_offset(
        "markers",
        markers_at,
        pairs_at + checked_span(pair_count, PAIR_STRIDE, "spawn pairs")?,
    )?;
    let respawn_at = expect_offset(
        "respawn points",
        respawn_at,
        markers_at + checked_span(marker_count, MARKER_STRIDE, "markers")?,
    )?;
    let file_end = respawn_at + checked_span(respawn_count, RESPAWN_STRIDE, "respawn points")?;
    if file_end != bytes.len() {
        return Err(format!(
            "plan_param sections end at {file_end:#X}, file is {:#X} bytes",
            bytes.len()
        ));
    }

    let limit = read_f32(bytes, HEADER_LEN)?;
    let limit_padding = read_f32(bytes, HEADER_LEN + 4)?;
    let mut spawn_pairs = Vec::with_capacity(pair_count);
    for index in 0..pair_count {
        let at = pairs_at + index * PAIR_STRIDE;
        spawn_pairs.push(SpawnPair {
            first: read_f32x4(bytes, at)?,
            second: read_f32x4(bytes, at + 16)?,
        });
    }
    let mut markers = Vec::with_capacity(marker_count);
    for index in 0..marker_count {
        let at = markers_at + index * MARKER_STRIDE;
        markers.push(SpawnMarker {
            position: read_f32x3(bytes, at)?,
            parameter: read_f32(bytes, at + 12)?,
        });
    }
    let mut respawn_points = Vec::with_capacity(respawn_count);
    for index in 0..respawn_count {
        let at = respawn_at + index * RESPAWN_STRIDE;
        respawn_points.push(RespawnPoint {
            position: read_f32x3(bytes, at)?,
            padding: read_f32(bytes, at + 12)?,
        });
    }
    Ok(PlanParam {
        limit,
        limit_padding,
        spawn_pairs,
        markers,
        respawn_points,
    })
}

fn expect_offset(name: &str, actual: u64, expected: usize) -> Result<usize, String> {
    if actual != expected as u64 {
        return Err(format!(
            "plan_param {name} section at {actual:#X}, expected {expected:#X}"
        ));
    }
    Ok(expected)
}

fn checked_span(count: usize, stride: usize, name: &str) -> Result<usize, String> {
    count
        .checked_mul(stride)
        .ok_or_else(|| format!("plan_param {name} count {count} overflows"))
}

fn push_u32(out: &mut Vec<u8>, value: u32) {
    out.extend_from_slice(&value.to_le_bytes());
}

fn push_u64(out: &mut Vec<u8>, value: u64) {
    out.extend_from_slice(&value.to_le_bytes());
}

fn push_f32(out: &mut Vec<u8>, value: f32) {
    out.extend_from_slice(&value.to_le_bytes());
}

fn read_u32(bytes: &[u8], at: usize) -> Result<u32, String> {
    let raw = bytes
        .get(at..at + 4)
        .ok_or_else(|| format!("plan_param truncated at {at:#X}"))?;
    Ok(u32::from_le_bytes(raw.try_into().expect("4 bytes")))
}

fn read_u64(bytes: &[u8], at: usize) -> Result<u64, String> {
    let raw = bytes
        .get(at..at + 8)
        .ok_or_else(|| format!("plan_param truncated at {at:#X}"))?;
    Ok(u64::from_le_bytes(raw.try_into().expect("8 bytes")))
}

fn read_f32(bytes: &[u8], at: usize) -> Result<f32, String> {
    let raw = bytes
        .get(at..at + 4)
        .ok_or_else(|| format!("plan_param truncated at {at:#X}"))?;
    let value = f32::from_le_bytes(raw.try_into().expect("4 bytes"));
    if !value.is_finite() {
        return Err(format!("plan_param non-finite float at {at:#X}"));
    }
    Ok(value)
}

fn read_f32x3(bytes: &[u8], at: usize) -> Result<[f32; 3], String> {
    Ok([
        read_f32(bytes, at)?,
        read_f32(bytes, at + 4)?,
        read_f32(bytes, at + 8)?,
    ])
}

fn read_f32x4(bytes: &[u8], at: usize) -> Result<[f32; 4], String> {
    Ok([
        read_f32(bytes, at)?,
        read_f32(bytes, at + 4)?,
        read_f32(bytes, at + 8)?,
        read_f32(bytes, at + 12)?,
    ])
}
