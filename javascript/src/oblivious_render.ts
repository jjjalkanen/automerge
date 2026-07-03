/**
 * oblivious_render — Bridge from automerge's character list to <securetext>.
 *
 * Packs a list of ObliviousString characters (each a 2-byte UTF-16
 * ObliviousByteArray) into a single ObliviousByteArray, encrypts via
 * toBase64(), and sets the result as a <securetext> element's value.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

interface ObliviousAPI {
  concatArrays(a: any, b: any): any;
  sliceArray(src: any, start: number, end: number): any;
  createByteArray(length: number): any;
}

/**
 * Render a list of oblivious single-character strings into a <securetext>
 * element. Each character is an ObliviousByteArray of 2 bytes (one UTF-16
 * code unit).
 *
 * @param chars  Array of ObliviousByteArray values (2 bytes each)
 * @param element  A <securetext> DOM element
 * @param oc  The window.oblivious namespace
 */
export function renderObliviousText(
  chars: any[],
  element: HTMLElement,
  oc: ObliviousAPI,
): void {
  if (chars.length === 0) {
    (element as any).value = "";
    return;
  }

  // Concatenate all character byte arrays into one, stripping validity byte
  let combined = oc.sliceArray(chars[0], 1, chars[0].length);
  for (let i = 1; i < chars.length; i++) {
    const charData = oc.sliceArray(chars[i], 1, chars[i].length);
    combined = oc.concatArrays(combined, charData);
  }

  // Encrypt and set as securetext value
  (element as any).value = combined.toBase64();
}
