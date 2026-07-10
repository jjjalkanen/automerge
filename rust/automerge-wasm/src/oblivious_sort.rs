//! Bitonic sorting network for oblivious values.
//!
//! All comparisons and swaps use the `window.oblivious` DOM API —
//! no data-dependent control flow on encrypted values.
//!
//! Each sort entry has a single packed composite key (ObliviousByteArray)
//! and a single packed composite data (ObliviousByteArray). Both are
//! opaque same-size blobs across all entries in a sort.

use wasm_bindgen::prelude::*;

use crate::oblivious_dom::{
    and_bool, cmov_array, lt_array, not_bool, or_bool,
};

/// An entry in the oblivious sort. Both key and data are single packed
/// ObliviousByteArray composites of uniform size across all entries.
#[derive(Clone, Debug)]
pub struct SortEntry {
    /// Packed composite sort key (ObliviousByteArray).
    pub key: JsValue,
    /// Packed composite satellite data (ObliviousByteArray).
    pub data: JsValue,
}

impl SortEntry {
    pub fn new(key: JsValue, data: JsValue) -> Self {
        Self { key, data }
    }
}

/// Oblivious compare-and-swap: conditionally swap entries[i] and entries[j].
/// `dir` is an ObliviousBool — true for ascending, false for descending.
fn oblivious_cas(
    entries: &mut [SortEntry],
    i: usize,
    j: usize,
    dir: &JsValue,
) -> Result<(), JsValue> {
    let less = lt_array(&entries[i].key, &entries[j].key)?;
    // swap if dir XOR less: ascending wants i<j, descending wants i>j
    let not_less = not_bool(&less)?;
    let not_dir = not_bool(dir)?;
    let should_swap = or_bool(&and_bool(dir, &not_less)?, &and_bool(&not_dir, &less)?)?;

    let new_i_key = cmov_array(&should_swap, &entries[j].key, &entries[i].key)?;
    let new_j_key = cmov_array(&should_swap, &entries[i].key, &entries[j].key)?;
    let new_i_data = cmov_array(&should_swap, &entries[j].data, &entries[i].data)?;
    let new_j_data = cmov_array(&should_swap, &entries[i].data, &entries[j].data)?;

    entries[i].key = new_i_key;
    entries[i].data = new_i_data;
    entries[j].key = new_j_key;
    entries[j].data = new_j_data;

    Ok(())
}

/// In-place oblivious bitonic sort.
///
/// `entries` must be padded to a power of 2. Padding entries should have
/// keys set to a value that sorts after all real entries (e.g., 0xFF bytes)
/// and data set to a value of the same size as real entries' data.
pub fn bitonic_sort(entries: &mut [SortEntry]) -> Result<(), JsValue> {
    let n = entries.len();
    if n == 0 {
        return Ok(());
    }
    assert!(n.is_power_of_two(), "bitonic sort requires power-of-2 length");

    let true_val = crate::oblivious_dom::create_true()?;
    let false_val = crate::oblivious_dom::create_false()?;

    let mut k = 2;
    while k <= n {
        let mut j = k >> 1;
        while j > 0 {
            for i in 0..n {
                let partner = i ^ j;
                if i < partner {
                    let dir = if (i & k) == 0 { &true_val } else { &false_val };
                    oblivious_cas(entries, i, partner, dir)?;
                }
            }
            j >>= 1;
        }
        k <<= 1;
    }

    Ok(())
}

/// Pad a vector of SortEntry to the next power of 2.
/// `fill_key` and `fill_data` must be ObliviousByteArrays of the same
/// sizes as real entries' key and data respectively.
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
