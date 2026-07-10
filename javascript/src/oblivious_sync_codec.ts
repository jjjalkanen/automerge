/* eslint-disable @typescript-eslint/no-explicit-any */

export interface SyncMessageData {
  heads: Uint8Array[]
  need: Uint8Array[]
  have: { lastSync: Uint8Array[]; bloom: Uint8Array }[]
  changes: Uint8Array[]
}

const MESSAGE_TYPE_V1 = 0x42

export function encodeLEB128(value: number): number[] {
  const bytes: number[] = []
  do {
    let byte = value & 0x7f
    value >>>= 7
    if (value !== 0) byte |= 0x80
    bytes.push(byte)
  } while (value !== 0)
  return bytes
}

export function decodeLEB128(
  data: Uint8Array,
  offset: number,
): [number, number] {
  let result = 0
  let shift = 0
  let pos = offset
  while (pos < data.length) {
    const byte = data[pos]
    result |= (byte & 0x7f) << shift
    pos++
    if ((byte & 0x80) === 0) break
    shift += 7
  }
  return [result, pos]
}

export function encodeSyncMessage(msg: SyncMessageData): Uint8Array {
  const parts: number[] = [MESSAGE_TYPE_V1]

  parts.push(...encodeLEB128(msg.heads.length))
  for (const hash of msg.heads) {
    for (let i = 0; i < hash.length; i++) parts.push(hash[i])
  }

  parts.push(...encodeLEB128(msg.need.length))
  for (const hash of msg.need) {
    for (let i = 0; i < hash.length; i++) parts.push(hash[i])
  }

  parts.push(...encodeLEB128(msg.have.length))
  for (const have of msg.have) {
    parts.push(...encodeLEB128(have.lastSync.length))
    for (const hash of have.lastSync) {
      for (let i = 0; i < hash.length; i++) parts.push(hash[i])
    }
    parts.push(...encodeLEB128(have.bloom.length))
    for (let i = 0; i < have.bloom.length; i++) parts.push(have.bloom[i])
  }

  parts.push(...encodeLEB128(msg.changes.length))
  for (const change of msg.changes) {
    parts.push(...encodeLEB128(change.length))
    for (let i = 0; i < change.length; i++) parts.push(change[i])
  }

  return new Uint8Array(parts)
}

export function decodeSyncMessage(data: Uint8Array): SyncMessageData {
  let pos = 0

  const msgType = data[pos++]
  if (msgType !== MESSAGE_TYPE_V1) {
    throw new Error(`unknown sync message type: 0x${msgType.toString(16)}`)
  }

  let count: number

  ;[count, pos] = decodeLEB128(data, pos)
  const heads: Uint8Array[] = []
  for (let i = 0; i < count; i++) {
    heads.push(data.slice(pos, pos + 32))
    pos += 32
  }

  ;[count, pos] = decodeLEB128(data, pos)
  const need: Uint8Array[] = []
  for (let i = 0; i < count; i++) {
    need.push(data.slice(pos, pos + 32))
    pos += 32
  }

  ;[count, pos] = decodeLEB128(data, pos)
  const have: SyncMessageData["have"] = []
  for (let i = 0; i < count; i++) {
    let syncCount: number
    ;[syncCount, pos] = decodeLEB128(data, pos)
    const lastSync: Uint8Array[] = []
    for (let j = 0; j < syncCount; j++) {
      lastSync.push(data.slice(pos, pos + 32))
      pos += 32
    }
    let bloomLen: number
    ;[bloomLen, pos] = decodeLEB128(data, pos)
    const bloom = data.slice(pos, pos + bloomLen)
    pos += bloomLen
    have.push({ lastSync, bloom })
  }

  ;[count, pos] = decodeLEB128(data, pos)
  const changes: Uint8Array[] = []
  for (let i = 0; i < count; i++) {
    let changeLen: number
    ;[changeLen, pos] = decodeLEB128(data, pos)
    changes.push(data.slice(pos, pos + changeLen))
    pos += changeLen
  }

  return { heads, need, have, changes }
}

export function hexEncode(data: Uint8Array): string {
  return Array.from(data)
    .map(b => b.toString(16).padStart(2, "0"))
    .join("")
}

export function hexDecode(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}
