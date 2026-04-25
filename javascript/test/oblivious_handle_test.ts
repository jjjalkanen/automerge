/**
 * ObliviousHandle integration tests.
 *
 * Simulates the production flow: the client encrypts values *before* passing
 * them to Automerge, verifies that the materialized doc contains the expected
 * encrypted values, and decrypts on the way out.
 *
 * Automerge code (proxies, implementation) never imports obliv-core.
 * Only this test file — standing in for the client — does.
 */
import { describe, it } from "node:test"
import * as Automerge from "../src/entrypoints/oblivious.js"
import { createObliviousString, eqString } from "obliv-core"
import { isOblivTrue } from "obliv-core/testing"
import assert from "assert"

describe("ObliviousAutomerge", () => {
  it("init creates an empty doc", () => {
    const doc = Automerge.init()
    assert.deepEqual(Object.keys(doc), [])
  })

  it("handles basic set and read on the root object", () => {
    // Simulate pre-encrypted inputs — in production these come from the
    // browser's encrypted-input API.
    const encKey1 = "enc_hello"
    const encVal1 = createObliviousString("world")
    const encKey2 = "enc_big"
    const encVal2 = createObliviousString("little")

    let doc = Automerge.init()
    doc = Automerge.change(doc, d => {
      d[encKey1] = encVal1
      d[encKey2] = encVal2
    })

    // Materialized doc: encrypted keys as property names, encrypted values as
    // property values.  The client decrypts on read; Automerge never inspects
    // the contents.
    assert.ok(isOblivTrue(eqString(doc[encKey1], createObliviousString("world"))))
    assert.ok(isOblivTrue(eqString(doc[encKey2], createObliviousString("little"))))
  })

  it("handles overwrites to values", () => {
    const encKey = "enc_hello"
    let doc = Automerge.init()
    doc = Automerge.change(doc, d => {
      d[encKey] = createObliviousString("world1")
    })
    doc = Automerge.change(doc, d => {
      d[encKey] = createObliviousString("world2")
    })
    assert.ok(
      isOblivTrue(eqString(doc[encKey], createObliviousString("world2")))
    )
  })

  it("read-back inside change callback returns the encrypted value", () => {
    const encKey = "enc_hello"
    const encVal = createObliviousString("world")
    let readBack: unknown
    let doc = Automerge.init()
    doc = Automerge.change(doc, d => {
      d[encKey] = encVal
      readBack = d[encKey]
    })
    // The value read back inside the callback is the same encrypted object.
    assert.ok(isOblivTrue(eqString(readBack as any, createObliviousString("world"))))
  })

  it("keys() returns all encrypted key strings", () => {
    let doc = Automerge.init()
    doc = Automerge.change(doc, d => {
      d["enc_a"] = createObliviousString("alpha")
      d["enc_b"] = createObliviousString("beta")
    })
    const keys = Object.keys(doc).sort()
    assert.deepEqual(keys, ["enc_a", "enc_b"])
  })

  it("delete removes a key", () => {
    let doc = Automerge.init()
    doc = Automerge.change(doc, d => {
      d["enc_a"] = createObliviousString("alpha")
      d["enc_b"] = createObliviousString("beta")
    })
    doc = Automerge.change(doc, d => {
      delete d["enc_a"]
    })
    const keys = Object.keys(doc).sort()
    assert.deepEqual(keys, ["enc_b"])
  })
})
