/**
 * Oblivious utilities for Automerge's proxy system.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

let oc: any;

export function initBrowserBackend(obliviousNamespace: any): void {
  oc = obliviousNamespace;
}

export function makeSelectable(arr: any): any {
  if (arr && typeof arr === "object" && !arr.oblivSelect) {
    arr.oblivSelect = function (cond: any, other: any): any {
      return oc.cmovArray(cond, this, other);
    };
  }
  return arr;
}
