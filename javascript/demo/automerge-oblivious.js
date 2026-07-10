var __defProp = Object.defineProperty;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/wasm_bindgen_output/web/automerge_wasm.js
var automerge_wasm_exports = {};
__export(automerge_wasm_exports, {
  default: () => initWasm
});
function initWasm() {
  throw new Error("wasm not available in oblivious mode");
}

// src/low_level.ts
var _initialized = false;
var _initializeListeners = [];
function UseApi(api) {
  for (const k in api) {
    ;
    ApiHandler[k] = api[k];
  }
  _initialized = true;
  for (const listener of _initializeListeners) {
    listener();
  }
}
var ApiHandler = {
  create(options) {
    throw new RangeError("Automerge.use() not called");
  },
  load(data, options) {
    throw new RangeError("Automerge.use() not called (load)");
  },
  encodeChange(change2) {
    throw new RangeError("Automerge.use() not called (encodeChange)");
  },
  decodeChange(change2) {
    throw new RangeError("Automerge.use() not called (decodeChange)");
  },
  initSyncState() {
    throw new RangeError("Automerge.use() not called (initSyncState)");
  },
  encodeSyncMessage(message) {
    throw new RangeError("Automerge.use() not called (encodeSyncMessage)");
  },
  decodeSyncMessage(msg) {
    throw new RangeError("Automerge.use() not called (decodeSyncMessage)");
  },
  encodeSyncState(state) {
    throw new RangeError("Automerge.use() not called (encodeSyncState)");
  },
  decodeSyncState(data) {
    throw new RangeError("Automerge.use() not called (decodeSyncState)");
  },
  exportSyncState(state) {
    throw new RangeError("Automerge.use() not called (exportSyncState)");
  },
  importSyncState(state) {
    throw new RangeError("Automerge.use() not called (importSyncState)");
  },
  readBundle(data) {
    throw new RangeError("Automerge.use() not called (readBundle)");
  },
  wasmReleaseInfo() {
    throw new RangeError("Automerge.use() not called (wasmReleaseInfo)");
  }
};
function initializeWasm(wasmBlob) {
  return initWasm({ module_or_path: wasmBlob }).then((_) => {
    UseApi(automerge_wasm_exports);
  });
}
function initializeBase64Wasm(wasmBase64) {
  return initializeWasm(Uint8Array.from(atob(wasmBase64), (c) => c.charCodeAt(0)));
}
function wasmInitialized() {
  if (_initialized) return Promise.resolve();
  return new Promise((resolve) => {
    _initializeListeners.push(resolve);
  });
}
function isWasmInitialized() {
  return _initialized;
}

// src/constants.ts
var STATE = /* @__PURE__ */ Symbol.for("_am_meta");
var TRACE = /* @__PURE__ */ Symbol.for("_am_trace");
var OBJECT_ID = /* @__PURE__ */ Symbol.for("_am_objectId");
var IS_PROXY = /* @__PURE__ */ Symbol.for("_am_isProxy");
var CLEAR_CACHE = /* @__PURE__ */ Symbol.for("_am_clearCache");
var UINT = /* @__PURE__ */ Symbol.for("_am_uint");
var INT = /* @__PURE__ */ Symbol.for("_am_int");
var F64 = /* @__PURE__ */ Symbol.for("_am_f64");
var COUNTER = /* @__PURE__ */ Symbol.for("_am_counter");
var IMMUTABLE_STRING = /* @__PURE__ */ Symbol.for("_am_immutableString");

