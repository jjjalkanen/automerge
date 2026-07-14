//! Bitonic sorting network and oblivious join for oblivious values.
//!
//! Delegates to the native `window.oblivious.bitonicSort()` C++ implementation
//! which operates directly on plaintext bytes — no per-CAS DOM calls.

use wasm_bindgen::prelude::*;

use crate::oblivious_dom;
use crate::oblivious_dom::{
    ba_length, bitonic_sort_native, concat_arrays, slice_array,
};

const INT_SIZE: u32 = 5;

fn make_fill(size: usize) -> Result<JsValue, JsValue> {
    oblivious_dom::create_byte_array(&vec![0xffu8; size])
}

#[derive(Clone, Debug)]
pub struct SortEntry {
    pub key: JsValue,
    pub data: JsValue,
}

impl SortEntry {
    pub fn new(key: JsValue, data: JsValue) -> Self {
        Self { key, data }
    }
}

/// In-place oblivious bitonic sort via native C++ implementation.
///
/// `key_size` is the byte length of the key prefix used for comparison.
/// `entries` must be padded to a power of 2.
pub fn bitonic_sort(entries: &mut [SortEntry], key_size: u32) -> Result<(), JsValue> {
    let n = entries.len();
    if n <= 1 {
        return Ok(());
    }
    assert!(n.is_power_of_two(), "bitonic sort requires power-of-2 length");

    let mut combined: Vec<JsValue> = Vec::with_capacity(n);
    for entry in entries.iter() {
        combined.push(concat_arrays(&entry.key, &entry.data)?);
    }

    let arr = js_sys::Array::new_with_length(n as u32);
    for (i, h) in combined.iter().enumerate() {
        arr.set(i as u32, h.clone());
    }

    bitonic_sort_native(&arr.into(), key_size);

    let total_size = ba_length(&combined[0]);
    for (i, entry) in entries.iter_mut().enumerate() {
        entry.key = slice_array(&combined[i], 0, key_size)?;
        entry.data = slice_array(&combined[i], key_size, total_size)?;
    }

    Ok(())
}

/// Pad a vector of SortEntry to the next power of 2.
pub fn pad_to_power_of_2(
    entries: &mut Vec<SortEntry>,
    fill_key: &JsValue,
    fill_data: &JsValue,
) {
    let n = entries.len();
    if n == 0 {
        return;
    }
    let target = n.next_power_of_two();
    while entries.len() < target {
        entries.push(SortEntry {
            key: fill_key.clone(),
            data: fill_data.clone(),
        });
    }
}

/// Oblivious join: route payloads from data records to query records by join key.
///
/// Sorts all records by (join_key, type), scans with a running register that
/// accumulates from data records (type=0) and is copied to query records (type=1),
/// then sorts back to restore original ordering.
///
/// Returns one payload per query, in the same order as `query_keys`.
pub fn oblivious_join(
    data: &[(JsValue, JsValue)],
    query_keys: &[JsValue],
    key_size: u32,
    zero: &JsValue,
    one: &JsValue,
) -> Result<Vec<JsValue>, JsValue> {
    let n_data = data.len();
    let n_queries = query_keys.len();

    if n_data == 0 || n_queries == 0 {
        return Ok(Vec::new());
    }

    let payload_size = ba_length(&data[0].1);
    let full_key_size = key_size + INT_SIZE;
    let record_data_size = (payload_size + 2 * INT_SIZE) as usize;
    let fill_key = make_fill(full_key_size as usize)?;
    let fill_data = make_fill(record_data_size)?;
    let placeholder = make_fill(payload_size as usize)?;

    let mut records: Vec<SortEntry> = Vec::with_capacity(n_data + n_queries);

    for (i, (join_key, payload)) in data.iter().enumerate() {
        let key = oblivious_dom::pack(&[join_key, zero])?;
        let orig_idx = oblivious_dom::create_int(i as i32)?;
        let d = oblivious_dom::pack(&[payload, &orig_idx, zero])?;
        records.push(SortEntry::new(key, d));
    }

    for (i, join_key) in query_keys.iter().enumerate() {
        let key = oblivious_dom::pack(&[join_key, one])?;
        let orig_idx = oblivious_dom::create_int(i as i32)?;
        let d = oblivious_dom::pack(&[&placeholder, &orig_idx, one])?;
        records.push(SortEntry::new(key, d));
    }

    pad_to_power_of_2(&mut records, &fill_key, &fill_data);
    bitonic_sort(&mut records, full_key_size)?;

    let mut running = placeholder.clone();
    for i in 0..records.len() {
        let d = &records[i].data;
        let val = slice_array(d, 0, payload_size)?;
        let type_flag = slice_array(d, payload_size + INT_SIZE, payload_size + 2 * INT_SIZE)?;

        let is_data_rec = oblivious_dom::eq_int(&type_flag, zero)?;
        let is_query_rec = oblivious_dom::eq_int(&type_flag, one)?;

        running = oblivious_dom::cmov_array(&is_data_rec, &val, &running)?;
        let new_val = oblivious_dom::cmov_array(&is_query_rec, &running, &val)?;

        let orig_idx = slice_array(d, payload_size, payload_size + INT_SIZE)?;
        records[i].data = oblivious_dom::pack(&[&new_val, &orig_idx, &type_flag])?;
    }

    let sortback_size = 2 * INT_SIZE;
    for i in 0..records.len() {
        let d = &records[i].data;
        let type_flag = slice_array(d, payload_size + INT_SIZE, payload_size + 2 * INT_SIZE)?;
        let orig_idx = slice_array(d, payload_size, payload_size + INT_SIZE)?;
        records[i].key = oblivious_dom::pack(&[&type_flag, &orig_idx])?;
    }
    bitonic_sort(&mut records, sortback_size)?;

    let mut results = Vec::with_capacity(n_queries);
    for i in 0..n_queries {
        results.push(slice_array(&records[n_data + i].data, 0, payload_size)?);
    }

    Ok(results)
}
