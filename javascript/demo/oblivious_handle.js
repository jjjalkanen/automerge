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
import { STATE, OBJECT_ID } from "./constants.js";
import { encodeSyncMessage, decodeSyncMessage, hexEncode, } from "./oblivious_sync_codec.js";
let arrayFactory = null;
/**
 * Provide the browser's ObliviousArray factory (window.oblivious.createArray).
 * When set, all new lists use C++ ObliviousArray storage.
 */
export function setBrowserBackend(createArray) {
    arrayFactory = createArray;
}
function createListBackend() {
    return arrayFactory ? arrayFactory() : [];
}
function isBrowserArray(backend) {
    return arrayFactory !== null && !Array.isArray(backend);
}
let valueSerializer = null;
export function setSerializer(s) {
    valueSerializer = s;
}
export class ObliviousSyncState {
    constructor() {
        this.lastSentHeads = [];
        this.sentHashes = new Set();
    }
    free() { }
}
function arraysEqual(a, b) {
    if (a.length !== b.length)
        return false;
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i])
            return false;
    }
    return true;
}
function headsEqual(a, b) {
    if (a.length !== b.length)
        return false;
    return a.every((h, i) => arraysEqual(h, b[i]));
}
function listGet(backend, index) {
    if (isBrowserArray(backend))
        return backend.get(index);
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
    }
    else {
        // Node.js fallback
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const nodeCrypto = require("crypto");
        const buf = nodeCrypto.randomBytes(16);
        bytes.set(buf);
    }
    return Array.from(bytes)
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");
}
export class ObliviousHandle {
    constructor(actorId) {
        /**
         * Non-undefined so that isSameDocument() in proxies.ts does not produce
         * false positives (it compares __wbg_ptr === __wbg_ptr; undefined===undefined
         * would be true for every non-doc object).
         */
        this.__wbg_ptr = 0;
        this.store = new Map();
        this.objects = new Map();
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
            if (val === objId)
                return key;
        }
        return objId;
    }
    resolveObjForPath(path) {
        const val = this.store.get(path);
        if (val && this.objects.has(val))
            return val;
        return undefined;
    }
    recordChange(obj, _cursor, action, value) {
        if (!valueSerializer)
            return;
        const seq = ++this.changeSeq;
        const packed = JSON.stringify({
            action: valueSerializer.serialize(action),
            value: valueSerializer.serialize(value),
        });
        const changeData = new TextEncoder().encode(JSON.stringify({
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
        }));
        const hash = this.makeChangeId(seq);
        this.changeLog.push({ hash, encoded: changeData });
        this.currentHeads = [hash];
    }
    // ── Core map / list ops ───────────────────────────────────────────────────
    put(obj, prop, value, _datatype) {
        const list = this.objects.get(obj);
        if (list) {
            listSet(list.data, prop, value);
        }
        else {
            this.store.set(String(prop), value);
        }
        this._pendingOps++;
    }
    getWithType(obj, prop) {
        const list = this.objects.get(obj);
        if (list) {
            const idx = typeof prop === "string" ? parseInt(prop, 10) : prop;
            if (idx < 0 || idx >= listLength(list.data))
                return null;
            return ["oblivious", listGet(list.data, idx)];
        }
        const key = String(prop);
        if (!this.store.has(key))
            return null;
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
            for (let i = 0; i < len; i++)
                keys.push(String(i));
            return keys;
        }
        return [...this.store.keys()];
    }
    delete(obj, prop) {
        const list = this.objects.get(obj);
        if (list) {
            const idx = typeof prop === "string" ? parseInt(prop, 10) : prop;
            listDelete(list.data, idx);
        }
        else {
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
    materialize(_obj, _heads, meta) {
        const doc = {};
        for (const [key, value] of this.store) {
            const listObj = this.objects.get(value);
            if (listObj) {
                const len = listLength(listObj.data);
                const arr = [];
                for (let i = 0; i < len; i++)
                    arr.push(listGet(listObj.data, i));
                Object.defineProperty(arr, OBJECT_ID, {
                    value,
                    enumerable: false,
                    configurable: true,
                });
                if (this._freezeEnabled)
                    Object.freeze(arr);
                doc[key] = arr;
            }
            else {
                doc[key] = value;
            }
        }
        Object.defineProperty(doc, STATE, {
            value: meta,
            enumerable: false,
            configurable: true,
            writable: true,
        });
        Object.defineProperty(doc, OBJECT_ID, {
            value: "_root",
            enumerable: false,
            configurable: true,
        });
        if (this._freezeEnabled)
            Object.freeze(doc);
        return doc;
    }
    applyAndReturnPatches(_doc, meta) {
        return { value: this.materialize("_root", undefined, meta), patches: [] };
    }
    applyPatches(_doc, meta) {
        return this.materialize("_root", undefined, meta);
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
    integrate() { }
    rollback() {
        this._pendingOps = 0;
    }
    isolate(_scope) { }
    // ── Config ────────────────────────────────────────────────────────────────
    enableFreeze(b) {
        this._freezeEnabled = b;
    }
    registerDatatype(_name, ..._args) { }
    // ── Misc ──────────────────────────────────────────────────────────────────
    getActorId() {
        return this.actorId;
    }
    free() { }
    updateDiffCursor() { }
    fork(actor, _heads) {
        const next = new ObliviousHandle(actor || randomActorId());
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
            }
            else {
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
        if (!list)
            throw new Error("oblivious: insert target is not a list");
        listInsert(list.data, index, value);
        this._pendingOps++;
    }
    obliviousInsert(obj, index, value) {
        const list = this.objects.get(obj);
        if (!list)
            throw new Error("oblivious: insert target is not a list");
        if (!isBrowserArray(list.data)) {
            throw new Error("oblivious: obliviousInsert requires browser backend");
        }
        list.data.obliviousInsert(index, value);
        this._pendingOps++;
    }
    obliviousDelete(obj, index) {
        const list = this.objects.get(obj);
        if (!list)
            throw new Error("oblivious: delete target is not a list");
        if (!isBrowserArray(list.data)) {
            throw new Error("oblivious: obliviousDelete requires browser backend");
        }
        list.data.obliviousDelete(index);
        this._pendingOps++;
    }
    obliviousEdit(obj, cursor, action, value) {
        const list = this.objects.get(obj);
        if (!list)
            throw new Error("oblivious: edit target is not a list");
        if (!isBrowserArray(list.data)) {
            throw new Error("oblivious: obliviousEdit requires browser backend");
        }
        list.data.obliviousEdit(cursor, action, value);
        this._pendingOps++;
        this.recordChange(obj, cursor, action, value);
    }
    splice(obj, index, n, _text) {
        const list = this.objects.get(obj);
        if (!list)
            throw new Error("oblivious: splice target is not a list");
        for (let i = 0; i < n; i++) {
            listDelete(list.data, index);
        }
        this._pendingOps++;
    }
    length(obj) {
        const list = this.objects.get(obj);
        if (list)
            return listLength(list.data);
        return 0;
    }
    text(_obj) {
        return "";
    }
    getCursorPosition(_obj, _cursor) {
        throw new Error("oblivious: cursor not supported");
    }
    // ── Sync ───────────────────────────────────────────────────────────────────
    generateSyncMessage(syncState) {
        const unsent = this.changeLog.filter(c => !syncState.sentHashes.has(hexEncode(c.hash)));
        if (unsent.length === 0 &&
            headsEqual(syncState.lastSentHeads, this.currentHeads)) {
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
            changes: unsent.map(c => c.encoded),
        });
    }
    receiveSyncMessage(syncState, message) {
        const msg = decodeSyncMessage(message);
        for (const changeBytes of msg.changes) {
            const change = JSON.parse(new TextDecoder().decode(changeBytes));
            for (const op of change.ops) {
                if (op.action === "obliviousEdit" && valueSerializer) {
                    const objId = this.resolveObjForPath(op.obj);
                    if (!objId)
                        continue;
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
            const idBytes = new TextEncoder().encode(`${change.actor}:${change.seq}`);
            hash.set(idBytes.slice(0, 32));
            this.changeLog.push({ hash, encoded: changeBytes });
        }
        syncState.theirHeads = msg.heads;
        this.currentHeads = [...msg.heads];
        this.version++;
    }
    hasOurChanges(syncState) {
        if (!syncState.theirHeads)
            return false;
        return this.currentHeads.every(h => syncState.theirHeads.some(th => arraysEqual(h, th)));
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
}
// ── ObliviousApi ─────────────────────────────────────────────────────────────
// Passed to UseApi() so that ApiHandler delegates to ObliviousHandle.
export const ObliviousApi = {
    create(options) {
        var _a;
        return new ObliviousHandle((_a = options === null || options === void 0 ? void 0 : options.actor) !== null && _a !== void 0 ? _a : randomActorId());
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
        var _a;
        if (state instanceof ObliviousSyncState) {
            return {
                sharedHeads: (state.theirHeads || []).map(hexEncode),
                lastSentHeads: state.lastSentHeads.map(hexEncode),
                theirHeads: (_a = state.theirHeads) === null || _a === void 0 ? void 0 : _a.map(hexEncode),
                theirHeed: undefined,
                theirHave: undefined,
                sentHashes: [...state.sentHashes],
                _internal: {
                    lastSentHeads: state.lastSentHeads,
                    sentHashes: state.sentHashes,
                    theirHeads: state.theirHeads,
                },
            };
        }
        return state;
    },
    importSyncState(state) {
        const s = new ObliviousSyncState();
        if (state._internal) {
            s.lastSentHeads = state._internal.lastSentHeads || [];
            s.sentHashes = state._internal.sentHashes || new Set();
            s.theirHeads = state._internal.theirHeads;
        }
        return s;
    },
    readBundle() {
        throw new Error("oblivious: not implemented");
    },
    wasmReleaseInfo() {
        throw new Error("oblivious: not implemented");
    },
};