// src/oblivious_sync_codec.ts
var MESSAGE_TYPE_V1 = 66;
function encodeLEB128(value) {
  const bytes = [];
  do {
    let byte = value & 127;
    value >>>= 7;
    if (value !== 0) byte |= 128;
    bytes.push(byte);
  } while (value !== 0);
  return bytes;
}
function decodeLEB128(data, offset) {
  let result = 0;
  let shift = 0;
  let pos = offset;
  while (pos < data.length) {
    const byte = data[pos];
    result |= (byte & 127) << shift;
    pos++;
    if ((byte & 128) === 0) break;
    shift += 7;
  }
  return [result, pos];
}
function encodeSyncMessage(msg) {
  const parts = [MESSAGE_TYPE_V1];
  parts.push(...encodeLEB128(msg.heads.length));
  for (const hash of msg.heads) {
    for (let i = 0; i < hash.length; i++) parts.push(hash[i]);
  }
  parts.push(...encodeLEB128(msg.need.length));
  for (const hash of msg.need) {
    for (let i = 0; i < hash.length; i++) parts.push(hash[i]);
  }
  parts.push(...encodeLEB128(msg.have.length));
  for (const have of msg.have) {
    parts.push(...encodeLEB128(have.lastSync.length));
    for (const hash of have.lastSync) {
      for (let i = 0; i < hash.length; i++) parts.push(hash[i]);
    }
    parts.push(...encodeLEB128(have.bloom.length));
    for (let i = 0; i < have.bloom.length; i++) parts.push(have.bloom[i]);
  }
  parts.push(...encodeLEB128(msg.changes.length));
  for (const change2 of msg.changes) {
    parts.push(...encodeLEB128(change2.length));
    for (let i = 0; i < change2.length; i++) parts.push(change2[i]);
  }
  return new Uint8Array(parts);
}
function decodeSyncMessage(data) {
  let pos = 0;
  const msgType = data[pos++];
  if (msgType !== MESSAGE_TYPE_V1) {
    throw new Error(`unknown sync message type: 0x${msgType.toString(16)}`);
  }
  let count;
  [count, pos] = decodeLEB128(data, pos);
  const heads = [];
  for (let i = 0; i < count; i++) {
    heads.push(data.slice(pos, pos + 32));
    pos += 32;
  }
  ;
  [count, pos] = decodeLEB128(data, pos);
  const need = [];
  for (let i = 0; i < count; i++) {
    need.push(data.slice(pos, pos + 32));
    pos += 32;
  }
  ;
  [count, pos] = decodeLEB128(data, pos);
  const have = [];
  for (let i = 0; i < count; i++) {
    let syncCount;
    [syncCount, pos] = decodeLEB128(data, pos);
    const lastSync = [];
    for (let j = 0; j < syncCount; j++) {
      lastSync.push(data.slice(pos, pos + 32));
      pos += 32;
    }
    let bloomLen;
    [bloomLen, pos] = decodeLEB128(data, pos);
    const bloom = data.slice(pos, pos + bloomLen);
    pos += bloomLen;
    have.push({ lastSync, bloom });
  }
  ;
  [count, pos] = decodeLEB128(data, pos);
  const changes = [];
  for (let i = 0; i < count; i++) {
    let changeLen;
    [changeLen, pos] = decodeLEB128(data, pos);
    changes.push(data.slice(pos, pos + changeLen));
    pos += changeLen;
  }
  return { heads, need, have, changes };
}
function hexEncode(data) {
  return Array.from(data).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// src/oblivious_handle.ts
var arrayFactory = null;
function setBrowserBackend(createArray) {
  arrayFactory = createArray;
}
function createListBackend() {
  return arrayFactory ? arrayFactory() : [];
}
function isBrowserArray(backend) {
  return arrayFactory !== null && !Array.isArray(backend);
}
var valueSerializer = null;
function setSerializer(s) {
  valueSerializer = s;
}
var ObliviousSyncState = class {
  constructor() {
    this.lastSentHeads = [];
    this.sentHashes = /* @__PURE__ */ new Set();
  }
  free() {
  }
};
function arraysEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
function headsEqual(a, b) {
  if (a.length !== b.length) return false;
  return a.every((h, i) => arraysEqual(h, b[i]));
}
function listGet(backend, index) {
  if (isBrowserArray(backend)) return backend.get(index);
  return backend[index];
}
function listSet(backend, index, value) {
  if (isBrowserArray(backend)) {
    backend.set(index, value);
    return;
  }
  backend[index] = value;
}
function listInsert(backend, index, value) {
  if (isBrowserArray(backend)) {
    backend.insertAt(index, value);
    return;
  }
  backend.splice(index, 0, value);
}
function listDelete(backend, index) {
  if (isBrowserArray(backend)) {
    backend.deleteAt(index);
    return;
  }
  backend.splice(index, 1);
}
function listLength(backend) {
  return backend.length;
}
function randomActorId() {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    const nodeCrypto = __require("crypto");
    const buf = nodeCrypto.randomBytes(16);
    bytes.set(buf);
  }
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}
var ObliviousHandle = class _ObliviousHandle {
  constructor(actorId) {
    /**
     * Non-undefined so that isSameDocument() in proxies.ts does not produce
     * false positives (it compares __wbg_ptr === __wbg_ptr; undefined===undefined
     * would be true for every non-doc object).
     */
    this.__wbg_ptr = 0;
    this.store = /* @__PURE__ */ new Map();
    this.objects = /* @__PURE__ */ new Map();
    this.nextObjId = 1;
    this.version = 0;
    this._pendingOps = 0;
    this._freezeEnabled = false;
    this.changeLog = [];
    this.changeSeq = 0;
    this.currentHeads = [];
    this.actorId = actorId;
  }
  allocId() {
    return `${this.nextObjId++}@${this.actorId}`;
  }
  makeChangeId(seq) {
    const id = new Uint8Array(32);
    const seqBytes = new TextEncoder().encode(`${seq}:${this.actorId}`);
    id.set(seqBytes.slice(0, 32));
    return id;
  }
  resolvePathForObj(objId) {
    for (const [key, val] of this.store) {
      if (val === objId) return key;
    }
    return objId;
  }
  resolveObjForPath(path) {
    const val = this.store.get(path);
    if (val && this.objects.has(val)) return val;
    return void 0;
  }
  recordChange(obj, _cursor, action, value) {
    if (!valueSerializer) return;
    console.log("[sync] recordChange called, changeLog.length before:", this.changeLog.length);
    const seq = ++this.changeSeq;
    const packed = JSON.stringify({
      action: valueSerializer.serialize(action),
      value: valueSerializer.serialize(value)
    });
    const changeData = new TextEncoder().encode(
      JSON.stringify({
        actor: this.actorId,
        seq,
        startOp: seq,
        time: 0,
        message: null,
        deps: this.currentHeads.map((h) => hexEncode(h)),
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
            insert: true
          }
        ]
      })
    );
    const hash = this.makeChangeId(seq);
    this.changeLog.push({ hash, encoded: changeData });
    this.currentHeads = [hash];
  }
  // ── Core map / list ops ───────────────────────────────────────────────────
  put(obj, prop, value, _datatype) {
    const list = this.objects.get(obj);
    if (list) {
      listSet(list.data, prop, value);
    } else {
      this.store.set(String(prop), value);
    }
    this._pendingOps++;
  }
  getWithType(obj, prop) {
    const list = this.objects.get(obj);
    if (list) {
      const idx = typeof prop === "string" ? parseInt(prop, 10) : prop;
      if (idx < 0 || idx >= listLength(list.data)) return null;
      return ["oblivious", listGet(list.data, idx)];
    }
    const key = String(prop);
    if (!this.store.has(key)) return null;
    const val = this.store.get(key);
    if (typeof val === "string" && this.objects.has(val)) {
      return ["list", val];
    }
    return ["oblivious", val];
  }
  get(obj, prop) {
    return this.getWithType(obj, prop);
  }
  keys(obj) {
    const list = this.objects.get(obj);
    if (list) {
      const len = listLength(list.data);
      const keys = [];
      for (let i = 0; i < len; i++) keys.push(String(i));
      return keys;
    }
    return [...this.store.keys()];
  }
  delete(obj, prop) {
    const list = this.objects.get(obj);
    if (list) {
      const idx = typeof prop === "string" ? parseInt(prop, 10) : prop;
      listDelete(list.data, idx);
    } else {
      this.store.delete(String(prop));
    }
    this._pendingOps++;
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
  materialize(_obj2, _heads, meta) {
    const doc = {};
    for (const [key, value] of this.store) {
      const listObj = this.objects.get(value);
      if (listObj) {
        const len = listLength(listObj.data);
        const arr = [];
        for (let i = 0; i < len; i++) arr.push(listGet(listObj.data, i));
        Object.defineProperty(arr, OBJECT_ID, {
          value,
          enumerable: false,
          configurable: true
        });
        if (this._freezeEnabled) Object.freeze(arr);
        doc[key] = arr;
      } else {
        doc[key] = value;
      }
    }
    Object.defineProperty(doc, STATE, {
      value: meta,
      enumerable: false,
      configurable: true,
      writable: true
    });
    Object.defineProperty(doc, OBJECT_ID, {
      value: "_root",
      enumerable: false,
      configurable: true
    });
    if (this._freezeEnabled) Object.freeze(doc);
    return doc;
  }
  applyAndReturnPatches(_doc, meta) {
    return { value: this.materialize("_root", void 0, meta), patches: [] };
  }
  applyPatches(_doc, meta) {
    return this.materialize("_root", void 0, meta);
  }
  // ── Transaction lifecycle ─────────────────────────────────────────────────
  getHeads() {
    return [String(this.version)];
  }
  pendingOps() {
    return this._pendingOps;
  }
  commit(_msg, _time) {
    this.version++;
    this._pendingOps = 0;
    return String(this.version);
  }
  integrate() {
  }
  rollback() {
    this._pendingOps = 0;
  }
  isolate(_scope) {
  }
  // ── Config ────────────────────────────────────────────────────────────────
  enableFreeze(b) {
    this._freezeEnabled = b;
  }
  registerDatatype(_name, ..._args) {
  }
  // ── Misc ──────────────────────────────────────────────────────────────────
  getActorId() {
    return this.actorId;
  }
  free() {
  }
  updateDiffCursor() {
  }
  fork(actor, _heads) {
    const next = new _ObliviousHandle(actor || randomActorId());
    next.store = new Map(this.store);
    for (const [id, obj] of this.objects) {
      const copy = createListBackend();
      const len = listLength(obj.data);
      for (let i = 0; i < len; i++) {
        listInsert(copy, i, listGet(obj.data, i));
      }
      next.objects.set(id, { type: obj.type, data: copy });
    }
    next.nextObjId = this.nextObjId;
    next._freezeEnabled = this._freezeEnabled;
    return next;
  }
  // ── List / nested-object ops ───────────────────────────────────────────────
  putObject(obj, prop, value) {
    if (Array.isArray(value)) {
      const id = this.allocId();
      this.objects.set(id, { type: "list", data: createListBackend() });
      if (this.objects.has(obj)) {
        listSet(this.objects.get(obj).data, prop, id);
      } else {
        this.store.set(String(prop), id);
      }
      this._pendingOps++;
      return id;
    }
    throw new Error("oblivious: nested maps not supported");
  }
  insertObject(obj, index, value) {
    if (Array.isArray(value)) {
      const id = this.allocId();
      this.objects.set(id, { type: "list", data: createListBackend() });
      const list = this.objects.get(obj);
      if (list) {
        listInsert(list.data, index, id);
      }
      this._pendingOps++;
      return id;
    }
    throw new Error("oblivious: nested maps not supported");
  }
  insert(obj, index, value, _datatype) {
    const list = this.objects.get(obj);
    if (!list) throw new Error("oblivious: insert target is not a list");
    listInsert(list.data, index, value);
    this._pendingOps++;
  }
  obliviousInsert(obj, index, value) {
    const list = this.objects.get(obj);
    if (!list) throw new Error("oblivious: insert target is not a list");
    if (!isBrowserArray(list.data)) {
      throw new Error("oblivious: obliviousInsert requires browser backend");
    }
    list.data.obliviousInsert(index, value);
    this._pendingOps++;
  }
  obliviousDelete(obj, index) {
    const list = this.objects.get(obj);
    if (!list) throw new Error("oblivious: delete target is not a list");
    if (!isBrowserArray(list.data)) {
      throw new Error("oblivious: obliviousDelete requires browser backend");
    }
    list.data.obliviousDelete(index);
    this._pendingOps++;
  }
  obliviousEdit(obj, cursor, action, value) {
    const list = this.objects.get(obj);
    if (!list) throw new Error("oblivious: edit target is not a list");
    if (!isBrowserArray(list.data)) {
      throw new Error("oblivious: obliviousEdit requires browser backend");
    }
    list.data.obliviousEdit(cursor, action, value);
    this._pendingOps++;
    this.recordChange(obj, cursor, action, value);
  }
  splice(obj, index, n, _text) {
    const list = this.objects.get(obj);
    if (!list) throw new Error("oblivious: splice target is not a list");
    for (let i = 0; i < n; i++) {
      listDelete(list.data, index);
    }
    this._pendingOps++;
  }
  length(obj) {
    const list = this.objects.get(obj);
    if (list) return listLength(list.data);
    return 0;
  }
  text(_obj2) {
    return "";
  }
  getCursorPosition(_obj2, _cursor) {
    throw new Error("oblivious: cursor not supported");
  }
  // ── Sync ───────────────────────────────────────────────────────────────────
  generateSyncMessage(syncState) {
    console.log("[sync] generateSyncMessage: changeLog.length=", this.changeLog.length, "sentHashes.size=", syncState.sentHashes.size);
    const unsent = this.changeLog.filter(
      (c) => !syncState.sentHashes.has(hexEncode(c.hash))
    );
    console.log("[sync] unsent.length=", unsent.length, "headsEqual=", headsEqual(syncState.lastSentHeads, this.currentHeads));
    if (unsent.length === 0 && headsEqual(syncState.lastSentHeads, this.currentHeads)) {
      console.log("[sync] returning null \u2014 nothing to send");
      return null;
    }
    for (const c of unsent) {
      syncState.sentHashes.add(hexEncode(c.hash));
    }
    syncState.lastSentHeads = [...this.currentHeads];
    return encodeSyncMessage({
      heads: this.currentHeads,
      need: [],
      have: [],
      changes: unsent.map((c) => c.encoded)
    });
  }
  receiveSyncMessage(syncState, message) {
    const msg = decodeSyncMessage(message);
    for (const changeBytes of msg.changes) {
      const change2 = JSON.parse(new TextDecoder().decode(changeBytes));
      for (const op of change2.ops) {
        if (op.action === "obliviousEdit" && valueSerializer) {
          const objId = this.resolveObjForPath(op.obj);
          if (!objId) continue;
          const list = this.objects.get(objId);
          if (list && isBrowserArray(list.data)) {
            const packed = JSON.parse(op.value);
            const action = valueSerializer.deserialize(packed.action);
            const value = valueSerializer.deserialize(packed.value);
            const cursor = valueSerializer.createInt(listLength(list.data));
            list.data.obliviousEdit(cursor, action, value);
          }
        }
      }
      const hash = new Uint8Array(32);
      const idBytes = new TextEncoder().encode(`${change2.actor}:${change2.seq}`);
      hash.set(idBytes.slice(0, 32));
      this.changeLog.push({ hash, encoded: changeBytes });
    }
    syncState.theirHeads = msg.heads;
    this.currentHeads = [...msg.heads];
    this.version++;
  }
  hasOurChanges(syncState) {
    if (!syncState.theirHeads) return false;
    return this.currentHeads.every(
      (h) => syncState.theirHeads.some((th) => arraysEqual(h, th))
    );
  }
  // ── Stubs for history (not needed in oblivious mode) ──────────────────────
  getChanges(_heads) {
    return [];
  }
  getChangesMeta(_heads) {
    return [];
  }
  topoHistoryTraversal() {
    return [];
  }
  getLastLocalChange() {
    return null;
  }
  save() {
    throw new Error("oblivious: save not implemented");
  }
  merge(_other) {
    throw new Error("oblivious: merge not implemented");
  }
};
var ObliviousApi = {
  create(options) {
    return new ObliviousHandle(options?.actor ?? randomActorId());
  },
  load() {
    throw new Error("oblivious: load not implemented");
  },
  encodeChange() {
    throw new Error("oblivious: not implemented");
  },
  decodeChange() {
    throw new Error("oblivious: not implemented");
  },
  initSyncState() {
    return new ObliviousSyncState();
  },
  encodeSyncMessage(msg) {
    return encodeSyncMessage(msg);
  },
  decodeSyncMessage(data) {
    return decodeSyncMessage(data);
  },
  encodeSyncState() {
    return new Uint8Array(0);
  },
  decodeSyncState() {
    return new ObliviousSyncState();
  },
  exportSyncState(state) {
    if (state instanceof ObliviousSyncState) {
      return {
        sharedHeads: (state.theirHeads || []).map(hexEncode),
        lastSentHeads: state.lastSentHeads.map(hexEncode),
        theirHeads: state.theirHeads?.map(hexEncode),
        theirHeed: void 0,
        theirHave: void 0,
        sentHashes: [...state.sentHashes],
        _internal: {
          lastSentHeads: state.lastSentHeads,
          sentHashes: state.sentHashes,
          theirHeads: state.theirHeads
        }
      };
    }
    return state;
  },
  importSyncState(state) {
    const s = new ObliviousSyncState();
    if (state._internal) {
      s.lastSentHeads = state._internal.lastSentHeads || [];
      s.sentHashes = state._internal.sentHashes || /* @__PURE__ */ new Set();
      s.theirHeads = state._internal.theirHeads;
    }
    return s;
  },
  readBundle() {
    throw new Error("oblivious: not implemented");
  },
  wasmReleaseInfo() {
    throw new Error("oblivious: not implemented");
  }
};

