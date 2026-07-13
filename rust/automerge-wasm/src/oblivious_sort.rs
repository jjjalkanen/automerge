//! Bitonic sorting network for oblivious values.
//!
//! Delegates to the native `window.oblivious.bitonicSort()` C++ implementation
//! which operates directly on plaintext bytes — no per-CAS DOM calls.

use wasm_bindgen::prelude::*;

use crate::oblivious_dom::{
    ba_length, bitonic_sort_native, concat_arrays, slice_array,
};

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

    // Pack key+data into single combined ObliviousByteArrays
    let mut combined: Vec<JsValue> = Vec::with_capacity(n);
    for entry in entries.iter() {
        combined.push(concat_arrays(&entry.key, &entry.data)?);
    }

    // Build JS array of handles for native sort
    let arr = js_sys::Array::new_with_length(n as u32);
    for (i, h) in combined.iter().enumerate() {
        arr.set(i as u32, h.clone());
    }

    // Native C++ bitonic sort — one DOM call, operates on plaintext bytes
    bitonic_sort_native(&arr.into(), key_size);

    // Unpack sorted combined entries back into key+data
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
