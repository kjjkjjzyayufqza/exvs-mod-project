use binrw::meta::{ReadEndian, WriteEndian};
use binrw::{BinRead, BinWrite};
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use std::io::Cursor;

use super::param_bin_format::{
    build_param_binary, read_param_binary, ParamBinaryFile, ParamBinaryHeader, ParamFieldSpec,
};

pub trait ParamEntryWithId:
    BinRead + BinWrite + Serialize + DeserializeOwned + ReadEndian + WriteEndian
where
    for<'a> Self: BinRead<Args<'a> = ()>,
    for<'a> Self: BinWrite<Args<'a> = ()>,
{
    fn set_row_id(&mut self, id: u32);
    fn get_row_id(&self) -> u32;
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(bound(
    serialize = "E: ParamEntryWithId + Serialize",
    deserialize = "E: ParamEntryWithId + DeserializeOwned"
))]
pub struct TypedParamBundle<E: ParamEntryWithId> {
    pub header: ParamBinaryHeader,
    pub field_specs: Vec<ParamFieldSpec>,
    pub entry_ids: Vec<u32>,
    pub entries: Vec<E>,
    pub trailing_data: Vec<u8>,
}

pub fn parse_typed_param_binary<E>(
    data: &[u8],
    expected_entry_size: u32,
    expected_spec_count: u32,
) -> Result<TypedParamBundle<E>, String>
where
    E: ParamEntryWithId,
    for<'a> E: BinRead<Args<'a> = ()>,
{
    let f = read_param_binary(data)?;
    if f.header.entry_size != expected_entry_size {
        return Err(format!(
            "entry_size mismatch: file has {}, expected {}",
            f.header.entry_size, expected_entry_size
        ));
    }
    if f.header.commands_count != expected_spec_count {
        return Err(format!(
            "field spec count mismatch: file has {}, expected {}",
            f.header.commands_count, expected_spec_count
        ));
    }
    if f.field_specs.len() != expected_spec_count as usize {
        return Err("field_specs length does not match commands_count".to_string());
    }

    let mut entries = Vec::with_capacity(f.entries_raw.len());
    for (i, raw) in f.entries_raw.iter().enumerate() {
        if raw.len() != expected_entry_size as usize {
            return Err(format!(
                "row {} size {} != expected {}",
                i,
                raw.len(),
                expected_entry_size
            ));
        }
        let mut c = Cursor::new(raw.as_slice());
        let mut e = E::read(&mut c).map_err(|e| e.to_string())?;
        e.set_row_id(f.entry_ids.get(i).copied().unwrap_or(0));
        entries.push(e);
    }

    Ok(TypedParamBundle {
        header: f.header,
        field_specs: f.field_specs,
        entry_ids: f.entry_ids,
        entries,
        trailing_data: f.trailing_data,
    })
}

pub fn build_typed_param_binary<E>(bundle: &TypedParamBundle<E>) -> Result<Vec<u8>, String>
where
    E: ParamEntryWithId,
    for<'a> E: BinWrite<Args<'a> = ()>,
{
    let es = bundle.header.entry_size as usize;
    if bundle.entry_ids.len() != bundle.entries.len() {
        return Err("entry_ids and entries length mismatch".to_string());
    }

    let mut entries_raw: Vec<Vec<u8>> = Vec::with_capacity(bundle.entries.len());
    for e in &bundle.entries {
        let mut buf = vec![0u8; es];
        {
            let mut c = Cursor::new(&mut buf[..]);
            e.write(&mut c)
                .map_err(|err| format!("binwrite entry: {}", err))?;
            if c.position() as usize > es {
                return Err("encoded entry larger than entry_size".to_string());
            }
        }
        entries_raw.push(buf);
    }

    let entry_count = bundle.entries.len() as u32;
    let spec_count = bundle.field_specs.len() as u32;
    let mut header = bundle.header.clone();
    header.entry_count = entry_count;
    header.commands_count = spec_count;

    let file = ParamBinaryFile {
        header,
        field_specs: bundle.field_specs.clone(),
        entry_ids: bundle.entries.iter().map(|e| e.get_row_id()).collect(),
        entries_raw,
        trailing_data: bundle.trailing_data.clone(),
    };

    build_param_binary(&file)
}
