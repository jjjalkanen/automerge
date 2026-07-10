/**
 * Oblivious utilities for Automerge's proxy system.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
let oc;
export function initBrowserBackend(obliviousNamespace) {
    oc = obliviousNamespace;
}
export function makeSelectable(arr) {
    if (arr && typeof arr === "object" && !arr.oblivSelect) {
        arr.oblivSelect = function (cond, other) {
            return oc.cmovArray(cond, this, other);
        };
    }
    return arr;
}
