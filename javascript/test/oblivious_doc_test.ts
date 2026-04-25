/*-----------------------------------------------------------*/
/*  Oblivious Automerge Doc — Test Suite                     */
/*                                                           */
/*  Adapted from Automerge's Mocha test suite.               */
/*  All assertions go through eqString/eqInt → ObliviousBool */
/*  to avoid directly reading oblivious values.              */
/*-----------------------------------------------------------*/
import assert from "assert";
import {
  TRUE8,
  FALSE8,
  eqString,
  eqInt,
  createObliviousString,
  createObliviousInt,
} from "obliv-core";
import { isOblivTrue, isOblivFalse } from "obliv-core/testing";
import type { ObliviousBool } from "obliv-core";
import {
  ObliviousAutomergeDoc,
  ObliviousMapOps,
  createObliviousOpId,
  isOpIdGreater,
} from "../src/oblivious_doc.js";
import type { ObliviousMapEntry } from "../src/oblivious_doc.js";
import type { ObliviousString } from "obliv-core";

/*-----------------------------------------------------------*/
/*  Helpers                                                  */
/*-----------------------------------------------------------*/

/** Assert two oblivious strings are equal via eqString. */
function assertOblivEq(
  a: ObliviousString,
  b: ObliviousString,
  msg?: string
): void {
  assert.ok(isOblivTrue(eqString(a, b)), msg);
}

/** Assert a map entry is tombstoned. */
function assertDeleted(entry: ObliviousMapEntry, msg?: string): void {
  assert.ok(isOblivTrue(entry.isDeleted), msg ?? "expected entry to be deleted");
}

/** Assert a map entry is NOT tombstoned. */
function assertNotDeleted(entry: ObliviousMapEntry, msg?: string): void {
  assert.ok(isOblivFalse(entry.isDeleted), msg ?? "expected entry not to be deleted");
}

/** Find a map entry whose key matches the given plain string. */
// NOTE: Test-only helper. Uses short-circuit .find() which leaks the matching
// index via timing. Production oblivious code must use a full linear scan with
// cmov to avoid this side channel.
function findEntry(
  state: readonly ObliviousMapEntry[],
  keyStr: string
): ObliviousMapEntry | undefined {
  const target = createObliviousString(keyStr);
  return state.find((e) => isOblivTrue(eqString(e.key, target)));
}

/** Shorthand: wrap a plain string as an ObliviousString key/value. */
const key = (s: string): ObliviousString => createObliviousString(s);
const val = (s: string): ObliviousString => createObliviousString(s);

/*-----------------------------------------------------------*/
/*  A. ObliviousOpId                                         */
/*-----------------------------------------------------------*/

describe("ObliviousOpId", () => {
  it("round-trips counter and actorId", () => {
    const opId = createObliviousOpId(42, "actorA");
    assert.ok(
      isOblivTrue(eqInt(opId.counter, createObliviousInt(42))),
      "counter should equal 42"
    );
    assertOblivEq(opId.actorId, key("actorA"), "actorId should equal 'actorA'");
  });

  it("higher counter wins", () => {
    const a = createObliviousOpId(10, "actor");
    const b = createObliviousOpId(5, "actor");
    assert.ok(isOblivTrue(isOpIdGreater(a, b)), "a(10) > b(5)");
    assert.ok(isOblivFalse(isOpIdGreater(b, a)), "b(5) not > a(10)");
  });

  it("same counter uses actorId as tie-break", () => {
    // "actorB" > "actorA" lexicographically
    const a = createObliviousOpId(5, "actorB");
    const b = createObliviousOpId(5, "actorA");
    assert.ok(isOblivTrue(isOpIdGreater(a, b)), "actorB > actorA");
    assert.ok(isOblivFalse(isOpIdGreater(b, a)), "actorA not > actorB");
  });

  it("equal opIds are not greater in either direction", () => {
    const a = createObliviousOpId(5, "actorA");
    const b = createObliviousOpId(5, "actorA");
    assert.ok(isOblivFalse(isOpIdGreater(a, b)), "equal is not greater (a vs b)");
    assert.ok(isOblivFalse(isOpIdGreater(b, a)), "equal is not greater (b vs a)");
  });

  it("oblivSelect with TRUE8 returns self fields; FALSE8 returns other's fields", () => {
    const a = createObliviousOpId(10, "actorA");
    const b = createObliviousOpId(20, "actorB");

    const selectedTrue = a.oblivSelect(TRUE8, b);
    assert.ok(
      isOblivTrue(eqInt(selectedTrue.counter, createObliviousInt(10))),
      "TRUE8 should select a.counter=10"
    );
    assertOblivEq(selectedTrue.actorId, key("actorA"), "TRUE8 should select a.actorId");

    const selectedFalse = a.oblivSelect(FALSE8, b);
    assert.ok(
      isOblivTrue(eqInt(selectedFalse.counter, createObliviousInt(20))),
      "FALSE8 should select b.counter=20"
    );
    assertOblivEq(selectedFalse.actorId, key("actorB"), "FALSE8 should select b.actorId");
  });
});

