/**
 * obliv_browser — Drop-in replacement for obliv-core that delegates to
 * the browser's window.oblivious C++ constant-time primitives.
 *
 * Type mappings:
 *   ObliviousInt    → ObliviousByteArray (4 bytes, big-endian)
 *   ObliviousString → ObliviousByteArray (UTF-16 encoded, 2 bytes per char)
 *   ObliviousBool   → browser ObliviousBool DOM object
 *   Obliv8          → browser Obliv8 DOM object
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

// The window.oblivious namespace — typed just enough for our usage.
interface ObliviousAPI {
  readonly TRUE: any;   // ObliviousBool
  readonly FALSE: any;  // ObliviousBool
  fromByte(value: number): any;
  eq(a: any, b: any): any;
  lt(a: any, b: any): any;
  ge(a: any, b: any): any;
  andBool(a: any, b: any): any;
  orBool(a: any, b: any): any;
  notBool(a: any): any;
  cmov(cond: any, if1: any, if0: any): any;
  cmovBool(cond: any, if1: any, if0: any): any;
  add(a: any, b: any): any;
  sub(a: any, b: any): any;
  createByteArray(length: number): any;
  fromEncrypted(encrypted: ArrayBuffer): any;
  eqArray(a: any, b: any): any;
  ltArray(a: any, b: any): any;
  cmovArray(cond: any, if1: any, if0: any): any;
  concatArrays(a: any, b: any): any;
  sliceArray(src: any, start: number, end: number): any;
  createMap(): any;
  createArray(): any;
}

let oc: ObliviousAPI;

export function initBrowserBackend(obliviousNamespace: ObliviousAPI): void {
  oc = obliviousNamespace;
  TRUE8 = oc.TRUE;
  FALSE8 = oc.FALSE;
}

function getOc(): ObliviousAPI {
  if (!oc) {
    throw new Error(
      "obliv_browser: call initBrowserBackend(window.oblivious) first",
    );
  }
  return oc;
}

// ── Types ──────────────────────────────────────────────────────────────────

// In browser mode, all oblivious types are opaque DOM objects.
// We re-export type aliases for API compatibility with obliv-core.
export type Obliv8 = any;
export type ObliviousBool = any;
export type ObliviousInt = any;      // ObliviousByteArray, 4 bytes BE
export type ObliviousString = any;   // ObliviousByteArray, UTF-16 encoded
export type OblivSelectable = any;

// ── Constants ──────────────────────────────────────────────────────────────

// ESM live bindings — set when initBrowserBackend() is called.
export let TRUE8: any;
export let FALSE8: any;

// ── Boolean ops (direct delegation) ────────────────────────────────────────

export function andBool(a: ObliviousBool, b: ObliviousBool): ObliviousBool {
  return getOc().andBool(a, b);
}

export function orBool(a: ObliviousBool, b: ObliviousBool): ObliviousBool {
  return getOc().orBool(a, b);
}

export function notBool(a: ObliviousBool): ObliviousBool {
  return getOc().notBool(a);
}

// ── Byte-level ops ─────────────────────────────────────────────────────────

export function eq(a: Obliv8, b: Obliv8): ObliviousBool {
  return getOc().eq(a, b);
}

export function gt(a: Obliv8, b: Obliv8): ObliviousBool {
  // gt(a, b) = lt(b, a)
  return getOc().lt(b, a);
}

// ── Constructors ───────────────────────────────────────────────────────────

export function createObliviousBool(v: boolean): ObliviousBool {
  return v ? getOc().TRUE : getOc().FALSE;
}

/**
 * Create an ObliviousInt from a plain number.
 * Layout: [validity(1), b3, b2, b1, b0] — 5 bytes, big-endian value.
 * Validity byte 1 = valid, 0 = invalid (e.g. deleted or missing).
 */
