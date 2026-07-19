//! Rust bindings for the `window.oblivious` DOM API.
//!
//! DOM objects stay on the JS side in a Map keyed by integer handle.
//! WASM stores handles as JsValue(f64). This avoids Firefox externref
//! table issues where DOM object types get lost.

use wasm_bindgen::prelude::*;

#[wasm_bindgen(inline_js = "
let _lastErr = '';
let _oc = null;
export function oc_last_err() { return _lastErr; }
export function oc_set(r) { _oc = r; }
export function oc_drop(i) {}
export function oc_clone(i) { return _oc.h_clone(i); }
export function oc_create_int(n) { return _oc.h_createInt(n); }
export function oc_add_int(a, b) { return _oc.h_addInt(a, b); }
export function oc_sub_int(a, b) { return _oc.h_subInt(a, b); }
export function oc_eq_int(a, b) { return _oc.h_eqInt(a, b); }
export function oc_gt_int(a, b) { return _oc.h_gtInt(a, b); }
export function oc_lt_int(a, b) { return _oc.h_ltArray(a, b); }
export function oc_create_string(s) { const e = new TextEncoder(); const b = e.encode(s); const d = new Uint8Array(1 + b.length * 2); d[0] = 1; for (let i = 0; i < b.length; i++) { d[1 + i*2] = b[i] & 0xff; d[2 + i*2] = (b[i] >> 8) & 0xff; } return _oc.h_createByteArrayFrom(d); }
export function oc_create_ba(data) { return _oc.h_createByteArrayFrom(data); }
export function oc_eq_array(a, b) { return _oc.h_eqArray(a, b); }
export function oc_lt_array(a, b) { return _oc.h_ltArray(a, b); }
export function oc_concat(a, b) { return _oc.h_concatArrays(a, b); }
export function oc_slice(s, a, b) { return _oc.h_sliceArray(s, a, b); }
export function oc_pack(ids) { return _oc.h_pack(new Uint32Array(ids)); }
export function oc_and(a, b) { return _oc.h_andBool(a, b); }
export function oc_or(a, b) { return _oc.h_orBool(a, b); }
export function oc_not(a) { return _oc.h_notBool(a); }
export function oc_cmov(c, t, f) { return _oc.h_cmovArray(c, t, f); }
export function oc_cmov_bool(c, t, f) { return _oc.h_cmovBool(c, t, f); }
export function oc_b64(i) { return _oc.h_toBase64(i); }
export function oc_enc(buf) { return _oc.h_fromEncrypted(buf); }
export function oc_enc_safe(buf) { try { return _oc.h_fromEncrypted(buf); } catch(e) { _lastErr = 'fromEncrypted: ' + (e.message||e); throw e; } }
export function oc_unwrap(i) { return _oc.h_exportByteArray(i); }
export function oc_wrap(o) { if (typeof o === 'number') return o; try { return _oc.h_importByteArray(o); } catch(e1) { try { return _oc.h_importBool(o); } catch(e2) { return _oc.h_importObliv8(o); } } }
export function oc_debug_str(i) { return _oc.h_toBase64(i); }
export function oc_ba_length(i) { return _oc.h_baLength(i); }
export function oc_bitonic_sort(ids, keySize) { _oc.h_bitonicSort(new Uint32Array(ids), keySize); }
export function oc_from_byte(v) { return _oc.h_fromByte(v); }
export function oc_eq_byte(a, b) { return _oc.h_eqByte(a, b); }
export function oc_bitonic_sort_safe(ids, keySize) { _oc.h_bitonicSort(new Uint32Array(ids), keySize); }
export function oc_gc(keepArray, watermark) { _oc.h_freeAboveWatermark(new Uint32Array(keepArray), watermark); }
export function oc_handle_count() { return _oc.h_handleCount(); }
export function oc_watermark() { return _oc.h_watermark(); }
")]
extern "C" {
    fn oc_set(r: &JsValue);
    fn oc_drop(i: JsValue);
    fn oc_clone(i: JsValue) -> JsValue;
    fn oc_create_int(n: JsValue) -> JsValue;
    fn oc_add_int(a: JsValue, b: JsValue) -> JsValue;
    fn oc_sub_int(a: JsValue, b: JsValue) -> JsValue;
    fn oc_eq_int(a: JsValue, b: JsValue) -> JsValue;
    fn oc_gt_int(a: JsValue, b: JsValue) -> JsValue;
    fn oc_lt_int(a: JsValue, b: JsValue) -> JsValue;
    fn oc_create_string(s: &str) -> JsValue;
    fn oc_create_ba(data: &JsValue) -> JsValue;
    fn oc_eq_array(a: JsValue, b: JsValue) -> JsValue;
    fn oc_lt_array(a: JsValue, b: JsValue) -> JsValue;
    fn oc_concat(a: JsValue, b: JsValue) -> JsValue;
    fn oc_slice(s: JsValue, a: JsValue, b: JsValue) -> JsValue;
    fn oc_pack(ids: &JsValue) -> JsValue;
    fn oc_and(a: JsValue, b: JsValue) -> JsValue;
    fn oc_or(a: JsValue, b: JsValue) -> JsValue;
    fn oc_not(a: JsValue) -> JsValue;
    fn oc_cmov(c: JsValue, t: JsValue, f: JsValue) -> JsValue;
    fn oc_cmov_bool(c: JsValue, t: JsValue, f: JsValue) -> JsValue;
    fn oc_b64(i: JsValue) -> JsValue;
    fn oc_enc(buf: &JsValue) -> JsValue;
    #[wasm_bindgen(catch)]
    fn oc_enc_safe(buf: &JsValue) -> Result<JsValue, JsValue>;
    fn oc_unwrap(i: JsValue) -> JsValue;
    fn oc_wrap(o: &JsValue) -> JsValue;
    fn oc_debug_str(i: JsValue) -> JsValue;
    fn oc_ba_length(i: JsValue) -> JsValue;
    fn oc_bitonic_sort(ids: &JsValue, key_size: u32);
    #[wasm_bindgen(catch)]
    fn oc_bitonic_sort_safe(ids: &JsValue, key_size: u32) -> Result<(), JsValue>;
    fn oc_from_byte(v: JsValue) -> JsValue;
    fn oc_eq_byte(a: JsValue, b: JsValue) -> JsValue;
    fn oc_gc(keep: &JsValue, watermark: u32);
    fn oc_handle_count() -> JsValue;
    fn oc_watermark() -> JsValue;
    fn oc_last_err() -> JsValue;
}

