import { describe, it } from "node:test"
import * as Automerge from "../src/entrypoints/oblivious.js"
import { createObliviousString, eqString } from "obliv-core"
import { isOblivTrue } from "obliv-core/testing"
import assert from "assert"

const s = (v: string) => createObliviousString(v)
const eq = (a: any, b: string) =>
  assert.ok(isOblivTrue(eqString(a, s(b))), `expected "${b}"`)

describe("ObliviousAutomerge — list / text editing", () => {
  it("creates an empty list", () => {
    let doc = Automerge.init()
    doc = Automerge.change(doc, d => {
      ;(d as any).chars = []
    })
    assert.strictEqual((doc as any).chars.length, 0)
  })

  it("inserts characters with insertAt", () => {
    let doc = Automerge.init()
    doc = Automerge.change(doc, d => {
      ;(d as any).chars = []
    })
    doc = Automerge.change(doc, d => {
      ;(d as any).chars.insertAt(0, s("h"))
      ;(d as any).chars.insertAt(1, s("i"))
    })
    assert.strictEqual((doc as any).chars.length, 2)
    eq((doc as any).chars[0], "h")
    eq((doc as any).chars[1], "i")
  })

  it("pushes characters", () => {
    let doc = Automerge.init()
    doc = Automerge.change(doc, d => {
      ;(d as any).chars = []
    })
    doc = Automerge.change(doc, d => {
      ;(d as any).chars.push(s("a"))
      ;(d as any).chars.push(s("b"))
      ;(d as any).chars.push(s("c"))
    })
    assert.strictEqual((doc as any).chars.length, 3)
    eq((doc as any).chars[0], "a")
    eq((doc as any).chars[1], "b")
    eq((doc as any).chars[2], "c")
  })

  it("deletes a character with deleteAt", () => {
    let doc = Automerge.init()
    doc = Automerge.change(doc, d => {
      ;(d as any).chars = []
    })
    doc = Automerge.change(doc, d => {
      ;(d as any).chars.push(s("a"), s("b"), s("c"))
    })
    doc = Automerge.change(doc, d => {
      ;(d as any).chars.deleteAt(1, 1)
    })
    assert.strictEqual((doc as any).chars.length, 2)
    eq((doc as any).chars[0], "a")
    eq((doc as any).chars[1], "c")
  })

  it("replaces a character by index assignment", () => {
    let doc = Automerge.init()
    doc = Automerge.change(doc, d => {
      ;(d as any).chars = []
    })
    doc = Automerge.change(doc, d => {
      ;(d as any).chars.push(s("a"), s("b"))
    })
    doc = Automerge.change(doc, d => {
      ;(d as any).chars[0] = s("X")
    })
    eq((doc as any).chars[0], "X")
    eq((doc as any).chars[1], "b")
  })

  it("handles multiple edits in one change", () => {
    let doc = Automerge.init()
    doc = Automerge.change(doc, d => {
      ;(d as any).chars = []
    })
    doc = Automerge.change(doc, d => {
      const c = (d as any).chars
      c.push(s("h"), s("e"), s("l"), s("l"), s("o"))
      c.deleteAt(4, 1)
      c.insertAt(0, s("!"))
      c[1] = s("H")
    })
    assert.strictEqual((doc as any).chars.length, 5)
    eq((doc as any).chars[0], "!")
    eq((doc as any).chars[1], "H")
  })

  it("deletes a range with deleteAt", () => {
    let doc = Automerge.init()
    doc = Automerge.change(doc, d => {
      ;(d as any).chars = []
    })
    doc = Automerge.change(doc, d => {
      ;(d as any).chars.push(s("a"), s("b"), s("c"), s("d"), s("e"))
    })
    doc = Automerge.change(doc, d => {
      ;(d as any).chars.deleteAt(1, 3)
    })
    assert.strictEqual((doc as any).chars.length, 2)
    eq((doc as any).chars[0], "a")
    eq((doc as any).chars[1], "e")
  })

  it("splice inserts and deletes", () => {
    let doc = Automerge.init()
    doc = Automerge.change(doc, d => {
      ;(d as any).chars = []
    })
    doc = Automerge.change(doc, d => {
      ;(d as any).chars.push(s("a"), s("b"), s("c"))
    })
    doc = Automerge.change(doc, d => {
      ;(d as any).chars.splice(1, 1, s("X"), s("Y"))
    })
    assert.strictEqual((doc as any).chars.length, 4)
    eq((doc as any).chars[0], "a")
    eq((doc as any).chars[1], "X")
    eq((doc as any).chars[2], "Y")
    eq((doc as any).chars[3], "c")
  })

  it("fork preserves list contents", () => {
    let doc = Automerge.init()
    doc = Automerge.change(doc, d => {
      ;(d as any).chars = []
    })
    doc = Automerge.change(doc, d => {
      ;(d as any).chars.push(s("a"), s("b"))
    })
    const forked = Automerge.clone(doc)
    assert.strictEqual((forked as any).chars.length, 2)
    eq((forked as any).chars[0], "a")
    eq((forked as any).chars[1], "b")
  })

  it("length tracks inserts and deletes", () => {
    let doc = Automerge.init()
    doc = Automerge.change(doc, d => {
      ;(d as any).chars = []
    })
    assert.strictEqual((doc as any).chars.length, 0)
    doc = Automerge.change(doc, d => {
      ;(d as any).chars.push(s("a"))
    })
    assert.strictEqual((doc as any).chars.length, 1)
    doc = Automerge.change(doc, d => {
      ;(d as any).chars.push(s("b"), s("c"))
    })
    assert.strictEqual((doc as any).chars.length, 3)
    doc = Automerge.change(doc, d => {
      ;(d as any).chars.deleteAt(0, 1)
    })
    assert.strictEqual((doc as any).chars.length, 2)
  })
})
