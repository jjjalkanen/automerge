/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * ObliviousHandle — pure-JS passthrough backend for Automerge.
 *
 * Stores opaque key-value pairs (both keys and values are pre-encrypted by the
 * caller). Automerge never sees plaintext — encryption/decryption is done
 * outside this module, at the sandbox boundary.
 *
 * No obliv-core imports. This is intentional: the proxy layer is a pure
 * passthrough, treating encrypted values as opaque JS objects.
 */
import { STATE, OBJECT_ID } from "./constants.js"

function randomActorId(): string {
  const bytes = new Uint8Array(16)
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes)
  } else {
    // Node.js fallback
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const nodeCrypto = require("crypto")
    const buf: Buffer = nodeCrypto.randomBytes(16)
    bytes.set(buf)
  }
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, "0"))
    .join("")
}

export class ObliviousHandle {
  /**
   * Non-undefined so that isSameDocument() in proxies.ts does not produce
   * false positives (it compares __wbg_ptr === __wbg_ptr; undefined===undefined
   * would be true for every non-doc object).
   */
  readonly __wbg_ptr = 0

  private store: Map<string, any> = new Map()
  private readonly actorId: string
  private version = 0
  private _pendingOps = 0
  private _freezeEnabled = false

  constructor(actorId: string) {
    this.actorId = actorId
  }

  // ── Core map ops ──────────────────────────────────────────────────────────

  put(_obj: string, prop: string, value: any, _datatype: string): void {
    this.store.set(prop, value)
    this._pendingOps++
  }

  getWithType(_obj: string, prop: string): [string, any] | null {
    if (!this.store.has(prop)) return null
    return ["oblivious", this.store.get(prop)]
  }

  /** Same contract as getWithType — used by list helpers in proxies.ts. */
  get(_obj: string, prop: string): [string, any] | null {
    return this.getWithType(_obj, prop)
  }

  keys(_obj: string): string[] {
    return [...this.store.keys()]
  }

  delete(_obj: string, prop: string): void {
    this.store.delete(prop)
    this._pendingOps++
  }

  // ── Materialize ───────────────────────────────────────────────────────────

  /**
   * Build a plain-object snapshot of the current store state.
   * The object carries Automerge's STATE and OBJECT_ID symbols so that the
   * rest of the Automerge machinery (change, clone, …) can inspect it.
   *
   * @param _obj   Ignored — always uses the root store.
   * @param _heads Ignored — no history tracking in the oblivious backend.
   * @param meta   The InternalState passed in by Automerge's init/change flow.
   *               Stored as-is under STATE so that _state(doc) works.
   */
  materialize(_obj: string, _heads: any, meta: any): any {
    const doc: Record<string, any> = {}
    for (const [key, value] of this.store) {
      doc[key] = value
    }
    Object.defineProperty(doc, STATE, {
      value: meta,
      enumerable: false,
      configurable: true,
      writable: true,
    })
    Object.defineProperty(doc, OBJECT_ID, {
      value: "_root",
      enumerable: false,
      configurable: true,
    })
    if (this._freezeEnabled) Object.freeze(doc)
    return doc
  }

  applyAndReturnPatches(_doc: any, meta: any): { value: any; patches: any[] } {
    return { value: this.materialize("_root", undefined, meta), patches: [] }
  }

  applyPatches(_doc: any, meta: any): any {
    return this.materialize("_root", undefined, meta)
  }

  // ── Transaction lifecycle ─────────────────────────────────────────────────

  getHeads(): string[] {
    return [String(this.version)]
  }

  pendingOps(): number {
    return this._pendingOps
  }

  commit(_msg?: string, _time?: number): string | null {
    this.version++
    this._pendingOps = 0
    return String(this.version)
  }

  integrate(): void {}

  rollback(): void {
    this._pendingOps = 0
  }

  isolate(_scope: any): void {}

  // ── Config ────────────────────────────────────────────────────────────────

  enableFreeze(b: boolean): void {
    this._freezeEnabled = b
  }

  registerDatatype(_name: string, ..._args: any[]): void {}

  // ── Misc ──────────────────────────────────────────────────────────────────

  getActorId(): string {
    return this.actorId
  }

  free(): void {}

  updateDiffCursor(): void {}

  fork(actor?: string, _heads?: any): ObliviousHandle {
    const next = new ObliviousHandle(actor || randomActorId())
    next.store = new Map(this.store)
    next._freezeEnabled = this._freezeEnabled
    return next
  }

  // ── Stubs for nested-object / list / text ops ─────────────────────────────
  // These are never called for a flat oblivious map, but proxies.ts requires
  // the methods to exist on the context object.

  putObject(_obj: string, _prop: any, _value: any): string {
    throw new Error("oblivious: nested objects not supported")
  }

  insertObject(_obj: string, _index: any, _value: any): string {
    throw new Error("oblivious: list operations not supported")
  }

  insert(_obj: string, _index: any, _value: any, _datatype: string): void {
    throw new Error("oblivious: list operations not supported")
  }

  splice(_obj: string, _index: any, _n: number, _text?: string): void {
    throw new Error("oblivious: list operations not supported")
  }

  length(_obj: string): number {
    return 0
  }

  text(_obj: string): string {
    return ""
  }

  getCursorPosition(_obj: string, _cursor: any): number {
    throw new Error("oblivious: cursor not supported")
  }

  // ── Stubs for sync / history (not needed in oblivious mode) ───────────────

  getChanges(_heads: any): any[] {
    return []
  }

  getChangesMeta(_heads: any): any[] {
    return []
  }

  topoHistoryTraversal(): string[] {
    return []
  }

  getLastLocalChange(): null {
    return null
  }

  save(): Uint8Array {
    throw new Error("oblivious: save not implemented")
  }

  merge(_other: any): any[] {
    throw new Error("oblivious: merge not implemented")
  }
}

// ── ObliviousApi ─────────────────────────────────────────────────────────────
// Passed to UseApi() so that ApiHandler delegates to ObliviousHandle.

export const ObliviousApi = {
  create(options?: { actor?: string }): ObliviousHandle {
    return new ObliviousHandle(options?.actor ?? randomActorId())
  },
  load(): never {
    throw new Error("oblivious: load not implemented")
  },
  encodeChange(): never {
    throw new Error("oblivious: not implemented")
  },
  decodeChange(): never {
    throw new Error("oblivious: not implemented")
  },
  initSyncState(): never {
    throw new Error("oblivious: not implemented")
  },
  encodeSyncMessage(): never {
    throw new Error("oblivious: not implemented")
  },
  decodeSyncMessage(): never {
    throw new Error("oblivious: not implemented")
  },
  encodeSyncState(): never {
    throw new Error("oblivious: not implemented")
  },
  decodeSyncState(): never {
    throw new Error("oblivious: not implemented")
  },
  exportSyncState(): never {
    throw new Error("oblivious: not implemented")
  },
  importSyncState(): never {
    throw new Error("oblivious: not implemented")
  },
  readBundle(): never {
    throw new Error("oblivious: not implemented")
  },
  wasmReleaseInfo(): never {
    throw new Error("oblivious: not implemented")
  },
}