/*-----------------------------------------------------------*/
/*  B. ObliviousMapOps                                       */
/*-----------------------------------------------------------*/

describe("ObliviousMapOps", () => {
  it("allocateNewKey adds one entry with correct key/value and no tombstone", () => {
    const map: ObliviousMapEntry[] = [];
    ObliviousMapOps.allocateNewKey(map, key("k"), val("v"), createObliviousOpId(1, "actor"));
    assert.strictEqual(map.length, 1);
    assertOblivEq(map[0].key, key("k"), "key should be 'k'");
    assertOblivEq(map[0].value, val("v"), "value should be 'v'");
    assertNotDeleted(map[0]);
  });

  it("updateExistingKey with newer opId applies LWW overwrite", () => {
    const map: ObliviousMapEntry[] = [];
    ObliviousMapOps.allocateNewKey(map, key("k"), val("old"), createObliviousOpId(1, "actor"));
    ObliviousMapOps.updateExistingKey(map, key("k"), val("new"), createObliviousOpId(2, "actor"));
    assertOblivEq(map[0].value, val("new"), "value should be updated to 'new'");
    assertNotDeleted(map[0]);
  });

  it("updateExistingKey ignores stale opId", () => {
    const map: ObliviousMapEntry[] = [];
    ObliviousMapOps.allocateNewKey(
      map, key("k"), val("current"), createObliviousOpId(5, "actor")
    );
    ObliviousMapOps.updateExistingKey(
      map, key("k"), val("stale"), createObliviousOpId(3, "actor")
    );
    assertOblivEq(map[0].value, val("current"), "stale update should be ignored");
  });

  it("updateExistingKey does not affect other keys", () => {
    const map: ObliviousMapEntry[] = [];
    ObliviousMapOps.allocateNewKey(map, key("a"), val("va"), createObliviousOpId(1, "actor"));
    ObliviousMapOps.allocateNewKey(map, key("b"), val("vb"), createObliviousOpId(2, "actor"));
    ObliviousMapOps.updateExistingKey(
      map, key("a"), val("new-a"), createObliviousOpId(3, "actor")
    );
    assertOblivEq(map[0].value, val("new-a"), "'a' should be updated");
    assertOblivEq(map[1].value, val("vb"), "'b' should be unchanged");
  });

  it("deleteKey tombstones the matching entry", () => {
    const map: ObliviousMapEntry[] = [];
    ObliviousMapOps.allocateNewKey(map, key("k"), val("v"), createObliviousOpId(1, "actor"));
    ObliviousMapOps.deleteKey(map, key("k"), createObliviousOpId(2, "actor"));
    assertDeleted(map[0]);
  });

  it("deleteKey ignores stale tombstone opId", () => {
    const map: ObliviousMapEntry[] = [];
    ObliviousMapOps.allocateNewKey(map, key("k"), val("v"), createObliviousOpId(5, "actor"));
    ObliviousMapOps.deleteKey(map, key("k"), createObliviousOpId(3, "actor"));
    assertNotDeleted(map[0], "stale delete should not tombstone the entry");
  });

  it("updateExistingKey clears tombstone (un-delete)", () => {
    const map: ObliviousMapEntry[] = [];
    ObliviousMapOps.allocateNewKey(map, key("k"), val("v"), createObliviousOpId(1, "actor"));
    ObliviousMapOps.deleteKey(map, key("k"), createObliviousOpId(2, "actor"));
    assertDeleted(map[0], "entry should be tombstoned after delete");
    ObliviousMapOps.updateExistingKey(
      map, key("k"), val("revived"), createObliviousOpId(3, "actor")
    );
    assertNotDeleted(map[0], "entry should be un-deleted after later update");
    assertOblivEq(map[0].value, val("revived"), "value should be 'revived'");
  });
});

