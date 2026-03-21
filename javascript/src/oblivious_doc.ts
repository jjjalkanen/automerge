/*-----------------------------------------------------------*/
/*  Oblivious Automerge Adaptation Layer                     */
/*                                                           */
/*  Provides an oblivious CRDT map over immutable strings    */
/*  using obliv-core primitives. All data manipulation is    */
/*  constant-time from the perspective of web content code.  */
/*-----------------------------------------------------------*/
import {
  cmov,
  eq, gt,
  andBool, orBool, notBool,
  TRUE8, FALSE8,
  eqInt, gtInt,
  eqString, gtString,
  createObliviousBool,
  createObliviousInt,
  createObliviousString,
} from "obliv-core";
import type {
  Obliv8,
  ObliviousBool,
  ObliviousInt,
  ObliviousString,
  OblivSelectable,
} from "obliv-core";

/*-----------------------------------------------------------*/
/*  ObliviousOpId — Lamport timestamp (counter + actorId)    */
/*-----------------------------------------------------------*/

/**
 * A Lamport clock entry: a monotonically increasing counter paired with
 * the actorId of the writer.  Used for Last-Writer-Wins conflict resolution.
 *
 * Does NOT `extend OblivSelectable` to avoid the polymorphic-`this` conflict
 * that arises when a concrete interface declares `oblivSelect(): ConcreteType`.
 * Structural compatibility with OblivSelectable is satisfied at call sites
 * via TypeScript's duck-typing checks on the method signature.
 */
export interface ObliviousOpId {
  counter: ObliviousInt;
  actorId: ObliviousString;
  /** Field-by-field constant-time selection — delegates to cmov on each field. */
  oblivSelect(cond: Obliv8, other: ObliviousOpId): ObliviousOpId;
}

/** Create an ObliviousOpId from plain JS values. */
export const createObliviousOpId = (
  counter: number | bigint,
  actorId: string
): ObliviousOpId =>
  _makeOpId(createObliviousInt(counter), createObliviousString(actorId));

const _makeOpId = (
  counter: ObliviousInt,
  actorId: ObliviousString
): ObliviousOpId => ({
  counter,
  actorId,
  oblivSelect(cond: Obliv8, other: ObliviousOpId): ObliviousOpId {
    return _makeOpId(
      cmov(cond, this.counter, other.counter),
      cmov(cond, this.actorId, other.actorId)
    );
  },
});

/**
 * Oblivious Lamport clock comparison: returns ObliviousBool(1) iff a > b.
 *
 * Primary key: counter.  Tie-break: actorId (lexicographic byte order).
 * All comparisons are constant-time scans — no short-circuit branching on
 * secret data.
 */
export const isOpIdGreater = (
  a: ObliviousOpId,
  b: ObliviousOpId
): ObliviousBool => {
  const counterGt = gtInt(a.counter, b.counter);
  const counterEq = eqInt(a.counter, b.counter);
  const actorGt   = gtString(a.actorId, b.actorId);
  return orBool(counterGt, andBool(counterEq, actorGt));
};


/*-----------------------------------------------------------*/
/*  ObliviousMapEntry — one slot in the oblivious map        */
/*-----------------------------------------------------------*/

/**
 * A single key-value-opId entry in the oblivious map.
 * `isDeleted` is the tombstone flag for CRDT delete operations.
 *
 * Implements field-by-field oblivious selection via cascading cmov,
 * satisfying OblivSelectable structurally without `extends`.
 */
export interface ObliviousMapEntry {
  key:       ObliviousString;
  value:     ObliviousString;
  opId:      ObliviousOpId;
  isDeleted: ObliviousBool;
  /** Field-by-field constant-time selection — delegates to cmov on each field. */
  oblivSelect(cond: Obliv8, other: ObliviousMapEntry): ObliviousMapEntry;
}

