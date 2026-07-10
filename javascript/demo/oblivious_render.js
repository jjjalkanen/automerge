/**
 * oblivious_render — Bridge from automerge's character list to <securetext>.
 *
 * Packs a list of ObliviousString characters (each a 2-byte UTF-16
 * ObliviousByteArray) into a single ObliviousByteArray, encrypts via
 * toBase64(), and sets the result as a <securetext> element's value.
 */
/**
 * Render a list of oblivious single-character strings into a <securetext>
 * element. Each character is an ObliviousByteArray of 2 bytes (one UTF-16
 * code unit).
 *
 * @param chars  Array of ObliviousByteArray values (2 bytes each)
 * @param element  A <securetext> DOM element
 * @param oc  The window.oblivious namespace
 */
export function renderObliviousText(chars, element, oc) {
    if (chars.length === 0) {
        element.value = "";
        return;
    }
    // Concatenate all character byte arrays INCLUDING validity bytes.
    // Each char is [validity(1), utf16_lo, utf16_hi] — 3 bytes.
    // securetext's C++ rendering drops entries where validity == 0.
    let combined = chars[0];
    for (let i = 1; i < chars.length; i++) {
        combined = oc.concatArrays(combined, chars[i]);
    }
    // Encrypt and set as securetext value
    element.value = combined.toBase64();
}