/*-----------------------------------------------------------*/
/*  C. ObliviousAutomergeDoc — local operations              */
/*-----------------------------------------------------------*/

describe("ObliviousAutomergeDoc - local operations", () => {
  it("putNew adds a key visible via getMapState", () => {
    const doc = new ObliviousAutomergeDoc("actor1");
    doc.putNew(key("name"), val("Alice"));
    assert.strictEqual(doc.size, 1);
    const entry = findEntry(doc.getMapState(), "name");
    assert.ok(entry, "entry for 'name' should exist");
    assertOblivEq(entry!.value, val("Alice"), "value should be 'Alice'");
    assertNotDeleted(entry!);
  });

  it("putNew multiple keys all appear in state", () => {
    const doc = new ObliviousAutomergeDoc("actor1");
    doc.putNew(key("a"), val("1"));
    doc.putNew(key("b"), val("2"));
    doc.putNew(key("c"), val("3"));
    assert.strictEqual(doc.size, 3);
    assert.ok(findEntry(doc.getMapState(), "a"), "key 'a' should exist");
    assert.ok(findEntry(doc.getMapState(), "b"), "key 'b' should exist");
    assert.ok(findEntry(doc.getMapState(), "c"), "key 'c' should exist");
  });

  it("putUpdate overwrites the value of an existing key", () => {
    const doc = new ObliviousAutomergeDoc("actor1");
    doc.putNew(key("name"), val("Alice"));
    doc.putUpdate(key("name"), val("Bob"));
    const entry = findEntry(doc.getMapState(), "name");
    assert.ok(entry);
    assertOblivEq(entry!.value, val("Bob"), "value should be overwritten to 'Bob'");
    assertNotDeleted(entry!);
  });

  it("putUpdate applied multiple times keeps the latest value", () => {
    const doc = new ObliviousAutomergeDoc("actor1");
    doc.putNew(key("x"), val("1"));
    doc.putUpdate(key("x"), val("2"));
    doc.putUpdate(key("x"), val("3"));
    const entry = findEntry(doc.getMapState(), "x");
    assert.ok(entry);
    assertOblivEq(entry!.value, val("3"), "value should be '3' after three puts");
  });

  it("delete marks entry as tombstoned; slot is preserved in state", () => {
    const doc = new ObliviousAutomergeDoc("actor1");
    doc.putNew(key("name"), val("Alice"));
    doc.delete(key("name"));
    assert.strictEqual(doc.size, 1, "slot should still exist after delete");
    const entry = findEntry(doc.getMapState(), "name");
    assert.ok(entry);
    assertDeleted(entry!);
  });

  it("logical clock increments by 1 for each local operation", () => {
    const doc = new ObliviousAutomergeDoc("actor1");
    assert.strictEqual(doc.logicalClock, 0, "initial clock is 0");
    doc.putNew(key("a"), val("1"));
    assert.strictEqual(doc.logicalClock, 1);
    doc.putUpdate(key("a"), val("2"));
    assert.strictEqual(doc.logicalClock, 2);
    doc.delete(key("a"));
    assert.strictEqual(doc.logicalClock, 3);
  });
});

/*-----------------------------------------------------------*/
/*  D. ObliviousAutomergeDoc — concurrent merge              */
/*-----------------------------------------------------------*/