// src/implementation.ts
var implementation_exports = {};
__export(implementation_exports, {
  Counter: () => Counter,
  Float64: () => Float64,
  ImmutableString: () => ImmutableString,
  Int: () => Int,
  RawString: () => RawString,
  Uint: () => Uint,
  applyChanges: () => applyChanges,
  applyPatch: () => applyPatch,
  applyPatches: () => applyPatches,
  block: () => block,
  change: () => change,
  changeAt: () => changeAt,
  clone: () => clone,
  decodeChange: () => decodeChange,
  decodeSyncMessage: () => decodeSyncMessage2,
  decodeSyncState: () => decodeSyncState,
  deleteAt: () => deleteAt,
  diff: () => diff,
  diffPath: () => diffPath,
  dump: () => dump,
  emptyChange: () => emptyChange,
  encodeChange: () => encodeChange,
  encodeSyncMessage: () => encodeSyncMessage2,
  encodeSyncState: () => encodeSyncState,
  equals: () => equals,
  free: () => free,
  from: () => from,
  generateSyncMessage: () => generateSyncMessage,
  getActorId: () => getActorId,
  getAllChanges: () => getAllChanges,
  getBackend: () => getBackend,
  getChanges: () => getChanges,
  getChangesMetaSince: () => getChangesMetaSince,
  getChangesSince: () => getChangesSince,
  getConflicts: () => getConflicts,
  getCursor: () => getCursor,
  getCursorPosition: () => getCursorPosition,
  getHeads: () => getHeads,
  getHistory: () => getHistory,
  getLastLocalChange: () => getLastLocalChange,
  getMissingDeps: () => getMissingDeps,
  getObjectId: () => getObjectId,
  hasHeads: () => hasHeads,
  hasOurChanges: () => hasOurChanges,
  init: () => init,
  initSyncState: () => initSyncState,
  initializeBase64Wasm: () => initializeBase64Wasm,
  initializeWasm: () => initializeWasm,
  insertAt: () => insertAt,
  inspectChange: () => inspectChange,
  isAutomerge: () => isAutomerge,
  isCounter: () => isCounter,
  isImmutableString: () => isImmutableString,
  isRawString: () => isRawString,
  isWasmInitialized: () => isWasmInitialized,
  joinBlock: () => joinBlock,
  load: () => load,
  loadIncremental: () => loadIncremental,
  mark: () => mark,
  marks: () => marks,
  marksAt: () => marksAt,
  merge: () => merge,
  readBundle: () => readBundle,
  receiveSyncMessage: () => receiveSyncMessage,
  releaseInfo: () => releaseInfo,
  save: () => save,
  saveBundle: () => saveBundle,
  saveIncremental: () => saveIncremental,
  saveSince: () => saveSince,
  spans: () => spans,
  splice: () => splice,
  splitBlock: () => splitBlock,
  stats: () => stats,
  toJS: () => toJS,
  topoHistoryTraversal: () => topoHistoryTraversal,
  unmark: () => unmark,
  updateBlock: () => updateBlock,
  updateSpans: () => updateSpans,
  updateText: () => updateText,
  use: () => use,
  view: () => view,
  wasmInitialized: () => wasmInitialized
});

// src/counter.ts
var Counter = class {
  constructor(value) {
    this.value = value || 0;
    Reflect.defineProperty(this, COUNTER, { value: true });
  }
  /**
   * A peculiar JavaScript language feature from its early days: if the object
   * `x` has a `valueOf()` method that returns a number, you can use numerical
   * operators on the object `x` directly, such as `x + 1` or `x < 4`.
   * This method is also called when coercing a value to a string by
   * concatenating it with another string, as in `x + ''`.
   * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/valueOf
   */
  valueOf() {
    return this.value;
  }
  /**
   * Returns the counter value as a decimal string. If `x` is a counter object,
   * this method is called e.g. when you do `['value: ', x].join('')` or when
   * you use string interpolation: `value: ${x}`.
   */
  toString() {
    return this.valueOf().toString();
  }
  /**
   * Returns the counter value, so that a JSON serialization of an Automerge
   * document represents the counter simply as an integer.
   */
  toJSON() {
    return this.value;
  }
  /**
   * Increases the value of the counter by `delta`. If `delta` is not given,
   * increases the value of the counter by 1.
   *
   * Will throw an error if used outside of a change callback.
   */
  increment(_delta) {
    throw new Error(
      "Counters should not be incremented outside of a change callback"
    );
  }
  /**
   * Decreases the value of the counter by `delta`. If `delta` is not given,
   * decreases the value of the counter by 1.
   *
   * Will throw an error if used outside of a change callback.
   */
  decrement(_delta) {
    throw new Error(
      "Counters should not be decremented outside of a change callback"
    );
  }
};
var WriteableCounter = class extends Counter {
  constructor(value, context, path, objectId, key) {
    super(value);
    this.context = context;
    this.path = path;
    this.objectId = objectId;
    this.key = key;
  }
  /**
   * Increases the value of the counter by `delta`. If `delta` is not given,
   * increases the value of the counter by 1.
   */
  increment(delta) {
    delta = typeof delta === "number" ? delta : 1;
    this.context.increment(this.objectId, this.key, delta);
    this.value += delta;
    return this.value;
  }
  /**
   * Decreases the value of the counter by `delta`. If `delta` is not given,
   * decreases the value of the counter by 1.
   */
  decrement(delta) {
    return this.increment(typeof delta === "number" ? -delta : -1);
  }
};
function getWriteableCounter(value, context, path, objectId, key) {
  return new WriteableCounter(value, context, path, objectId, key);
}

// src/immutable_string.ts
var _a;
_a = IMMUTABLE_STRING;
var ImmutableString = class {
  constructor(val) {
    // Used to detect whether a value is a ImmutableString object rather than using an instanceof check
    this[_a] = true;
    this.val = val;
  }
  /**
   * Returns the content of the ImmutableString object as a simple string
   */
  toString() {
    return this.val;
  }
  toJSON() {
    return this.val;
  }
};