pub fn last_error() -> String {
    oc_last_err().as_string().unwrap_or_default()
}

fn hv(v: &JsValue) -> JsValue { v.clone() }

pub fn set_oblivious_ref(oc: JsValue) {
    oc_set(&oc);
}

/// Unwrap a handle to a raw JS DOM object (for returning to JS callers).
pub fn unwrap_handle(v: &JsValue) -> JsValue { oc_unwrap(hv(v)) }

/// Wrap a raw JS DOM object into a handle (for values received from JS).
pub fn wrap_handle(v: &JsValue) -> JsValue { oc_wrap(v) }

/// Clone a handle (creates a new handle pointing to the same JS object).
pub fn clone_handle(v: &JsValue) -> JsValue { oc_clone(hv(v)) }

// ── Obliv8 ─────────────────────────────────────────────────────────

pub fn from_byte(v: u8) -> Result<JsValue, JsValue> { Ok(oc_from_byte(JsValue::from(v))) }
pub fn eq_byte(a: &JsValue, b: &JsValue) -> Result<JsValue, JsValue> { Ok(oc_eq_byte(hv(a), hv(b))) }

// ── ObliviousInt ────────────────────────────────────────────────────

pub fn create_int(n: i32) -> Result<JsValue, JsValue> { Ok(oc_create_int(JsValue::from(n))) }
pub fn add_int(a: &JsValue, b: &JsValue) -> Result<JsValue, JsValue> { Ok(oc_add_int(hv(a), hv(b))) }
pub fn sub_int(a: &JsValue, b: &JsValue) -> Result<JsValue, JsValue> { Ok(oc_sub_int(hv(a), hv(b))) }
pub fn eq_int(a: &JsValue, b: &JsValue) -> Result<JsValue, JsValue> { Ok(oc_eq_int(hv(a), hv(b))) }
pub fn gt_int(a: &JsValue, b: &JsValue) -> Result<JsValue, JsValue> { Ok(oc_gt_int(hv(a), hv(b))) }
pub fn lt_int(a: &JsValue, b: &JsValue) -> Result<JsValue, JsValue> { Ok(oc_lt_int(hv(a), hv(b))) }

// ── ObliviousByteArray ──────────────────────────────────────────────

pub fn create_string(s: &str) -> Result<JsValue, JsValue> { Ok(oc_create_string(s)) }

pub fn create_byte_array(bytes: &[u8]) -> Result<JsValue, JsValue> {
    let arr = js_sys::Uint8Array::from(bytes);
    Ok(oc_create_ba(&arr.into()))
}