describe("ObliviousAutomergeDoc - concurrent merge", () => {
  it("concurrent ops on different keys: both keys present after merge", () => {
    // docA writes key "x"; docB writes key "y"; exchange ops
    const docA = new ObliviousAutomergeDoc("actorA");
    const docB = new ObliviousAutomergeDoc("actorB");

    docA.putNew(key("x"), val("from-A")); // opId=(1,"actorA")
    docB.putNew(key("y"), val("from-B")); // opId=(1,"actorB")

    // docA receives docB's "new y" op
    docA.applyRemoteOp("new", key("y"), val("from-B"), createObliviousOpId(1, "actorB"), 1);
    // docB receives docA's "new x" op
    docB.applyRemoteOp("new", key("x"), val("from-A"), createObliviousOpId(1, "actorA"), 1);

    assert.strictEqual(docA.size, 2);
    assert.strictEqual(docB.size, 2);

    const xInA = findEntry(docA.getMapState(), "x");
    const yInA = findEntry(docA.getMapState(), "y");
    assert.ok(xInA && yInA, "both keys should be present in docA");
    assertNotDeleted(xInA!);
    assertNotDeleted(yInA!);
  });

  it("concurrent same field with equal counter: actorId tie-break (actorB > actorA)", () => {
    // Both actors assign counter=1 to the same key.
    // "actorB" > "actorA" lexicographically, so actorB's value wins.
    const docA = new ObliviousAutomergeDoc("actorA");
    const docB = new ObliviousAutomergeDoc("actorB");

    docA.putNew(key("x"), val("from-A")); // opId=(1,"actorA")
    docB.putNew(key("x"), val("from-B")); // opId=(1,"actorB")

    // docA receives docB's concurrent update (slot already exists → "update")
    docA.applyRemoteOp(
      "update", key("x"), val("from-B"), createObliviousOpId(1, "actorB"), 1
    );
    // docB receives docA's concurrent update
    docB.applyRemoteOp(
      "update", key("x"), val("from-A"), createObliviousOpId(1, "actorA"), 1
    );

    // "actorB" wins in docA (its opId is greater)
    const entryA = findEntry(docA.getMapState(), "x");
    assertOblivEq(entryA!.value, val("from-B"), "docA: actorB should win the tie-break");

    // "actorA"'s update on docB is stale vs docB's own (1,"actorB") opId
    const entryB = findEntry(docB.getMapState(), "x");
    assertOblivEq(entryB!.value, val("from-B"), "docB: its own write should be preserved");
  });

  it("concurrent same field: higher counter wins regardless of actorId", () => {
    const docA = new ObliviousAutomergeDoc("actorA");
    const docB = new ObliviousAutomergeDoc("actorB");

    docA.putNew(key("x"), val("from-A")); // opId=(1,"actorA")
    // docB's clock is at 5 (simulates 5 prior operations)
    docB.putNew(key("z"), val("z1")); // clock=1
    docB.putNew(key("z"), val("z2")); // clock=2 (these are just to advance clock)
    docB.putNew(key("z"), val("z3")); // clock=3
    docB.putNew(key("z"), val("z4")); // clock=4
    docB.putNew(key("x"), val("from-B")); // opId=(5,"actorB") — higher counter

    // docA receives docB's concurrent put on "x"
    docA.applyRemoteOp(
      "update", key("x"), val("from-B"), createObliviousOpId(5, "actorB"), 5
    );

    const entry = findEntry(docA.getMapState(), "x");
    assertOblivEq(entry!.value, val("from-B"), "higher counter (5 > 1) should win");
  });

  it("remote delete merges correctly", () => {
    const docA = new ObliviousAutomergeDoc("actorA");
    const docB = new ObliviousAutomergeDoc("actorB");

    docA.putNew(key("x"), val("value")); // opId=(1,"actorA")
    // docB learns about "x" and then deletes it
    docB.applyRemoteOp("new", key("x"), val("value"), createObliviousOpId(1, "actorA"), 1);
    docB.delete(key("x")); // opId=(2,"actorB")

    // docA receives docB's delete
    docA.applyRemoteOp(
      "delete", key("x"), null, createObliviousOpId(2, "actorB"), 2
    );

    const entry = findEntry(docA.getMapState(), "x");
    assertDeleted(entry!, "remote delete should tombstone the entry in docA");
  });

  it("concurrent put vs delete: LWW (not add-wins) — put with higher counter survives", () => {
    // NOTE: Unlike standard Automerge's add-wins semantics, the oblivious LWW
    // implementation resolves purely by OpId comparison.
    // A put with a higher OpId will beat a concurrent delete with a lower OpId.
    const docA = new ObliviousAutomergeDoc("actorA");
    const docB = new ObliviousAutomergeDoc("actorB");

    // docA puts "x" with a high counter (simulating it happened after docB's delete)
    docA.putNew(key("x"), val("alive")); // opId=(1,"actorA") — we'll use counter=3 via remote
    // docB puts then deletes "x" with lower counters
    docB.putNew(key("x"), val("dead"));  // opId=(1,"actorB")
    docB.delete(key("x"));               // opId=(2,"actorB")

    // docA receives docB's put (update, since docA already has "x") — stale, (1,"actorB") < (3,"actorA")
    docA.applyRemoteOp(
      "update", key("x"), val("dead"), createObliviousOpId(1, "actorB"), 1
    );
    // docA receives docB's delete — stale, (2,"actorB") < (3,"actorA")
    // We simulate docA's write having happened at counter=3 by advancing clock first
    // Actually docA's clock is at 1 (one putNew). Let's verify the delete is stale:
    // docA's entry opId is (1,"actorA"), docB's delete is (2,"actorB").
    // isOpIdGreater((2,"actorB"), (1,"actorA")) = true → delete WOULD win here.
    // To test LWW put-wins, docA must have a higher opId than docB's delete.
    // Re-do: docA putNew → clock=1; putUpdate → clock=2, then apply docB's delete(2,"actorB").
    // (2,"actorA") vs (2,"actorB"): "actorA" < "actorB" → delete wins.
    // Instead use docA's counter=3 by doing two ops before the relevant one:
    // This test verifies the LWW property: put with counter=3 beats delete with counter=2.
    const docA2 = new ObliviousAutomergeDoc("actorA");
    const docB2 = new ObliviousAutomergeDoc("actorB");

    docB2.putNew(key("x"), val("dead"));  // opId=(1,"actorB")
    docB2.delete(key("x"));               // opId=(2,"actorB")

    // docA2 adds "x" at counter=3 (higher than docB2's delete counter=2)
    docA2.putNew(key("y"), val("y1"));    // clock=1
    docA2.putNew(key("y"), val("y2"));    // clock=2
    docA2.putNew(key("x"), val("alive")); // opId=(3,"actorA")

    // docA2 receives docB2's put then delete
    docA2.applyRemoteOp(
      "update", key("x"), val("dead"), createObliviousOpId(1, "actorB"), 1
    );
    docA2.applyRemoteOp(
      "delete", key("x"), null, createObliviousOpId(2, "actorB"), 2
    );

    const entry2 = findEntry(docA2.getMapState(), "x");
    assertNotDeleted(entry2!, "put at counter=3 beats delete at counter=2 (LWW, not add-wins)");
    assertOblivEq(entry2!.value, val("alive"), "LWW put value should be 'alive'");
  });

  it("conflict cleared by subsequent put on both actors", () => {
    const docA = new ObliviousAutomergeDoc("actorA");
    const docB = new ObliviousAutomergeDoc("actorB");

    docA.putNew(key("x"), val("from-A")); // opId=(1,"actorA")
    docB.putNew(key("x"), val("from-B")); // opId=(1,"actorB") wins tie-break

    // Exchange concurrent ops
    docA.applyRemoteOp(
      "update", key("x"), val("from-B"), createObliviousOpId(1, "actorB"), 1
    );
    docB.applyRemoteOp(
      "update", key("x"), val("from-A"), createObliviousOpId(1, "actorA"), 1
    );

    // Now docA resolves by doing a new put (counter=2, higher than (1,"actorB"))
    docA.putUpdate(key("x"), val("resolved")); // opId=(2,"actorA")
    docB.applyRemoteOp(
      "update", key("x"), val("resolved"), createObliviousOpId(2, "actorA"), 2
    );

    assertOblivEq(
      findEntry(docA.getMapState(), "x")!.value,
      val("resolved"),
      "docA: subsequent put should resolve conflict"
    );
    assertOblivEq(
      findEntry(docB.getMapState(), "x")!.value,
      val("resolved"),
      "docB: should converge to resolved value"
    );
  });

  it("applyRemoteOp advances logical clock monotonically", () => {
    const doc = new ObliviousAutomergeDoc("actorA");
    assert.strictEqual(doc.logicalClock, 0);

    doc.applyRemoteOp("new", key("x"), val("v"), createObliviousOpId(5, "actorB"), 5);
    assert.strictEqual(doc.logicalClock, 5, "clock should advance to 5");

    // Receiving an op with a lower counter should not reduce the clock
    doc.applyRemoteOp("update", key("x"), val("v2"), createObliviousOpId(3, "actorB"), 3);
    assert.strictEqual(doc.logicalClock, 5, "clock should not regress below current value");

    // Receiving a higher counter should advance it
    doc.applyRemoteOp("update", key("x"), val("v3"), createObliviousOpId(10, "actorB"), 10);
    assert.strictEqual(doc.logicalClock, 10, "clock should advance to 10");
  });
});

