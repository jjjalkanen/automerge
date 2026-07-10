/**
 * Browser entrypoint — combines the oblivious automerge API with
 * the browser adapter and handle wiring.
 */
import { UseApi } from "../low_level.js"
import { ObliviousApi, setBrowserBackend } from "../oblivious_handle.js"
UseApi(ObliviousApi as any)

export * from "../index.js"
export { setBrowserBackend, setSerializer, type ObliviousValueSerializer } from "../oblivious_handle.js"
export {
  initBrowserBackend,
  makeSelectable,
} from "../oblivious_utils.js"
export { renderObliviousText } from "../oblivious_render.js"
export {
  decodeSyncMessage as decodeSyncMessageRaw,
} from "../oblivious_sync_codec.js"