const _makeMapEntry = (
  key:       ObliviousString,
  value:     ObliviousString,
  opId:      ObliviousOpId,
  isDeleted: ObliviousBool
): ObliviousMapEntry => ({
  key,
  value,
  opId,
  isDeleted,
  oblivSelect(cond: Obliv8, other: ObliviousMapEntry): ObliviousMapEntry {
    return _makeMapEntry(
      cmov(cond, this.key,   other.key),
      cmov(cond, this.value, other.value),
      // OpId is selected field-by-field via its own oblivSelect implementation.
      _makeOpId(
        cmov(cond, this.opId.counter, other.opId.counter),
        cmov(cond, this.opId.actorId, other.opId.actorId)
      ),
      // Boolean fields: use boolean algebra instead of cmov to avoid the
      // Obliv8.oblivSelect → Obliv8 (not ObliviousBool) return-type mismatch.
      // cmov(cond, newBool, current) ≡ AND(NOT(cond), current) OR AND(cond, newBool)
      // For the general case we provide an inline helper:
      _boolCmov(cond as ObliviousBool, this.isDeleted, other.isDeleted)
    );
  },
});

/**
 * Oblivious boolean conditional-move implemented via boolean algebra.
 * Equivalent to: `if (cond) return onTrue; else return onFalse;`
 * but without any control-flow branching on secret data.
 *
 * `cmov(cond, onTrue, onFalse) = OR(AND(cond, onTrue), AND(NOT(cond), onFalse))`
 */
const _boolCmov = (
  cond:    ObliviousBool,
  onTrue:  ObliviousBool,
  onFalse: ObliviousBool
): ObliviousBool =>
  orBool(andBool(cond, onTrue), andBool(notBool(cond), onFalse));

/*-----------------------------------------------------------*/
/*  ObliviousMapOps — core map algorithms                    */
/*-----------------------------------------------------------*/

export const ObliviousMapOps = {
  /**
   * ALLOCATE: O(1) — publicly grows the map by one slot.
   *
   * The observer learns the map size increased by 1; they learn nothing about
   * the key or value.  Callers must only invoke this when they know the key is
   * genuinely new — determining this externally avoids leaking key-existence
   * through internal branching.
   */
  allocateNewKey(
    mapArray: ObliviousMapEntry[],
    newKey:   ObliviousString,
    newValue: ObliviousString,
    newOpId:  ObliviousOpId
  ): void {
    mapArray.push(_makeMapEntry(newKey, newValue, newOpId, FALSE8));
  },

  /**
   * UPDATE: O(N) — constant-time linear scan over the entire map.
   *
   * Applies Last-Writer-Wins: every slot is visited regardless of match so the
   * execution time is strictly proportional to the public map length.
   * The slot whose key matches `targetKey` has its value/opId/isDeleted
   * updated iff the incoming opId is strictly newer.
   */
  updateExistingKey(
    mapArray:  ObliviousMapEntry[],
    targetKey: ObliviousString,
    newValue:  ObliviousString,
    newOpId:   ObliviousOpId
  ): void {
    for (let i = 0; i < mapArray.length; i++) {
      const current = mapArray[i];

      // 1. Does this slot's key match the target?
      const isKeyMatch = eqString(current.key, targetKey);

      // 2. Is the incoming operation strictly newer? (Lamport LWW)
      const isNewer = isOpIdGreater(newOpId, current.opId);

      // 3. Both conditions must hold — no branching.
      const shouldOverwrite = andBool(isKeyMatch, isNewer);

      // 4. Constant-time field updates.
      mapArray[i] = _makeMapEntry(
        current.key,                                               // key is immutable
        cmov(shouldOverwrite, newValue,  current.value),
        // OpId: field-by-field cmov
        _makeOpId(
          cmov(shouldOverwrite, newOpId.counter, current.opId.counter),
          cmov(shouldOverwrite, newOpId.actorId, current.opId.actorId)
        ),
        // isDeleted: if overwriting, reset tombstone flag to false.
        // AND(NOT(shouldOverwrite), current.isDeleted)
        andBool(notBool(shouldOverwrite), current.isDeleted)
      );
    }
  },

  /**
   * DELETE: O(N) — same scan pattern as updateExistingKey.
   *
   * Sets `isDeleted = true` on the matching entry iff the tombstone opId is newer.
   */
  deleteKey(
    mapArray:      ObliviousMapEntry[],
    targetKey:     ObliviousString,
    tombstoneOpId: ObliviousOpId
  ): void {
    for (let i = 0; i < mapArray.length; i++) {
      const current = mapArray[i];
      const isKeyMatch  = eqString(current.key, targetKey);
      const isNewer     = isOpIdGreater(tombstoneOpId, current.opId);
      const shouldDelete = andBool(isKeyMatch, isNewer);

      mapArray[i] = _makeMapEntry(
        current.key,
        current.value,
        _makeOpId(
          cmov(shouldDelete, tombstoneOpId.counter, current.opId.counter),
          cmov(shouldDelete, tombstoneOpId.actorId, current.opId.actorId)
        ),
        // isDeleted: if deleting, set to true; else keep current.
        // OR(shouldDelete, current.isDeleted)
        orBool(shouldDelete, current.isDeleted)
      );
    }
  },
};

