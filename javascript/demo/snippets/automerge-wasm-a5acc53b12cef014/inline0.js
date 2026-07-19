
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