// src/proxies.ts
var MAX_I64 = BigInt("9223372036854775807");
function parseListIndex(key) {
  if (typeof key === "string" && /^[0-9]+$/.test(key)) key = parseInt(key, 10);
  if (typeof key !== "number") {
    return key;
  }
  if (key < 0 || isNaN(key) || key === Infinity || key === -Infinity) {
    throw new RangeError("A list index must be positive, but you passed " + key);
  }
  return key;
}
function valueAt(target, prop) {
  const { context, objectId, path } = target;
  const value = context.getWithType(objectId, prop);
  if (value === null) {
    return;
  }
  const datatype = value[0];
  const val = value[1];
  switch (datatype) {
    case void 0:
      return;
    case "map":
      return mapProxy(context, val, [...path, prop]);
    case "list":
      return listProxy(context, val, [...path, prop]);
    case "text":
      return context.text(val);
    case "str":
      return new ImmutableString(val);
    case "uint":
      return val;
    case "int":
      return val;
    case "f64":
      return val;
    case "boolean":
      return val;
    case "null":
      return null;
    case "bytes":
      return val;
    case "oblivious":
      return val;
    case "timestamp":
      return val;
    case "counter": {
      const counter = getWriteableCounter(
        val,
        context,
        path,
        objectId,
        prop
      );
      return counter;
    }
    default:
      throw RangeError(`datatype ${datatype} unimplemented`);
  }
}
function import_value(value, path, context) {
  if (value !== null && typeof value === "object" && typeof value.oblivSelect === "function") {
    return [value, "oblivious"];
  }
  const type = typeof value;
  switch (type) {
    case "object":
      if (value == null) {
        return [null, "null"];
      } else if (value[UINT]) {
        return [value.value, "uint"];
      } else if (value[INT]) {
        return [value.value, "int"];
      } else if (value[F64]) {
        return [value.value, "f64"];
      } else if (value[COUNTER]) {
        return [value.value, "counter"];
      } else if (value instanceof Date) {
        return [value.getTime(), "timestamp"];
      } else if (isImmutableString(value)) {
        return [value.toString(), "str"];
      } else if (value instanceof Uint8Array) {
        return [value, "bytes"];
      } else if (value instanceof Array) {
        return [value, "list"];
      } else if (Object.prototype.toString.call(value) === "[object Object]") {
        return [value, "map"];
      } else if (isSameDocument(value, context)) {
        throw new RangeError(
          "Cannot create a reference to an existing document object"
        );
      } else {
        throw new RangeError(`Cannot assign unknown object: ${value}`);
      }
    case "boolean":
      return [value, "boolean"];
    case "bigint":
      if (value > MAX_I64) {
        return [value, "uint"];
      } else {
        return [value, "int"];
      }
    case "number":
      if (Number.isInteger(value)) {
        return [value, "int"];
      } else {
        return [value, "f64"];
      }
    case "string":
      return [value, "text"];
    case "undefined":
      throw new RangeError(
        [
          `Cannot assign undefined value at ${printPath(path)}, `,
          "because `undefined` is not a valid JSON data type. ",
          "You might consider setting the property's value to `null`, ",
          "or using `delete` to remove it altogether."
        ].join("")
      );
    default:
      throw new RangeError(
        [
          `Cannot assign ${type} value at ${printPath(path)}. `,
          `All JSON primitive datatypes (object, array, string, number, boolean, null) `,
          `are supported in an Automerge document; ${type} values are not. `
        ].join("")
      );
  }
}
function isSameDocument(val, context) {
  if (val instanceof Date) {
    return false;
  }
  if (val && val[STATE]?.handle?.__wbg_ptr === context.__wbg_ptr) {
    return true;
  }
  return false;
}
var MapHandler = {
  get(target, key) {
    const { context, objectId, cache } = target;
    if (key === Symbol.toStringTag) {
      return target[Symbol.toStringTag];
    }
    if (key === OBJECT_ID) return objectId;
    if (key === IS_PROXY) return true;
    if (key === TRACE) return target.trace;
    if (key === STATE) return { handle: context };
    if (!cache[key]) {
      cache[key] = valueAt(target, key);
    }
    return cache[key];
  },
  set(target, key, val) {
    const { context, objectId, path } = target;
    target.cache = {};
    if (isSameDocument(val, context)) {
      throw new RangeError(
        "Cannot create a reference to an existing document object"
      );
    }
    if (key === TRACE) {
      target.trace = val;
      return true;
    }
    if (key === CLEAR_CACHE) {
      return true;
    }
    const [value, datatype] = import_value(val, [...path, key], context);
    switch (datatype) {
      case "list": {
        const list = context.putObject(objectId, key, []);
        const proxyList = listProxy(context, list, [...path, key]);
        for (let i = 0; i < value.length; i++) {
          proxyList[i] = value[i];
        }
        break;
      }
      case "text": {
        context.putObject(objectId, key, value);
        break;
      }
      case "map": {
        const map = context.putObject(objectId, key, {});
        const proxyMap = mapProxy(context, map, [...path, key]);
        for (const key2 in value) {
          proxyMap[key2] = value[key2];
        }
        break;
      }
      default:
        context.put(objectId, key, value, datatype);
    }
    return true;
  },
  deleteProperty(target, key) {
    const { context, objectId } = target;
    target.cache = {};
    context.delete(objectId, key);
    return true;
  },
  has(target, key) {
    const value = this.get(target, key);
    return value !== void 0;
  },
  getOwnPropertyDescriptor(target, key) {
    const value = this.get(target, key);
    if (typeof value !== "undefined") {
      return {
        configurable: true,
        enumerable: true,
        value
      };
    }
  },
  ownKeys(target) {
    const { context, objectId } = target;
    const keys = context.keys(objectId);
    return [...new Set(keys)];
  }
};
var ListHandler = {
  get(target, index) {
    const { context, objectId } = target;
    index = parseListIndex(index);
    if (index === Symbol.hasInstance) {
      return (instance) => {
        return Array.isArray(instance);
      };
    }
    if (index === Symbol.toStringTag) {
      return target[Symbol.toStringTag];
    }
    if (index === OBJECT_ID) return objectId;
    if (index === IS_PROXY) return true;
    if (index === TRACE) return target.trace;
    if (index === STATE) return { handle: context };
    if (index === "length") return context.length(objectId);
    if (typeof index === "number") {
      return valueAt(target, index);
    } else {
      return listMethods(target)[index];
    }
  },
  set(target, index, val) {
    const { context, objectId, path } = target;
    index = parseListIndex(index);
    if (isSameDocument(val, context)) {
      throw new RangeError(
        "Cannot create a reference to an existing document object"
      );
    }
    if (index === CLEAR_CACHE) {
      return true;
    }
    if (index === TRACE) {
      target.trace = val;
      return true;
    }
    if (typeof index == "string") {
      throw new RangeError("list index must be a number");
    }
    const [value, datatype] = import_value(val, [...path, index], context);
    switch (datatype) {
      case "list": {
        let list;
        if (index >= context.length(objectId)) {
          list = context.insertObject(objectId, index, []);
        } else {
          list = context.putObject(objectId, index, []);
        }
        const proxyList = listProxy(context, list, [...path, index]);
        proxyList.splice(0, 0, ...value);
        break;
      }
      case "text": {
        if (index >= context.length(objectId)) {
          context.insertObject(objectId, index, value);
        } else {
          context.putObject(objectId, index, value);
        }
        break;
      }
      case "map": {
        let map;
        if (index >= context.length(objectId)) {
          map = context.insertObject(objectId, index, {});
        } else {
          map = context.putObject(objectId, index, {});
        }
        const proxyMap = mapProxy(context, map, [...path, index]);
        for (const key in value) {
          proxyMap[key] = value[key];
        }
        break;
      }
      default:
        if (index >= context.length(objectId)) {
          context.insert(objectId, index, value, datatype);
        } else {
          context.put(objectId, index, value, datatype);
        }
    }
    return true;
  },
  deleteProperty(target, index) {
    const { context, objectId } = target;
    index = parseListIndex(index);
    const elem = context.get(objectId, index);
    if (elem != null && elem[0] == "counter") {
      throw new TypeError(
        "Unsupported operation: deleting a counter from a list"
      );
    }
    context.delete(objectId, index);
    return true;
  },
  has(target, index) {
    const { context, objectId } = target;
    index = parseListIndex(index);
    if (typeof index === "number") {
      return index < context.length(objectId);
    }
    return index === "length";
  },
  getOwnPropertyDescriptor(target, index) {
    const { context, objectId } = target;
    if (index === "length")
      return { writable: true, value: context.length(objectId) };
    if (index === OBJECT_ID)
      return { configurable: false, enumerable: false, value: objectId };
    index = parseListIndex(index);
    const value = valueAt(target, index);
    return { configurable: true, enumerable: true, value };
  },
  getPrototypeOf(target) {
    return Object.getPrototypeOf(target);
  },
  ownKeys() {
    const keys = [];
    keys.push("length");
    return keys;
  }
};
function mapProxy(context, objectId, path) {
  const target = {
    context,
    objectId,
    path: path || [],
    cache: {}
  };
  const proxied = {};
  Object.assign(proxied, target);
  const result = new Proxy(proxied, MapHandler);
  return result;
}
function listProxy(context, objectId, path) {
  const target = {
    context,
    objectId,
    path: path || [],
    cache: {}
  };
  const proxied = [];
  Object.assign(proxied, target);
  return new Proxy(proxied, ListHandler);
}
function rootProxy(context) {
  return mapProxy(context, "_root", []);
}
function listMethods(target) {
  const { context, objectId, path } = target;
  const methods = {
    at(index) {
      return valueAt(target, index);
    },
    deleteAt(index, numDelete) {
      if (typeof numDelete === "number") {
        context.splice(objectId, index, numDelete);
      } else {
        context.delete(objectId, index);
      }
      return this;
    },
    fill(val, start, end) {
      const [value, datatype] = import_value(val, [...path, start], context);
      const length = context.length(objectId);
      start = parseListIndex(start || 0);
      end = parseListIndex(end || length);
      for (let i = start; i < Math.min(end, length); i++) {
        if (datatype === "list" || datatype === "map") {
          context.putObject(objectId, i, value);
        } else if (datatype === "text") {
          context.putObject(objectId, i, value);
        } else {
          context.put(objectId, i, value, datatype);
        }
      }
      return this;
    },
    indexOf(searchElement, start = 0) {
      const length = context.length(objectId);
      for (let i = start; i < length; i++) {
        const valueWithType = context.getWithType(objectId, i);
        if (!valueWithType) {
          continue;
        }
        const [valType, value] = valueWithType;
        const isObject2 = ["map", "list", "text"].includes(valType);
        if (!isObject2) {
          if (value === searchElement) {
            return i;
          } else {
            continue;
          }
        }
        if (valType === "text" && typeof searchElement === "string") {
          if (searchElement === valueAt(target, i)) {
            return i;
          }
        }
        if (searchElement[OBJECT_ID] === value) {
          return i;
        }
      }
      return -1;
    },
    insertAt(index, ...values) {
      this.splice(index, 0, ...values);
      return this;
    },
    obliviousInsertAt(index, value) {
      if (typeof context.obliviousInsert === "function") {
        context.obliviousInsert(objectId, index, value);
      } else {
        throw new Error("obliviousInsertAt requires oblivious backend");
      }
      return this;
    },
    obliviousDeleteAt(index) {
      if (typeof context.obliviousDelete === "function") {
        context.obliviousDelete(objectId, index);
      } else {
        throw new Error("obliviousDeleteAt requires oblivious backend");
      }
      return this;
    },
    obliviousEdit(cursor, action, value) {
      if (typeof context.obliviousEdit === "function") {
        context.obliviousEdit(objectId, cursor, action, value);
      } else {
        throw new Error("obliviousEdit requires oblivious backend");
      }
      return this;
    },
    pop() {
      const length = context.length(objectId);
      if (length == 0) {
        return void 0;
      }
      const last = valueAt(target, length - 1);
      context.delete(objectId, length - 1);
      return last;
    },
    push(...values) {
      const len = context.length(objectId);
      this.splice(len, 0, ...values);
      return context.length(objectId);
    },
    shift() {
      if (context.length(objectId) == 0) return;
      const first = valueAt(target, 0);
      context.delete(objectId, 0);
      return first;
    },
    splice(index, del, ...vals) {
      index = parseListIndex(index);
      if (typeof del !== "number") {
        del = context.length(objectId) - index;
      }
      del = parseListIndex(del);
      for (const val of vals) {
        if (isSameDocument(val, context)) {
          throw new RangeError(
            "Cannot create a reference to an existing document object"
          );
        }
      }
      const result = [];
      for (let i = 0; i < del; i++) {
        const value = valueAt(target, index);
        if (value !== void 0) {
          result.push(value);
        }
        context.delete(objectId, index);
      }
      const values = vals.map((val, index2) => {
        try {
          return import_value(val, [...path], context);
        } catch (e) {
          if (e instanceof RangeError) {
            throw new RangeError(
              `${e.message} (at index ${index2} in the input)`
            );
          } else {
            throw e;
          }
        }
      });
      for (const [value, datatype] of values) {
        switch (datatype) {
          case "list": {
            const list = context.insertObject(objectId, index, []);
            const proxyList = listProxy(context, list, [...path, index]);
            proxyList.splice(0, 0, ...value);
            break;
          }
          case "text": {
            context.insertObject(objectId, index, value);
            break;
          }
          case "map": {
            const map = context.insertObject(objectId, index, {});
            const proxyMap = mapProxy(context, map, [...path, index]);
            for (const key in value) {
              proxyMap[key] = value[key];
            }
            break;
          }
          default:
            context.insert(objectId, index, value, datatype);
        }
        index += 1;
      }
      return result;
    },
    unshift(...values) {
      this.splice(0, 0, ...values);
      return context.length(objectId);
    },
    entries() {
      let i = 0;
      const iterator = {
        next: () => {
          const value = valueAt(target, i);
          if (value === void 0) {
            return { value: void 0, done: true };
          } else {
            return { value: [i++, value], done: false };
          }
        },
        [Symbol.iterator]() {
          return this;
        }
      };
      return iterator;
    },
    keys() {
      let i = 0;
      const len = context.length(objectId);
      const iterator = {
        next: () => {
          if (i < len) {
            return { value: i++, done: false };
          }
          return { value: void 0, done: true };
        },
        [Symbol.iterator]() {
          return this;
        }
      };
      return iterator;
    },
    values() {
      let i = 0;
      const iterator = {
        next: () => {
          const value = valueAt(target, i++);
          if (value === void 0) {
            return { value: void 0, done: true };
          } else {
            return { value, done: false };
          }
        },
        [Symbol.iterator]() {
          return this;
        }
      };
      return iterator;
    },
    toArray() {
      const list = [];
      let value;
      do {
        value = valueAt(target, list.length);
        if (value !== void 0) {
          list.push(value);
        }
      } while (value !== void 0);
      return list;
    },
    map(f) {
      return this.toArray().map(f);
    },
    toString() {
      return this.toArray().toString();
    },
    toLocaleString() {
      return this.toArray().toLocaleString();
    },
    forEach(f) {
      return this.toArray().forEach(f);
    },
    // todo: real concat function is different
    concat(other) {
      return this.toArray().concat(other);
    },
    every(f) {
      return this.toArray().every(f);
    },
    filter(f) {
      return this.toArray().filter(f);
    },
    find(f) {
      let index = 0;
      for (const v of this) {
        if (f(v, index)) {
          return v;
        }
        index += 1;
      }
    },
    findIndex(f) {
      let index = 0;
      for (const v of this) {
        if (f(v, index)) {
          return index;
        }
        index += 1;
      }
      return -1;
    },
    includes(elem) {
      return this.find((e) => e === elem) !== void 0;
    },
    join(sep) {
      return this.toArray().join(sep);
    },
    reduce(f, initialValue) {
      return this.toArray().reduce(f, initialValue);
    },
    reduceRight(f, initialValue) {
      return this.toArray().reduceRight(f, initialValue);
    },
    lastIndexOf(search, fromIndex = Infinity) {
      return this.toArray().lastIndexOf(search, fromIndex);
    },
    slice(index, num) {
      return this.toArray().slice(index, num);
    },
    some(f) {
      let index = 0;
      for (const v of this) {
        if (f(v, index)) {
          return true;
        }
        index += 1;
      }
      return false;
    },
    [Symbol.iterator]: function* () {
      let i = 0;
      let value = valueAt(target, i);
      while (value !== void 0) {
        yield value;
        i += 1;
        value = valueAt(target, i);
      }
    }
  };
  return methods;
}
function printPath(path) {
  const jsonPointerComponents = path.map((component) => {
    if (typeof component === "number") {
      return component.toString();
    } else if (typeof component === "string") {
      return component.replace(/~/g, "~0").replace(/\//g, "~1");
    }
  });
  if (path.length === 0) {
    return "";
  } else {
    return "/" + jsonPointerComponents.join("/");
  }
}
function isImmutableString(obj) {
  return typeof obj === "object" && obj !== null && Object.prototype.hasOwnProperty.call(obj, IMMUTABLE_STRING);
}
function isCounter(obj) {
  return typeof obj === "object" && obj !== null && Object.prototype.hasOwnProperty.call(obj, COUNTER);
}

// src/numbers.ts
var Int = class {
  constructor(value) {
    if (!(Number.isInteger(value) && value <= Number.MAX_SAFE_INTEGER && value >= Number.MIN_SAFE_INTEGER)) {
      throw new RangeError(`Value ${value} cannot be a uint`);
    }
    this.value = value;
    Reflect.defineProperty(this, INT, { value: true });
    Object.freeze(this);
  }
};
var Uint = class {
  constructor(value) {
    if (!(Number.isInteger(value) && value <= Number.MAX_SAFE_INTEGER && value >= 0)) {
      throw new RangeError(`Value ${value} cannot be a uint`);
    }
    this.value = value;
    Reflect.defineProperty(this, UINT, { value: true });
    Object.freeze(this);
  }
};
var Float64 = class {
  constructor(value) {
    if (typeof value !== "number") {
      throw new RangeError(`Value ${value} cannot be a float64`);
    }
    this.value = value || 0;
    Reflect.defineProperty(this, F64, { value: true });
    Object.freeze(this);
  }
};

// src/generated/release-info.js
var JS_GIT_HEAD = "oblivious";

// src/internal_state.ts
function _state(doc, checkroot = true) {
  if (typeof doc !== "object") {
    throw new RangeError("must be the document root");
  }
  const state = Reflect.get(doc, STATE);
  if (state === void 0 || state == null || checkroot && _obj(doc) !== "_root") {
    throw new RangeError("must be the document root");
  }
  return state;
}
function _clear_cache(doc) {
  Reflect.set(doc, CLEAR_CACHE, true);
}
function _trace(doc) {
  return Reflect.get(doc, TRACE);
}
function _obj(doc) {
  if (!(typeof doc === "object") || doc === null) {
    return null;
  }
  return Reflect.get(doc, OBJECT_ID);
}
function _is_proxy(doc) {
  return !!Reflect.get(doc, IS_PROXY);
}

// src/apply_patches.ts
function applyPatch(doc, patch) {
  let path = resolvePath(doc, patch.path);
  if (patch.action === "put") {
    applyPutPatch(doc, path, patch);
  } else if (patch.action === "insert") {
    applyInsertPatch(doc, path, patch);
  } else if (patch.action === "del") {
    applyDelPatch(doc, path, patch);
  } else if (patch.action === "splice") {
    applySplicePatch(doc, path, patch);
  } else if (patch.action === "inc") {
    applyIncPatch(doc, path, patch);
  } else if (patch.action === "mark") {
    applyMarkPatch(doc, path, patch);
  } else if (patch.action === "unmark") {
    applyUnmarkPatch(doc, path, patch);
  } else if (patch.action === "conflict") {
  } else {
    throw new RangeError(`unsupported patch: ${patch}`);
  }
}
function applyPutPatch(doc, path, patch) {
  let { obj: parent, prop } = pathElemAt(path, -1);
  parent[prop] = patch.value;
}
function applyInsertPatch(doc, path, patch) {
  let { obj: parent, prop } = pathElemAt(path, -1);
  if (!Array.isArray(parent)) {
    throw new RangeError(`target is not an array for patch`);
  }
  if (!(typeof prop === "number")) {
    throw new RangeError(`index is not a number for patch`);
  }
  parent.splice(prop, 0, ...patch.values);
}
function applyDelPatch(doc, path, patch) {
  let { obj: parent, prop, parentPath } = pathElemAt(path, -1);
  if (!(typeof prop === "number")) {
    throw new RangeError(`index is not a number for patch`);
  }
  if (Array.isArray(parent)) {
    parent.splice(prop, patch.length || 1);
  } else if (typeof parent === "string") {
    if (isAutomerge(doc)) {
      splice(doc, parentPath, prop, patch.length || 1);
    } else {
      let { obj: grandParent, prop: grandParentProp } = pathElemAt(path, -2);
      if (typeof prop !== "number") {
        throw new RangeError(`index is not a number for patch`);
      }
      let target = grandParent[grandParentProp];
      if (target == null || typeof target !== "string") {
        throw new RangeError(`target is not a string for patch`);
      }
      let newString = target.slice(0, prop) + target.slice(prop + (patch.length || 1));
      grandParent[grandParentProp] = newString;
    }
  } else {
    throw new RangeError(`target is not an array or string for patch`);
  }
}
function applySplicePatch(doc, path, patch) {
  if (isAutomerge(doc)) {
    let { obj: parent, prop, parentPath } = pathElemAt(path, -1);
    if (!(typeof prop === "number")) {
      throw new RangeError(`index is not a number for patch`);
    }
    splice(doc, parentPath, prop, 0, patch.value);
  } else {
    let { obj: parent, prop } = pathElemAt(path, -1);
    let { obj: grandParent, prop: grandParentProp } = pathElemAt(path, -2);
    if (typeof prop !== "number") {
      throw new RangeError(`index is not a number for patch`);
    }
    let target = grandParent[grandParentProp];
    if (target == null || typeof target !== "string") {
      throw new RangeError(`target is not a string for patch`);
    }
    let newString = target.slice(0, prop) + patch.value + target.slice(prop);
    grandParent[grandParentProp] = newString;
  }
}
function applyIncPatch(doc, path, patch) {
  let { obj: parent, prop } = pathElemAt(path, -1);
  const counter = parent[prop];
  if (isAutomerge(doc)) {
    if (!isCounter(counter)) {
      throw new RangeError(`target is not a counter for patch`);
    }
    counter.increment(patch.value);
  } else {
    if (!(typeof counter === "number")) {
      throw new RangeError(`target is not a number for patch`);
    }
    parent[prop] = counter + patch.value;
  }
}
function applyMarkPatch(doc, path, patch) {
  let { obj: parent, prop } = pathElemAt(path, -1);
  if (!isAutomerge(doc)) {
    return;
  }
  for (const markSpec of patch.marks) {
    mark(
      doc,
      patch.path,
      // TODO: add mark expansion to patches. This will require emitting
      // the expand values in patches.
      { start: markSpec.start, end: markSpec.end, expand: "none" },
      markSpec.name,
      markSpec.value
    );
  }
}
function applyUnmarkPatch(doc, path, patch) {
  if (!isAutomerge(doc)) {
    return;
  }
  unmark(
    doc,
    patch.path,
    { start: patch.start, end: patch.end, expand: "none" },
    patch.name
  );
}
function applyPatches(doc, patches) {
  for (const patch of patches) {
    applyPatch(doc, patch);
  }
}
function resolvePath(doc, path) {
  const result = [];
  let current = doc;
  let currentPath = [];
  for (const [index, prop] of path.entries()) {
    result.push({ obj: current, prop, parentPath: currentPath.slice() });
    currentPath.push(prop);
    if (index !== path.length - 1) {
      if (current == null || typeof current != "object") {
        throw new Error(`Invalid path: ${path}`);
      }
      current = current[prop];
    } else {
      break;
    }
  }
  return result;
}
function pathElemAt(resolved, index) {
  let result = resolved.at(index);
  if (result == void 0) {
    throw new Error("invalid path");
  }
  return result;
}

// src/conflicts.ts
function conflictAt(context, objectId, prop, withinChangeCallback) {
  const values = context.getAll(objectId, prop);
  if (values.length <= 1) {
    return;
  }
  const result = {};
  for (const fullVal of values) {
    switch (fullVal[0]) {
      case "map":
        if (withinChangeCallback) {
          result[fullVal[1]] = mapProxy(context, fullVal[1], [prop]);
        } else {
          result[fullVal[1]] = reifyFullValue(context, [fullVal[0], fullVal[1]]);
        }
        break;
      case "list":
        if (withinChangeCallback) {
          result[fullVal[1]] = listProxy(context, fullVal[1], [prop]);
        } else {
          result[fullVal[1]] = reifyFullValue(context, [fullVal[0], fullVal[1]]);
        }
        break;
      case "text":
        result[fullVal[1]] = context.text(fullVal[1]);
        break;
      case "str":
      case "uint":
      case "int":
      case "f64":
      case "boolean":
      case "bytes":
      case "null":
        result[fullVal[2]] = fullVal[1];
        break;
      case "counter":
        result[fullVal[2]] = new Counter(fullVal[1]);
        break;
      case "timestamp":
        result[fullVal[2]] = new Date(fullVal[1]);
        break;
      default:
        throw RangeError(`datatype ${fullVal[0]} unimplemented`);
    }
  }
  return result;
}
function reifyFullValue(context, fullValue) {
  switch (fullValue[0]) {
    case "map":
      const mapResult = {};
      for (const key of context.keys(fullValue[1])) {
        let subVal = context.getWithType(fullValue[1], key);
        if (!subVal) {
          throw new Error("unexpected null map value");
        }
        mapResult[key] = reifyFullValue(context, subVal);
      }
      return Object.freeze(mapResult);
    case "list":
      const listResult = [];
      const length = context.length(fullValue[1]);
      for (let i = 0; i < length; i++) {
        let subVal = context.getWithType(fullValue[1], i);
        if (!subVal) {
          throw new Error("unexpected null list element");
        }
        listResult.push(reifyFullValue(context, subVal));
      }
      return Object.freeze(listResult);
    case "text":
      return context.text(fullValue[1]);
    case "str":
    case "uint":
    case "int":
    case "f64":
    case "boolean":
    case "bytes":
    case "null":
      return fullValue[1];
    case "counter":
      return new Counter(fullValue[1]);
    case "timestamp":
      return new Date(fullValue[1]);
    default:
      throw RangeError(`datatype ${fullValue[0]} unimplemented`);
  }
}

// src/implementation.ts
function insertAt(list, index, ...values) {
  if (!_is_proxy(list)) {
    throw new RangeError("object cannot be modified outside of a change block");
  }
  ;
  list.insertAt(index, ...values);
}
function deleteAt(list, index, numDelete) {
  if (!_is_proxy(list)) {
    throw new RangeError("object cannot be modified outside of a change block");
  }
  ;
  list.deleteAt(index, numDelete);
}
function use(api) {
  UseApi(api);
}
function getBackend(doc) {
  return _state(doc).handle;
}
function importOpts(_actor) {
  if (typeof _actor === "object") {
    return _actor;
  } else {
    return { actor: _actor };
  }
}
function getChangesSince(state, heads) {
  const n = _state(state);
  return n.handle.getChanges(heads);
}
function getChangesMetaSince(state, heads) {
  const n = _state(state);
  return n.handle.getChangesMeta(heads);
}
function cursorToIndex(state, value, index) {
  if (typeof index == "string") {
    if (/^-?[0-9]+@[0-9a-zA-Z]+$|^[se]$/.test(index)) {
      return state.handle.getCursorPosition(value, index);
    } else {
      throw new RangeError("index must be a number or cursor");
    }
  } else {
    return index;
  }
}
function init(_opts) {
  const opts = importOpts(_opts);
  const freeze = !!opts.freeze;
  const patchCallback = opts.patchCallback;
  const actor = opts.actor;
  const handle = ApiHandler.create({ actor });
  handle.enableFreeze(!!opts.freeze);
  registerDatatypes(handle);
  const doc = handle.materialize("/", void 0, {
    handle,
    heads: void 0,
    freeze,
    patchCallback
  });
  return doc;
}
function view(doc, heads) {
  const state = _state(doc);
  const handle = state.handle;
  return state.handle.materialize("/", heads, {
    ...state,
    handle,
    heads
  });
}
function clone(doc, _opts) {
  const state = _state(doc);
  const heads = state.heads;
  const opts = importOpts(_opts);
  const handle = state.handle.fork(opts.actor, heads);
  handle.updateDiffCursor();
  const { heads: _oldHeads, ...stateSansHeads } = state;
  stateSansHeads.patchCallback = opts.patchCallback;
  return handle.applyPatches(doc, { ...stateSansHeads, handle });
}
function free(doc) {
  return _state(doc).handle.free();
}
function from(initialState, _opts) {
  return _change(init(_opts), "from", {}, (d) => Object.assign(d, initialState)).newDoc;
}
function change(doc, options, callback) {
  if (typeof options === "function") {
    return _change(doc, "change", {}, options).newDoc;
  } else if (typeof callback === "function") {
    if (typeof options === "string") {
      options = { message: options };
    }
    return _change(doc, "change", options, callback).newDoc;
  } else {
    throw RangeError("Invalid args for change");
  }
}
function changeAt(doc, scope, options, callback) {
  if (typeof options === "function") {
    return _change(doc, "changeAt", {}, options, scope);
  } else if (typeof callback === "function") {
    if (typeof options === "string") {
      options = { message: options };
    }
    return _change(doc, "changeAt", options, callback, scope);
  } else {
    throw RangeError("Invalid args for changeAt");
  }
}
function progressDocument(doc, source, heads, callback) {
  if (heads == null) {
    return doc;
  }
  const state = _state(doc);
  const nextState = { ...state, heads: void 0 };
  const { value: nextDoc, patches } = state.handle.applyAndReturnPatches(
    doc,
    nextState
  );
  if (patches.length > 0) {
    if (callback != null) {
      callback(patches, { before: doc, after: nextDoc, source });
    }
    const newState = _state(nextDoc);
    newState.mostRecentPatch = {
      before: _state(doc).heads,
      after: newState.handle.getHeads(),
      patches
    };
  }
  state.heads = heads;
  return nextDoc;
}
function _change(doc, source, options, callback, scope) {
  if (typeof callback !== "function") {
    throw new RangeError("invalid change function");
  }
  const state = _state(doc);
  if (doc === void 0 || state === void 0) {
    throw new RangeError("must be the document root");
  }
  if (state.heads) {
    throw new RangeError(
      "Attempting to change an outdated document.  Use Automerge.clone() if you wish to make a writable copy."
    );
  }
  if (_is_proxy(doc)) {
    throw new RangeError("Calls to Automerge.change cannot be nested");
  }
  let heads = state.handle.getHeads();
  if (scope && headsEqual2(scope, heads)) {
    scope = void 0;
  }
  if (scope) {
    state.handle.isolate(scope);
    heads = scope;
  }
  if (!("time" in options)) {
    options.time = Math.floor(Date.now() / 1e3);
  }
  try {
    state.heads = heads;
    const root = rootProxy(state.handle);
    callback(root);
    if (state.handle.pendingOps() === 0) {
      state.heads = void 0;
      if (scope) {
        state.handle.integrate();
      }
      return {
        newDoc: doc,
        newHeads: null
      };
    } else {
      const newHead = state.handle.commit(options.message, options.time);
      state.handle.integrate();
      return {
        newDoc: progressDocument(
          doc,
          source,
          heads,
          options.patchCallback || state.patchCallback
        ),
        newHeads: newHead != null ? [newHead] : null
      };
    }
  } catch (e) {
    state.heads = void 0;
    state.handle.rollback();
    throw e;
  }
}
function emptyChange(doc, options) {
  if (options === void 0) {
    options = {};
  }
  if (typeof options === "string") {
    options = { message: options };
  }
  if (!("time" in options)) {
    options.time = Math.floor(Date.now() / 1e3);
  }
  const state = _state(doc);
  if (state.heads) {
    throw new RangeError(
      "Attempting to change an outdated document.  Use Automerge.clone() if you wish to make a writable copy."
    );
  }
  if (_is_proxy(doc)) {
    throw new RangeError("Calls to Automerge.change cannot be nested");
  }
  const heads = state.handle.getHeads();
  state.handle.emptyChange(options.message, options.time);
  return progressDocument(doc, "emptyChange", heads);
}
function load(data, _opts) {
  const opts = importOpts(_opts);
  if (opts.patchCallback) {
    return loadIncremental(init(opts), data);
  }
  const actor = opts.actor;
  const patchCallback = opts.patchCallback;
  const unchecked = opts.unchecked || false;
  const allowMissingDeps = opts.allowMissingChanges || false;
  const convertImmutableStringsToText = opts.convertImmutableStringsToText || false;
  const handle = ApiHandler.load(data, {
    actor,
    unchecked,
    allowMissingDeps,
    convertImmutableStringsToText
  });
  handle.enableFreeze(!!opts.freeze);
  registerDatatypes(handle);
  const doc = handle.materialize("/", void 0, {
    handle,
    heads: void 0,
    patchCallback
  });
  return doc;
}
function loadIncremental(doc, data, opts) {
  if (!opts) {
    opts = {};
  }
  const state = _state(doc);
  if (state.heads) {
    throw new RangeError(
      "Attempting to change an out of date document - set at: " + _trace(doc)
    );
  }
  if (_is_proxy(doc)) {
    throw new RangeError("Calls to Automerge.change cannot be nested");
  }
  const heads = state.handle.getHeads();
  state.handle.loadIncremental(data);
  return progressDocument(
    doc,
    "loadIncremental",
    heads,
    opts.patchCallback || state.patchCallback
  );
}
function saveIncremental(doc) {
  const state = _state(doc);
  if (state.heads) {
    throw new RangeError(
      "Attempting to change an out of date document - set at: " + _trace(doc)
    );
  }
  if (_is_proxy(doc)) {
    throw new RangeError("Calls to Automerge.change cannot be nested");
  }
  return state.handle.saveIncremental();
}
function save(doc) {
  return _state(doc).handle.save();
}
function merge(local, remote) {
  const localState = _state(local);
  if (localState.heads) {
    throw new RangeError(
      "Attempting to change an out of date document - set at: " + _trace(local)
    );
  }
  const heads = localState.handle.getHeads();
  const remoteState = _state(remote);
  const changes = localState.handle.getChangesAdded(remoteState.handle);
  localState.handle.applyChanges(changes);
  return progressDocument(local, "merge", heads, localState.patchCallback);
}
function getActorId(doc) {
  const state = _state(doc);
  return state.handle.getActorId();
}
function getConflicts(doc, prop) {
  const state = _state(doc, false);
  const objectId = _obj(doc);
  if (objectId != null) {
    const withinChangeCallback = _is_proxy(doc);
    return conflictAt(state.handle, objectId, prop, withinChangeCallback);
  } else {
    return void 0;
  }
}
function getLastLocalChange(doc) {
  const state = _state(doc);
  return state.handle.getLastLocalChange() || void 0;
}
function getObjectId(doc, prop) {
  if (prop) {
    const state = _state(doc, false);
    const objectId = _obj(doc);
    if (!state || !objectId) {
      return null;
    }
    return state.handle.get(objectId, prop);
  } else {
    return _obj(doc);
  }
}
function getChanges(oldState, newState) {
  const n = _state(newState);
  return n.handle.getChanges(getHeads(oldState));
}
function getAllChanges(doc) {
  const state = _state(doc);
  return state.handle.getChanges([]);
}
function applyChanges(doc, changes, opts) {
  const state = _state(doc);
  if (!opts) {
    opts = {};
  }
  if (state.heads) {
    throw new RangeError(
      "Attempting to change an outdated document.  Use Automerge.clone() if you wish to make a writable copy."
    );
  }
  if (_is_proxy(doc)) {
    throw new RangeError("Calls to Automerge.change cannot be nested");
  }
  const heads = state.handle.getHeads();
  state.handle.applyChanges(changes);
  state.heads = heads;
  return [
    progressDocument(
      doc,
      "applyChanges",
      heads,
      opts.patchCallback || state.patchCallback
    )
  ];
}
function getHistory(doc) {
  const history = getAllChanges(doc);
  return history.map((change2, index) => ({
    get change() {
      return decodeChange(change2);
    },
    get snapshot() {
      const [state] = applyChanges(init(), history.slice(0, index + 1));
      return state;
    }
  }));
}
function diff(doc, before, after) {
  checkHeads(before, "before heads");
  checkHeads(after, "after heads");
  const state = _state(doc);
  if (state.mostRecentPatch && equals(state.mostRecentPatch.before, before) && equals(state.mostRecentPatch.after, after)) {
    return state.mostRecentPatch.patches;
  }
  return state.handle.diff(before, after);
}
function diffPath(doc, path, before, after, opts) {
  checkHeads(before, "before");
  checkHeads(after, "after");
  const state = _state(doc);
  const objPath = absoluteObjPath(doc, path, "diff");
  return state.handle.diffPath(objPath, before, after, opts);
}
function headsEqual2(heads1, heads2) {
  if (heads1.length !== heads2.length) {
    return false;
  }
  for (let i = 0; i < heads1.length; i++) {
    if (heads1[i] !== heads2[i]) {
      return false;
    }
  }
  return true;
}
function checkHeads(heads, fieldname) {
  if (!Array.isArray(heads)) {
    throw new Error(`invalid ${fieldname}: must be an array`);
  }
}
function equals(val1, val2) {
  if (!isObject(val1) || !isObject(val2)) return val1 === val2;
  const keys1 = Object.keys(val1).sort(), keys2 = Object.keys(val2).sort();
  if (keys1.length !== keys2.length) return false;
  for (let i = 0; i < keys1.length; i++) {
    if (keys1[i] !== keys2[i]) return false;
    if (!equals(val1[keys1[i]], val2[keys2[i]])) return false;
  }
  return true;
}
function encodeSyncState(state) {
  const sync = ApiHandler.importSyncState(state);
  const result = ApiHandler.encodeSyncState(sync);
  sync.free();
  return result;
}
function decodeSyncState(state) {
  const sync = ApiHandler.decodeSyncState(state);
  const result = ApiHandler.exportSyncState(sync);
  sync.free();
  return result;
}
function generateSyncMessage(doc, inState) {
  const state = _state(doc);
  const syncState = ApiHandler.importSyncState(inState);
  const message = state.handle.generateSyncMessage(syncState);
  const outState = ApiHandler.exportSyncState(syncState);
  return [outState, message];
}
function receiveSyncMessage(doc, inState, message, opts) {
  const syncState = ApiHandler.importSyncState(inState);
  if (!opts) {
    opts = {};
  }
  const state = _state(doc);
  if (state.heads) {
    throw new RangeError(
      "Attempting to change an outdated document.  Use Automerge.clone() if you wish to make a writable copy."
    );
  }
  if (_is_proxy(doc)) {
    throw new RangeError("Calls to Automerge.change cannot be nested");
  }
  const heads = state.handle.getHeads();
  state.handle.receiveSyncMessage(syncState, message);
  const outSyncState = ApiHandler.exportSyncState(syncState);
  return [
    progressDocument(
      doc,
      "receiveSyncMessage",
      heads,
      opts.patchCallback || state.patchCallback
    ),
    outSyncState,
    null
  ];
}
function hasOurChanges(doc, remoteState) {
  const state = _state(doc);
  const syncState = ApiHandler.importSyncState(remoteState);
  return state.handle.hasOurChanges(syncState);
}
function initSyncState() {
  return ApiHandler.exportSyncState(ApiHandler.initSyncState());
}
function encodeChange(change2) {
  return ApiHandler.encodeChange(change2);
}
function decodeChange(data) {
  return ApiHandler.decodeChange(data);
}
function encodeSyncMessage2(message) {
  return ApiHandler.encodeSyncMessage(message);
}
function decodeSyncMessage2(message) {
  return ApiHandler.decodeSyncMessage(message);
}
function getMissingDeps(doc, heads) {
  const state = _state(doc);
  return state.handle.getMissingDeps(heads);
}
function getHeads(doc) {
  const state = _state(doc);
  return state.heads || state.handle.getHeads();
}
function dump(doc) {
  const state = _state(doc);
  state.handle.dump();
}
function toJS(doc) {
  const state = _state(doc);
  const enabled = state.handle.enableFreeze(false);
  const result = state.handle.materialize("/", state.heads);
  state.handle.enableFreeze(enabled);
  return result;
}
function isAutomerge(doc) {
  if (typeof doc == "object" && doc !== null) {
    return getObjectId(doc) === "_root" && !!Reflect.get(doc, STATE);
  } else {
    return false;
  }
}
function isObject(obj) {
  return typeof obj === "object" && obj !== null;
}
function saveSince(doc, heads) {
  const state = _state(doc);
  const result = state.handle.saveSince(heads);
  return result;
}
function hasHeads(doc, heads) {
  const state = _state(doc);
  for (const hash of heads) {
    if (!state.handle.getChangeByHash(hash)) {
      return false;
    }
  }
  return true;
}
function registerDatatypes(handle) {
  handle.registerDatatype(
    "counter",
    (n) => new Counter(n),
    (n) => {
      if (n instanceof Counter) {
        return n.value;
      }
    }
  );
  handle.registerDatatype(
    "str",
    (n) => {
      return new ImmutableString(n);
    },
    (s) => {
      if (isImmutableString(s)) {
        return s.val;
      }
    }
  );
}
function topoHistoryTraversal(doc) {
  const state = _state(doc);
  return state.handle.topoHistoryTraversal();
}
function inspectChange(doc, changeHash) {
  const state = _state(doc);
  return state.handle.getDecodedChangeByHash(changeHash);
}
function stats(doc) {
  const state = _state(doc);
  const wasmStats = state.handle.stats();
  const release = releaseInfo();
  return {
    ...wasmStats,
    cargoPackageName: release.wasm?.cargoPackageName ?? "unknown",
    cargoPackageVersion: release.wasm?.cargoPackageVersion ?? "unknown",
    rustcVersion: release.wasm?.rustcVersion ?? "unknown"
  };
}
function releaseInfo() {
  let wasm = null;
  try {
    wasm = ApiHandler.wasmReleaseInfo();
  } catch {
  }
  return {
    js: {
      gitHead: JS_GIT_HEAD
    },
    wasm
  };
}
function splice(doc, path, index, del, newText) {
  const objPath = absoluteObjPath(doc, path, "splice");
  if (!_is_proxy(doc)) {
    throw new RangeError("object cannot be modified outside of a change block");
  }
  const state = _state(doc, false);
  _clear_cache(doc);
  index = cursorToIndex(state, objPath, index);
  try {
    return state.handle.splice(objPath, index, del, newText);
  } catch (e) {
    throw new RangeError(`Cannot splice: ${e}`);
  }
}
function updateText(doc, path, newText) {
  const objPath = absoluteObjPath(doc, path, "updateText");
  if (!_is_proxy(doc)) {
    throw new RangeError("object cannot be modified outside of a change block");
  }
  const state = _state(doc, false);
  _clear_cache(doc);
  try {
    return state.handle.updateText(objPath, newText);
  } catch (e) {
    throw new RangeError(`Cannot updateText: ${e}`);
  }
}
function spans(doc, path) {
  const state = _state(doc, false);
  const objPath = absoluteObjPath(doc, path, "spans");
  try {
    return state.handle.spans(objPath, state.heads);
  } catch (e) {
    throw new RangeError(`Cannot splice: ${e}`);
  }
}
function block(doc, path, index) {
  const objPath = absoluteObjPath(doc, path, "splitBlock");
  const state = _state(doc, false);
  index = cursorToIndex(state, objPath, index);
  try {
    return state.handle.getBlock(objPath, index);
  } catch (e) {
    throw new RangeError(`Cannot get block: ${e}`);
  }
}
function splitBlock(doc, path, index, block2) {
  if (!_is_proxy(doc)) {
    throw new RangeError("object cannot be modified outside of a change block");
  }
  const objPath = absoluteObjPath(doc, path, "splitBlock");
  const state = _state(doc, false);
  _clear_cache(doc);
  index = cursorToIndex(state, objPath, index);
  try {
    state.handle.splitBlock(objPath, index, block2);
  } catch (e) {
    throw new RangeError(`Cannot splice: ${e}`);
  }
}
function joinBlock(doc, path, index) {
  if (!_is_proxy(doc)) {
    throw new RangeError("object cannot be modified outside of a change block");
  }
  const objPath = absoluteObjPath(doc, path, "joinBlock");
  const state = _state(doc, false);
  _clear_cache(doc);
  index = cursorToIndex(state, objPath, index);
  try {
    state.handle.joinBlock(objPath, index);
  } catch (e) {
    throw new RangeError(`Cannot joinBlock: ${e}`);
  }
}
function updateBlock(doc, path, index, block2) {
  if (!_is_proxy(doc)) {
    throw new RangeError("object cannot be modified outside of a change block");
  }
  const objPath = absoluteObjPath(doc, path, "updateBlock");
  const state = _state(doc, false);
  _clear_cache(doc);
  index = cursorToIndex(state, objPath, index);
  try {
    state.handle.updateBlock(objPath, index, block2);
  } catch (e) {
    throw new RangeError(`Cannot updateBlock: ${e}`);
  }
}
function updateSpans(doc, path, newSpans, config) {
  if (!_is_proxy(doc)) {
    throw new RangeError("object cannot be modified outside of a change block");
  }
  const objPath = absoluteObjPath(doc, path, "updateSpans");
  const state = _state(doc, false);
  _clear_cache(doc);
  try {
    state.handle.updateSpans(objPath, newSpans, config);
  } catch (e) {
    throw new RangeError(`Cannot updateSpans: ${e}`);
  }
}
function getCursor(doc, path, position, move) {
  const objPath = absoluteObjPath(doc, path, "getCursor");
  const state = _state(doc, false);
  try {
    return state.handle.getCursor(objPath, position, state.heads, move);
  } catch (e) {
    throw new RangeError(`Cannot getCursor: ${e}`);
  }
}
function getCursorPosition(doc, path, cursor) {
  const objPath = absoluteObjPath(doc, path, "getCursorPosition");
  const state = _state(doc, false);
  try {
    return state.handle.getCursorPosition(objPath, cursor, state.heads);
  } catch (e) {
    throw new RangeError(`Cannot getCursorPosition: ${e}`);
  }
}
function mark(doc, path, range, name, value) {
  const objPath = absoluteObjPath(doc, path, "mark");
  if (!_is_proxy(doc)) {
    throw new RangeError("object cannot be modified outside of a change block");
  }
  const state = _state(doc, false);
  try {
    return state.handle.mark(objPath, range, name, value);
  } catch (e) {
    throw new RangeError(`Cannot mark: ${e}`);
  }
}
function unmark(doc, path, range, name) {
  const objPath = absoluteObjPath(doc, path, "unmark");
  if (!_is_proxy(doc)) {
    throw new RangeError("object cannot be modified outside of a change block");
  }
  const state = _state(doc, false);
  try {
    return state.handle.unmark(objPath, range, name);
  } catch (e) {
    throw new RangeError(`Cannot unmark: ${e}`);
  }
}
function marks(doc, path) {
  const objPath = absoluteObjPath(doc, path, "marks");
  const state = _state(doc, false);
  try {
    return state.handle.marks(objPath);
  } catch (e) {
    throw new RangeError(`Cannot call marks(): ${e}`);
  }
}
function marksAt(doc, path, index) {
  const objPath = absoluteObjPath(doc, path, "marksAt");
  const state = _state(doc, false);
  try {
    return state.handle.marksAt(objPath, index);
  } catch (e) {
    throw new RangeError(`Cannot call marksAt(): ${e}`);
  }
}
function absoluteObjPath(doc, path, functionName) {
  path = path.slice();
  const objectId = _obj(doc);
  if (!objectId) {
    throw new RangeError(`invalid object for ${functionName}`);
  }
  path.unshift(objectId);
  return path.join("/");
}
var isRawString = isImmutableString;
var RawString = ImmutableString;
function saveBundle(doc, hashes) {
  const state = _state(doc, false);
  return state.handle.saveBundle(hashes);
}
function readBundle(bundle) {
  return ApiHandler.readBundle(bundle);
}

// src/oblivious_utils.ts
var oc;
function initBrowserBackend(obliviousNamespace) {
  oc = obliviousNamespace;
}
function makeSelectable(arr) {
  if (arr && typeof arr === "object" && !arr.oblivSelect) {
    arr.oblivSelect = function(cond, other) {
      return oc.cmovArray(cond, this, other);
    };
  }
  return arr;
}

// src/oblivious_render.ts
function renderObliviousText(chars, element, oc2) {
  if (chars.length === 0) {
    element.value = "";
    return;
  }
  let combined = chars[0];
  for (let i = 1; i < chars.length; i++) {
    combined = oc2.concatArrays(combined, chars[i]);
  }
  element.value = combined.toBase64();
}

// src/entrypoints/oblivious_browser.ts
UseApi(ObliviousApi);
export {
  Counter,
  Float64,
  ImmutableString,
  Int,
  RawString,
  Uint,
  applyChanges,
  applyPatch,
  applyPatches,
  block,
  change,
  changeAt,
  clone,
  decodeChange,
  decodeSyncMessage2 as decodeSyncMessage,
  decodeSyncMessage as decodeSyncMessageRaw,
  decodeSyncState,
  deleteAt,
  diff,
  diffPath,
  dump,
  emptyChange,
  encodeChange,
  encodeSyncMessage2 as encodeSyncMessage,
  encodeSyncState,
  equals,
  free,
  from,
  generateSyncMessage,
  getActorId,
  getAllChanges,
  getBackend,
  getChanges,
  getChangesMetaSince,
  getChangesSince,
  getConflicts,
  getCursor,
  getCursorPosition,
  getHeads,
  getHistory,
  getLastLocalChange,
  getMissingDeps,
  getObjectId,
  hasHeads,
  hasOurChanges,
  init,
  initBrowserBackend,
  initSyncState,
  initializeBase64Wasm,
  initializeWasm,
  insertAt,
  inspectChange,
  isAutomerge,
  isCounter,
  isImmutableString,
  isRawString,
  isWasmInitialized,
  joinBlock,
  load,
  loadIncremental,
  makeSelectable,
  mark,
  marks,
  marksAt,
  merge,
  implementation_exports as next,
  readBundle,
  receiveSyncMessage,
  releaseInfo,
  renderObliviousText,
  save,
  saveBundle,
  saveIncremental,
  saveSince,
  setBrowserBackend,
  setSerializer,
  spans,
  splice,
  splitBlock,
  stats,
  toJS,
  topoHistoryTraversal,
  unmark,
  updateBlock,
  updateSpans,
  updateText,
  use,
  view,
  wasmInitialized
};
