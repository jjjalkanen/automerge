/**
 * Browser entrypoint — combines the oblivious automerge API with
 * the browser adapter (obliv_browser) and handle wiring.
 */
import { UseApi } from "../low_level.js"
import { ObliviousApi, setBrowserBackend } from "../oblivious_handle.js"
UseApi(ObliviousApi as any)

export * from "../index.js"
export { setBrowserBackend } from "../oblivious_handle.js"
export {
  initBrowserBackend,
  createObliviousInt,
  createObliviousString,
  createObliviousBool,
  isValid,
  eqInt,
  gtInt,
  eqString,
  gtString,
  cmov,
  makeSelectable,
  andBool,
  orBool,
  notBool,
  eq,
  gt,
} from "../obliv_browser.js"
export { renderObliviousText } from "../oblivious_render.js"