export function createObliviousInt(n: number | bigint): ObliviousInt {
  const api = getOc();
  const v = typeof n === "bigint" ? Number(n) : n;
  const arr = api.createByteArray(5);
  arr.write(0, api.fromByte(1), api.TRUE);  // validity = 1
  arr.write(1, api.fromByte((v >>> 24) & 0xff), api.TRUE);
  arr.write(2, api.fromByte((v >>> 16) & 0xff), api.TRUE);
  arr.write(3, api.fromByte((v >>> 8) & 0xff), api.TRUE);
  arr.write(4, api.fromByte(v & 0xff), api.TRUE);
  return makeSelectable(arr);
}

/**
 * Create an ObliviousString from a plain JS string.
 * Layout: [validity(1), UTF-16 chars...] — (1 + length*2) bytes.
 * Validity byte 1 = valid, 0 = invalid (e.g. deleted or missing).
 */
export function createObliviousString(s: string): ObliviousString {
  const api = getOc();
  const arr = api.createByteArray(1 + s.length * 2);
  arr.write(0, api.fromByte(1), api.TRUE);  // validity = 1
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    arr.write(1 + i * 2, api.fromByte(code & 0xff), api.TRUE);
    arr.write(1 + i * 2 + 1, api.fromByte((code >> 8) & 0xff), api.TRUE);
  }
  return makeSelectable(arr);
}

/**
 * Check if an oblivious value (ObliviousInt or ObliviousString) is valid.
 * Returns ObliviousBool — the check itself is constant-time.
 */
export function isValid(value: ObliviousInt | ObliviousString): ObliviousBool {
  const api = getOc();
  const validityByte = value.read(0);
  return api.eq(validityByte, api.fromByte(1));
}

// ── Integer comparison ─────────────────────────────────────────────────────

/**
 * Oblivious integer equality — compares all 5 bytes including validity.
 * valid(0) ≠ invalid(0) because validity byte differs, which is correct.
 */
export function eqInt(a: ObliviousInt, b: ObliviousInt): ObliviousBool {
  return getOc().eqArray(a, b);
}

/**
 * Oblivious integer greater-than — compares all 5 bytes including validity.
 * Validity byte (1 > 0) means valid values always beat invalid ones,
 * which is correct for Lamport clock resolution.
 */
export function gtInt(a: ObliviousInt, b: ObliviousInt): ObliviousBool {
  return getOc().ltArray(b, a);
}

// ── String comparison ──────────────────────────────────────────────────────

/**
 * Oblivious string equality — compares value bytes only (skips validity).
 */
export function eqString(a: ObliviousString, b: ObliviousString): ObliviousBool {
  const api = getOc();
  const aVal = api.sliceArray(a, 1, a.length);
  const bVal = api.sliceArray(b, 1, b.length);
  return api.eqArray(aVal, bVal);
}

/**
 * Oblivious string greater-than (lexicographic) — compares value bytes only.
 */
export function gtString(a: ObliviousString, b: ObliviousString): ObliviousBool {
  const api = getOc();
  const aVal = api.sliceArray(a, 1, a.length);
  const bVal = api.sliceArray(b, 1, b.length);
  return api.ltArray(bVal, aVal);
}

// ── Conditional move (polymorphic) ─────────────────────────────────────────

/**
 * Polymorphic cmov: works on ObliviousInt, ObliviousString (both are
 * ObliviousByteArray), or Obliv8.
 */
export function cmov<T>(cond: Obliv8, ifTrue: T, ifFalse: T): T {
  const api = getOc();
  // If the values have a .length property, they're ObliviousByteArrays
  if (
    ifTrue !== null &&
    typeof ifTrue === "object" &&
    "length" in (ifTrue as any)
  ) {
    return makeSelectable(api.cmovArray(cond, ifTrue, ifFalse)) as T;
  }
  // Otherwise assume Obliv8
  return api.cmov(cond, ifTrue, ifFalse) as T;
}

// ── OblivSelectable interface support ──────────────────────────────────────

/**
 * Attach oblivSelect method to an ObliviousByteArray so it satisfies
 * the OblivSelectable duck-typing check in proxies.ts.
 */
export function makeSelectable(arr: any): any {
  if (arr && typeof arr === "object" && !arr.oblivSelect) {
    arr.oblivSelect = function (cond: Obliv8, other: any): any {
      return getOc().cmovArray(cond, this, other);
    };
  }
  return arr;
}