/*-----------------------------------------------------------*/
/*  ObliviousAutomergeDoc — orchestration layer              */
/*-----------------------------------------------------------*/

/**
 * A minimal Automerge-compatible oblivious document over a single JSON map.
 *
 * Manages:
 * - A public Lamport clock (counter is public; content remains oblivious)
 * - The materialized oblivious map state
 * - Explicit putNew vs putUpdate distinction: the caller signals intent so
 *   that this class never internally branches on whether a key exists,
 *   which would leak key-existence information.
 *
 * Network sync and full Automerge op encoding are stubbed — this class is
 * the pure oblivious data-structure layer.
 */
export class ObliviousAutomergeDoc {
  private mapState: ObliviousMapEntry[] = [];

  /**
   * The local logical clock is public: the observer already knows how many
   * operations have been applied from this actor.
   */
  public logicalClock = 0;

  private readonly localActorId: ObliviousString;

  constructor(actorId: string) {
    this.localActorId = createObliviousString(actorId);
  }

  private nextOpId(): ObliviousOpId {
    this.logicalClock += 1;
    return _makeOpId(
      createObliviousInt(this.logicalClock),
      this.localActorId
    );
  }

  /**
   * Establish a brand-new key.  Caller guarantees this key is not yet present.
   * O(1) — grows the map by one slot.
   */
  putNew(key: ObliviousString, value: ObliviousString): void {
    ObliviousMapOps.allocateNewKey(this.mapState, key, value, this.nextOpId());
    // TODO: encode op and enqueue for network sync
  }

  /**
   * Overwrite an existing key.  Caller guarantees the key already exists.
   * O(N) — scans every slot to apply the update obliviously.
   */
  putUpdate(key: ObliviousString, value: ObliviousString): void {
    ObliviousMapOps.updateExistingKey(this.mapState, key, value, this.nextOpId());
    // TODO: encode op and enqueue for network sync
  }

  /**
   * Delete an existing key.  Caller guarantees the key already exists.
   * O(N) — scans every slot to apply the tombstone obliviously.
   */
  delete(key: ObliviousString): void {
    ObliviousMapOps.deleteKey(this.mapState, key, this.nextOpId());
    // TODO: encode op and enqueue for network sync
  }

  /**
   * Apply a remote operation received over the network.
   *
   * `remoteCounter` is the public clock value from the remote op (already
   * visible to any observer of the network traffic).
   */
  applyRemoteOp(
    kind:          "new" | "update" | "delete",
    key:           ObliviousString,
    value:         ObliviousString | null,
    remoteOpId:    ObliviousOpId,
    remoteCounter: number
  ): void {
    if (kind === "new" && value !== null) {
      ObliviousMapOps.allocateNewKey(this.mapState, key, value, remoteOpId);
    } else if (kind === "update" && value !== null) {
      ObliviousMapOps.updateExistingKey(this.mapState, key, value, remoteOpId);
    } else if (kind === "delete") {
      ObliviousMapOps.deleteKey(this.mapState, key, remoteOpId);
    }
    // Advance local clock past the remote counter to stay monotonic.
    if (remoteCounter > this.logicalClock) {
      this.logicalClock = remoteCounter;
    }
  }

  /** Expose the raw map state for display layer / oblivious-div consumption. */
  getMapState(): readonly ObliviousMapEntry[] {
    return this.mapState;
  }

  /** Public map size — the observer already knows this. */
  get size(): number {
    return this.mapState.length;
  }
}
