
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
export function oc_enc_safe(buf) { try { return S(_oc.fromEncrypted(buf)); } catch(e) { _lastErr = 'fromEncrypted: ' + (e.message||e) + ' bufType=' + (buf && buf.constructor && buf.constructor.name) + ' bufLen=' + (buf && buf.byteLength); throw e; } }
export function oc_unwrap(i) { C('unwrap',[i]); return G(i); }
export function oc_wrap(o) { return S(o); }
export function oc_debug_str(i) { C('debug_str',[i]); return G(i).toBase64(); }