pub fn eq_array(a: &JsValue, b: &JsValue) -> Result<JsValue, JsValue> { Ok(oc_eq_array(hv(a), hv(b))) }
pub fn lt_array(a: &JsValue, b: &JsValue) -> Result<JsValue, JsValue> { Ok(oc_lt_array(hv(a), hv(b))) }
pub fn concat_arrays(a: &JsValue, b: &JsValue) -> Result<JsValue, JsValue> { Ok(oc_concat(hv(a), hv(b))) }

pub fn slice_array(src: &JsValue, start: u32, end: u32) -> Result<JsValue, JsValue> {
    Ok(oc_slice(hv(src), JsValue::from(start), JsValue::from(end)))
}

pub fn pack(values: &[&JsValue]) -> Result<JsValue, JsValue> {
    if values.is_empty() {
        return create_byte_array(&[]);
    }
    if values.len() == 1 {
        return Ok(oc_clone(hv(values[0])));
    }
    let arr = js_sys::Array::new_with_length(values.len() as u32);
    for (i, v) in values.iter().enumerate() {
        arr.set(i as u32, hv(v));
    }
    Ok(oc_pack(&arr.into()))
}

// ── ObliviousBool ───────────────────────────────────────────────────

pub fn and_bool(a: &JsValue, b: &JsValue) -> Result<JsValue, JsValue> { Ok(oc_and(hv(a), hv(b))) }
pub fn or_bool(a: &JsValue, b: &JsValue) -> Result<JsValue, JsValue> { Ok(oc_or(hv(a), hv(b))) }
pub fn not_bool(a: &JsValue) -> Result<JsValue, JsValue> { Ok(oc_not(hv(a))) }

pub fn int_to_bool(val: &JsValue) -> Result<JsValue, JsValue> {
    let one = create_int(1)?;
    eq_int(val, &one)
}

pub fn create_false() -> Result<JsValue, JsValue> {
    let zero = create_int(0)?;
    let one = create_int(1)?;
    eq_int(&zero, &one)
}

pub fn create_true() -> Result<JsValue, JsValue> {
    let one_a = create_int(1)?;
    let one_b = create_int(1)?;
    eq_int(&one_a, &one_b)
}

// ── Conditional move ────────────────────────────────────────────────

pub fn cmov_array(cond: &JsValue, if_true: &JsValue, if_false: &JsValue) -> Result<JsValue, JsValue> {
    Ok(oc_cmov(hv(cond), hv(if_true), hv(if_false)))
}

pub fn cmov_bool(cond: &JsValue, if_true: &JsValue, if_false: &JsValue) -> Result<JsValue, JsValue> {
    Ok(oc_cmov_bool(hv(cond), hv(if_true), hv(if_false)))
}

// ── Serialization ───────────────────────────────────────────────────

pub fn to_base64(val: &JsValue) -> Result<String, JsValue> {
    let result = oc_b64(hv(val));
    result
        .as_string()
        .ok_or_else(|| "toBase64 did not return a string".into())
}

pub fn from_encrypted(buffer: &JsValue) -> Result<JsValue, JsValue> {
    oc_enc_safe(buffer).map_err(|e| {
        let err_str = last_error();
        JsValue::from_str(&format!("from_encrypted failed: {}", err_str))
    })
}

// ── Debug (temporary) ──────────────────────────────────────────────

pub fn ba_length(val: &JsValue) -> u32 {
    oc_ba_length(hv(val)).as_f64().unwrap_or(0.0) as u32
}

pub fn bitonic_sort_native(entries: &JsValue, key_size: u32) -> Result<(), JsValue> {
    oc_bitonic_sort_safe(entries, key_size)
}

pub fn gc(live_handles: &[&JsValue], watermark: u32) {
    let arr = js_sys::Array::new_with_length(live_handles.len() as u32);
    for (i, v) in live_handles.iter().enumerate() {
        arr.set(i as u32, hv(v));
    }
    oc_gc(&arr.into(), watermark);
}

pub fn watermark() -> u32 {
    oc_watermark().as_f64().unwrap_or(0.0) as u32
}

pub fn handle_count() -> u32 {
    oc_handle_count().as_f64().unwrap_or(0.0) as u32
}

pub fn debug_string(val: &JsValue) -> Result<String, JsValue> {
    let result = oc_debug_str(hv(val));
    result.as_string().ok_or_else(|| "debug_string failed".into())
}

