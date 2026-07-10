/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * ObliviousHandle — pure-JS passthrough backend for Automerge.
 *
 * Stores opaque key-value pairs (both keys and values are pre-encrypted by the
 * caller). Automerge never sees plaintext — encryption/decryption is done
 * outside this module, at the sandbox boundary.
 *
 * When a browser ObliviousArray factory is provided via setBrowserBackend(),
 * list storage uses C++ ObliviousArray (encrypted-position ops). Otherwise
 * falls back to plain JS arrays for pure-TS testing.
 *
 * No obliv-core imports. This is intentional: the proxy layer is a pure
 * passthrough, treating encrypted values as opaque JS objects.
 */
import { STATE, OBJECT_ID } from "./constants.js"
import {
  encodeSyncMessage,
  decodeSyncMessage,
  hexEncode,
} from "./oblivious_sync_codec.js"

// Browser ObliviousArray — opaque DOM object from window.oblivious.createArray()
interface BrowserObliviousArray {
  readonly length: number;
  get(index: number): any;
  set(index: number, value: any): void;
  insertAt(index: number, value: any): void;
  deleteAt(index: number): void;
  obliviousInsert(index: any, value: any): void;
  obliviousDelete(index: any): void;
  obliviousEdit(cursor: any, action: any, value: any): void;
}

type ListBackend = BrowserObliviousArray | any[];

let arrayFactory: (() => BrowserObliviousArray) | null = null;

/**
 * Provide the browser's ObliviousArray factory (window.oblivious.createArray).
 * When set, all new lists use C++ ObliviousArray storage.
 */
export function setBrowserBackend(createArray: () => BrowserObliviousArray): void {
  arrayFactory = createArray;
}

function createListBackend(): ListBackend {
  return arrayFactory ? arrayFactory() : [];
}

function isBrowserArray(backend: ListBackend): backend is BrowserObliviousArray {
  return arrayFactory !== null && !Array.isArray(backend);
}

export type ObliviousValueSerializer = {
  serialize(value: any): string
  deserialize(data: string): any
  createInt(n: number): any
}

let valueSerializer: ObliviousValueSerializer | null = null

export function setSerializer(s: ObliviousValueSerializer): void {
  valueSerializer = s
}

export class ObliviousSyncState {
  lastSentHeads: Uint8Array[] = []
  sentHashes: Set<string> = new Set()
  theirHeads: Uint8Array[] | undefined
  free(): void {}
}

function arraysEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

function headsEqual(a: Uint8Array[], b: Uint8Array[]): boolean {
  if (a.length !== b.length) return false
  return a.every((h, i) => arraysEqual(h, b[i]))
}

function listGet(backend: ListBackend, index: number): any {
  if (isBrowserArray(backend)) return backend.get(index);
  return backend[index];
}

function listSet(backend: ListBackend, index: number, value: any): void {
  if (isBrowserArray(backend)) { backend.set(index, value); return; }
  backend[index] = value;
}

function listInsert(backend: ListBackend, index: number, value: any): void {
  if (isBrowserArray(backend)) { backend.insertAt(index, value); return; }
  backend.splice(index, 0, value);
}

function listDelete(backend: ListBackend, index: number): void {
  if (isBrowserArray(backend)) { backend.deleteAt(index); return; }
  backend.splice(index, 1);
}

function listLength(backend: ListBackend): number {
  return backend.length;
}