/*-----------------------------------------------------------*/
/*  E. ObliviousMapEntry — oblivSelect                       */
/*-----------------------------------------------------------*/

describe("ObliviousMapEntry - oblivSelect", () => {
  it("TRUE8 returns the first (self) entry's fields", () => {
    const mapA: ObliviousMapEntry[] = [];
    const mapB: ObliviousMapEntry[] = [];
    ObliviousMapOps.allocateNewKey(mapA, key("a"), val("va"), createObliviousOpId(1, "actorA"));
    ObliviousMapOps.allocateNewKey(mapB, key("b"), val("vb"), createObliviousOpId(2, "actorB"));
    // Tombstone mapB's entry so isDeleted differs between the two
    ObliviousMapOps.deleteKey(mapB, key("b"), createObliviousOpId(3, "actorB"));

    const selected = mapA[0].oblivSelect(TRUE8, mapB[0]);
    assertOblivEq(selected.key, key("a"), "TRUE8 should select first entry's key 'a'");
    assertOblivEq(selected.value, val("va"), "TRUE8 should select first entry's value 'va'");
    assertNotDeleted(selected, "TRUE8 should select first entry's isDeleted (not deleted)");
    assert.ok(
      isOblivTrue(eqInt(selected.opId.counter, createObliviousInt(1))),
      "TRUE8 should select first entry's opId.counter=1"
    );
  });

  it("FALSE8 returns the second (other) entry's fields", () => {
    const mapA: ObliviousMapEntry[] = [];
    const mapB: ObliviousMapEntry[] = [];
    ObliviousMapOps.allocateNewKey(mapA, key("a"), val("va"), createObliviousOpId(1, "actorA"));
    ObliviousMapOps.allocateNewKey(mapB, key("b"), val("vb"), createObliviousOpId(2, "actorB"));
    // Tombstone mapB's entry so isDeleted differs between the two
    ObliviousMapOps.deleteKey(mapB, key("b"), createObliviousOpId(3, "actorB"));

    const selected = mapA[0].oblivSelect(FALSE8, mapB[0]);
    assertOblivEq(selected.key, key("b"), "FALSE8 should select second entry's key 'b'");
    assertOblivEq(selected.value, val("vb"), "FALSE8 should select second entry's value 'vb'");
    assertDeleted(selected, "FALSE8 should select second entry's isDeleted (deleted)");
    assert.ok(
      isOblivTrue(eqInt(selected.opId.counter, createObliviousInt(3))),
      "FALSE8 should select second entry's opId.counter=3 (tombstone op)"
    );
  });
});

/*-----------------------------------------------------------*/
/*  F. Bulk operations                                       */
/*-----------------------------------------------------------*/

describe("bulk operations", () => {
  it("insert/delete cycle over 50 keys: all slots preserved, all tombstoned", () => {
    const doc = new ObliviousAutomergeDoc("actor1");
    const N = 50;

    for (let i = 0; i < N; i++) {
      doc.putNew(key(`key${i}`), val(`val${i}`));
    }
    assert.strictEqual(doc.size, N, `after insert: should have ${N} slots`);

    for (let i = 0; i < N; i++) {
      doc.delete(key(`key${i}`));
    }
    assert.strictEqual(doc.size, N, "after delete: slot count unchanged (no compaction)");

    const state = doc.getMapState();
    for (let i = 0; i < N; i++) {
      const entry = findEntry(state, `key${i}`);
      assert.ok(entry, `entry for key${i} should exist`);
      assertDeleted(entry!, `key${i} should be tombstoned`);
    }
  });
});
