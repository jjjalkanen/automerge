//! Rust bindings for the `window.oblivious` DOM API.
//!
//! DOM objects stay on the JS side in a Map keyed by integer handle.
//! WASM stores handles as JsValue(f64). This avoids Firefox externref
//! table issues where DOM object types get lost.

use wasm_bindgen::prelude::*;

#[wasm_bindgen(inline_js = "
const _m = new Map();
let _n = 1;
function S(o) { const i = _n++; _m.set(i, o); return i; }
let _lastErr = '';
function C(name, args) { for (let k = 0; k < args.length; k++) { if (typeof args[k] !== 'number') { _lastErr = name + ' arg' + k + ' is ' + typeof args[k] + ' (' + (args[k] && args[k].constructor && args[k].constructor.name) + ')'; throw new Error(_lastErr); } } }
function G(i) { const o = _m.get(i); if (o === undefined) { _lastErr = 'G(' + typeof i + ') mapSize=' + _m.size + ' stack=' + new Error().stack; throw new Error('handle not found'); } return o; }
export function oc_last_err() { return _lastErr; }
function D(i) { _m.delete(i); }
let _oc = null;

export function oc_set(r) { _oc = r; }
export function oc_drop(i) { C('drop',[i]); D(i); }
export function oc_clone(i) { C('clone',[i]); return S(G(i)); }
export function oc_create_int(n) { return S(_oc.createInt(n)); }
export function oc_add_int(a, b) { C('add_int',[a,b]); return S(_oc.addInt(G(a), G(b))); }
export function oc_sub_int(a, b) { C('sub_int',[a,b]); return S(_oc.subInt(G(a), G(b))); }
export function oc_eq_int(a, b) { C('eq_int',[a,b]); return S(_oc.eqInt(G(a), G(b))); }
export function oc_gt_int(a, b) { C('gt_int',[a,b]); return S(_oc.gtInt(G(a), G(b))); }
export function oc_lt_int(a, b) { C('lt_int',[a,b]); return S(_oc.ltInt(G(a), G(b))); }
export function oc_create_string(s) { return S(_oc.createString(s)); }
export function oc_create_ba(data) { return S(_oc.createByteArrayFrom(data)); }
export function oc_eq_array(a, b) { C('eq_array',[a,b]); return S(_oc.eqArray(G(a), G(b))); }
export function oc_lt_array(a, b) { C('lt_array',[a,b]); return S(_oc.ltArray(G(a), G(b))); }
export function oc_concat(a, b) { C('concat',[a,b]); return S(_oc.concatArrays(G(a), G(b))); }
export function oc_slice(s, a, b) { C('slice',[s]); return S(_oc.sliceArray(G(s), a, b)); }
export function oc_pack(ids) { ids.forEach((v,k) => { if (typeof v !== 'number') { _lastErr = 'pack arg[' + k + '] is ' + typeof v; throw new Error(_lastErr); } }); return S(_oc.pack(ids.map(i => G(i)))); }
export function oc_and(a, b) { C('and',[a,b]); return S(_oc.andBool(G(a), G(b))); }
export function oc_or(a, b) { C('or',[a,b]); return S(_oc.orBool(G(a), G(b))); }
export function oc_not(a) { C('not',[a]); return S(_oc.notBool(G(a))); }
export function oc_cmov(c, t, f) { C('cmov',[c,t,f]); return S(_oc.cmovArray(G(c), G(t), G(f))); }
export function oc_cmov_bool(c, t, f) { C('cmov_bool',[c,t,f]); return S(_oc.cmovBool(G(c), G(t), G(f))); }
export function oc_b64(i) { C('b64',[i]); return G(i).toBase64(); }
export function oc_enc(buf) { return S(_oc.fromEncrypted(buf)); }
export function oc_unwrap(i) { C('unwrap',[i]); return G(i); }
export function oc_wrap(o) { return S(o); }
export function oc_debug_str(i) { C('debug_str',[i]); return G(i).toBase64(); }
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
    fn oc_unwrap(i: JsValue) -> JsValue;
    fn oc_wrap(o: &JsValue) -> JsValue;
    fn oc_debug_str(i: JsValue) -> JsValue;
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
    Ok(oc_enc(buffer))
}

// ── Debug (temporary) ──────────────────────────────────────────────

pub fn debug_string(val: &JsValue) -> Result<String, JsValue> {
    let result = oc_debug_str(hv(val));
    result.as_string().ok_or_else(|| "debug_string failed".into())
}