type ListObject = { type: "list"; data: ListBackend }

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
  private objects: Map<string, ListObject> = new Map()
  private nextObjId = 1
  private readonly actorId: string
  private version = 0
  private _pendingOps = 0
  private _freezeEnabled = false

  private changeLog: { hash: Uint8Array; encoded: Uint8Array }[] = []
  private changeSeq = 0
  private currentHeads: Uint8Array[] = []

  constructor(actorId: string) {
    this.actorId = actorId
  }

  private allocId(): string {
    return `${this.nextObjId++}@${this.actorId}`
  }

  private makeChangeId(seq: number): Uint8Array {
    const id = new Uint8Array(32)
    const seqBytes = new TextEncoder().encode(`${seq}:${this.actorId}`)
    id.set(seqBytes.slice(0, 32))
    return id
  }

  private resolvePathForObj(objId: string): string {
    for (const [key, val] of this.store) {
      if (val === objId) return key
    }
    return objId
  }

  private resolveObjForPath(path: string): string | undefined {
    const val = this.store.get(path)
    if (val && this.objects.has(val)) return val
    return undefined
  }

  private recordChange(obj: string, _cursor: any, action: any, value: any): void {
    if (!valueSerializer) return
    const seq = ++this.changeSeq
    const packed = JSON.stringify({
      action: valueSerializer.serialize(action),
      value: valueSerializer.serialize(value),
    })
    const changeData = new TextEncoder().encode(
      JSON.stringify({
        actor: this.actorId,
        seq,
        startOp: seq,
        time: 0,
        message: null,
        deps: this.currentHeads.map(h => hexEncode(h)),
        hash: hexEncode(this.makeChangeId(seq)),
        ops: [
          {
            action: "obliviousEdit",
            obj: this.resolvePathForObj(obj),
            key: "",
            elemId: null,
            value: packed,
            datatype: "bytes",
            pred: [],
            insert: true,
          },
        ],
      }),
    )
    const hash = this.makeChangeId(seq)
    this.changeLog.push({ hash, encoded: changeData })
    this.currentHeads = [hash]
  }

  // ── Core map / list ops ───────────────────────────────────────────────────

  put(obj: string, prop: any, value: any, _datatype: string): void {
    const list = this.objects.get(obj)
    if (list) {
      listSet(list.data, prop as number, value)
    } else {
      this.store.set(String(prop), value)
    }
    this._pendingOps++
  }

  getWithType(obj: string, prop: any): [string, any] | null {
    const list = this.objects.get(obj)
    if (list) {
      const idx = typeof prop === "string" ? parseInt(prop, 10) : prop
      if (idx < 0 || idx >= listLength(list.data)) return null
      return ["oblivious", listGet(list.data, idx)]
    }
    const key = String(prop)
    if (!this.store.has(key)) return null
    const val = this.store.get(key)
    if (typeof val === "string" && this.objects.has(val)) {
      return ["list", val]
    }
    return ["oblivious", val]
  }

  get(obj: string, prop: any): [string, any] | null {
    return this.getWithType(obj, prop)
  }

  keys(obj: string): string[] {
    const list = this.objects.get(obj)
    if (list) {
      const len = listLength(list.data)
      const keys: string[] = []
      for (let i = 0; i < len; i++) keys.push(String(i))
      return keys
    }
    return [...this.store.keys()]
  }

  delete(obj: string, prop: any): void {
    const list = this.objects.get(obj)
    if (list) {
      const idx = typeof prop === "string" ? parseInt(prop, 10) : prop
      listDelete(list.data, idx)
    } else {
      this.store.delete(String(prop))
    }
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
      const listObj = this.objects.get(value)
      if (listObj) {
        const len = listLength(listObj.data)
        const arr: any[] = []
        for (let i = 0; i < len; i++) arr.push(listGet(listObj.data, i))
        Object.defineProperty(arr, OBJECT_ID, {
          value,
          enumerable: false,
          configurable: true,
        })
        if (this._freezeEnabled) Object.freeze(arr)
        doc[key] = arr
      } else {
        doc[key] = value
      }
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
    for (const [id, obj] of this.objects) {
      const copy = createListBackend()
      const len = listLength(obj.data)
      for (let i = 0; i < len; i++) {
        listInsert(copy, i, listGet(obj.data, i))
      }
      next.objects.set(id, { type: obj.type, data: copy })
    }
    next.nextObjId = this.nextObjId
    next._freezeEnabled = this._freezeEnabled
    return next
  }

  // ── List / nested-object ops ───────────────────────────────────────────────

  putObject(obj: string, prop: any, value: any): string {
    if (Array.isArray(value)) {
      const id = this.allocId()
      this.objects.set(id, { type: "list", data: createListBackend() })
      if (this.objects.has(obj)) {
        listSet(this.objects.get(obj)!.data, prop as number, id)
      } else {
        this.store.set(String(prop), id)
      }
      this._pendingOps++
      return id
    }
    throw new Error("oblivious: nested maps not supported")
  }

  insertObject(obj: string, index: any, value: any): string {
    if (Array.isArray(value)) {
      const id = this.allocId()
      this.objects.set(id, { type: "list", data: createListBackend() })
      const list = this.objects.get(obj)
      if (list) {
        listInsert(list.data, index as number, id)
      }
      this._pendingOps++
      return id
    }
    throw new Error("oblivious: nested maps not supported")
  }

  insert(obj: string, index: any, value: any, _datatype: string): void {
    const list = this.objects.get(obj)
    if (!list) throw new Error("oblivious: insert target is not a list")
    listInsert(list.data, index as number, value)
    this._pendingOps++
  }

  obliviousInsert(obj: string, index: any, value: any): void {
    const list = this.objects.get(obj)
    if (!list) throw new Error("oblivious: insert target is not a list")
    if (!isBrowserArray(list.data)) {
      throw new Error("oblivious: obliviousInsert requires browser backend")
    }
    list.data.obliviousInsert(index, value)
    this._pendingOps++
  }

  obliviousDelete(obj: string, index: any): void {
    const list = this.objects.get(obj)
    if (!list) throw new Error("oblivious: delete target is not a list")
    if (!isBrowserArray(list.data)) {
      throw new Error("oblivious: obliviousDelete requires browser backend")
    }
    list.data.obliviousDelete(index)
    this._pendingOps++
  }

  obliviousEdit(obj: string, cursor: any, action: any, value: any): void {
    const list = this.objects.get(obj)
    if (!list) throw new Error("oblivious: edit target is not a list")
    if (!isBrowserArray(list.data)) {
      throw new Error("oblivious: obliviousEdit requires browser backend")
    }
    list.data.obliviousEdit(cursor, action, value)
    this._pendingOps++
    this.recordChange(obj, cursor, action, value)
  }

  splice(obj: string, index: any, n: number, _text?: string): void {
    const list = this.objects.get(obj)
    if (!list) throw new Error("oblivious: splice target is not a list")
    for (let i = 0; i < n; i++) {
      listDelete(list.data, index as number)
    }
    this._pendingOps++
  }

  length(obj: string): number {
    const list = this.objects.get(obj)
    if (list) return listLength(list.data)
    return 0
  }

  text(_obj: string): string {
    return ""
  }

  getCursorPosition(_obj: string, _cursor: any): number {
    throw new Error("oblivious: cursor not supported")
  }

  // ── Sync ───────────────────────────────────────────────────────────────────

  generateSyncMessage(syncState: ObliviousSyncState): Uint8Array | null {
    const unsent = this.changeLog.filter(
      c => !syncState.sentHashes.has(hexEncode(c.hash)),
    )

    if (
      unsent.length === 0 &&
      headsEqual(syncState.lastSentHeads, this.currentHeads)
    ) {
      return null
    }

    for (const c of unsent) {
      syncState.sentHashes.add(hexEncode(c.hash))
    }
    syncState.lastSentHeads = [...this.currentHeads]

    return encodeSyncMessage({
      heads: this.currentHeads,
      need: [],
      have: [],
      changes: unsent.map(c => c.encoded),
    })
  }

  receiveSyncMessage(syncState: ObliviousSyncState, message: Uint8Array): void {
    const msg = decodeSyncMessage(message)

    for (const changeBytes of msg.changes) {
      const change = JSON.parse(new TextDecoder().decode(changeBytes))
      for (const op of change.ops) {
        if (op.action === "obliviousEdit" && valueSerializer) {
          const objId = this.resolveObjForPath(op.obj)
          if (!objId) continue
          const list = this.objects.get(objId)
          if (list && isBrowserArray(list.data)) {
            const packed = JSON.parse(op.value)
            const action = valueSerializer.deserialize(packed.action)
            const value = valueSerializer.deserialize(packed.value)
            const cursor = valueSerializer.createInt(listLength(list.data))
            list.data.obliviousEdit(cursor, action, value)
          }
        }
      }
      const hash = new Uint8Array(32)
      const idBytes = new TextEncoder().encode(`${change.actor}:${change.seq}`)
      hash.set(idBytes.slice(0, 32))
      this.changeLog.push({ hash, encoded: changeBytes })
    }

    syncState.theirHeads = msg.heads
    this.currentHeads = [...msg.heads]
    this.version++
  }

  hasOurChanges(syncState: ObliviousSyncState): boolean {
    if (!syncState.theirHeads) return false
    return this.currentHeads.every(h =>
      syncState.theirHeads!.some(th => arraysEqual(h, th)),
    )
  }

  // ── Stubs for history (not needed in oblivious mode) ──────────────────────

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
  initSyncState(): ObliviousSyncState {
    return new ObliviousSyncState()
  },
  encodeSyncMessage(msg: any): Uint8Array {
    return encodeSyncMessage(msg)
  },
  decodeSyncMessage(data: Uint8Array): any {
    return decodeSyncMessage(data)
  },
  encodeSyncState(): Uint8Array {
    return new Uint8Array(0)
  },
  decodeSyncState(): ObliviousSyncState {
    return new ObliviousSyncState()
  },
  exportSyncState(state: any): any {
    if (state instanceof ObliviousSyncState) {
      return {
        sharedHeads: (state.theirHeads || []).map(hexEncode),
        lastSentHeads: state.lastSentHeads.map(hexEncode),
        theirHeads: state.theirHeads?.map(hexEncode),
        theirHeed: undefined,
        theirHave: undefined,
        sentHashes: [...state.sentHashes],
        _internal: {
          lastSentHeads: state.lastSentHeads,
          sentHashes: state.sentHashes,
          theirHeads: state.theirHeads,
        },
      }
    }
    return state
  },
  importSyncState(state: any): ObliviousSyncState {
    const s = new ObliviousSyncState()
    if (state._internal) {
      s.lastSentHeads = state._internal.lastSentHeads || []
      s.sentHashes = state._internal.sentHashes || new Set()
      s.theirHeads = state._internal.theirHeads
    }
    return s
  },
  readBundle(): never {
    throw new Error("oblivious: not implemented")
  },
  wasmReleaseInfo(): never {
    throw new Error("oblivious: not implemented")
  },
}
