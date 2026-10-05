/**
 * sfall arrays (fallout2-ce sfall_arrays.cc). Scripts refer to arrays by a
 * number. A list holds a fixed number of slots; an associative array (made
 * with a negative size, or the assoc flag) holds key/value pairs, and
 * setting a key to 0 removes it. Temporary arrays are freed at the end of
 * the frame unless fixed. Strings are cut to 254 characters, and no array
 * grows past 100 000 elements.
 */

export type ArrayValue = number | string | object | null

export const ARRAYFLAG_ASSOC = 1
export const ARRAYFLAG_CONSTVAL = 2
export const ARRAYFLAG_RESERVED = 4

const ARRAY_MAX_STRING = 255
const ARRAY_MAX_SIZE = 100000

const ACTION_SORT = -2
const ACTION_RSORT = -3
const ACTION_REVERSE = -4
const ACTION_SHUFFLE = -5

function clean(value: unknown): ArrayValue {
    if (typeof value === 'string') {return value.length >= ARRAY_MAX_STRING ? value.slice(0, ARRAY_MAX_STRING - 1) : value}
    if (typeof value === 'number') {return Number.isFinite(value) ? value : 0}
    if (value && typeof value === 'object') {return value}
    return 0
}

/** ArrayElement ordering: ints/floats, then strings, then objects, each in its own order. */
function typeRank(v: ArrayValue): number {
    if (typeof v === 'number') {return 0}
    if (typeof v === 'string') {return 2}
    return 3
}

function compare(a: ArrayValue, b: ArrayValue): number {
    const ra = typeRank(a)
    const rb = typeRank(b)
    if (ra !== rb) {return ra - rb}
    if (typeof a === 'number' && typeof b === 'number') {return a - b}
    if (typeof a === 'string' && typeof b === 'string') {return a < b ? -1 : a > b ? 1 : 0}
    return 0
}

function same(a: ArrayValue, b: ArrayValue): boolean {
    return typeRank(a) === typeRank(b) && a === b
}

function listSort<T>(arr: T[], type: number, cmp: (a: T, b: T) => number): void {
    switch (type) {
        case ACTION_SORT:
            arr.sort(cmp)
            break
        case ACTION_RSORT:
            arr.sort((a, b) => cmp(b, a))
            break
        case ACTION_REVERSE:
            arr.reverse()
            break
        case ACTION_SHUFFLE:
            for (let i = arr.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1))
                ;[arr[i], arr[j]] = [arr[j], arr[i]]
            }
            break
    }
}

export class SfallArray {
    readonly assoc: boolean
    values: ArrayValue[] = []
    keys: ArrayValue[] = []

    constructor(len: number, readonly flags: number) {
        this.assoc = (flags & ARRAYFLAG_ASSOC) !== 0
        if (!this.assoc) {this.values = new Array(len).fill(0)}
    }

    get size(): number {
        return this.values.length
    }

    get readOnly(): boolean {
        return (this.flags & ARRAYFLAG_CONSTVAL) !== 0
    }

    /** array_key: the key at an index; index −1 tells whether it is associative. */
    keyAt(index: number): ArrayValue {
        if (index < -1 || index > this.size) {return 0}
        if (index === -1) {return this.assoc ? 1 : 0}
        return this.assoc ? (this.keys[index] ?? 0) : index
    }

    get(key: unknown): ArrayValue {
        if (!this.assoc) {
            const i = Math.trunc(Number(key))
            return i >= 0 && i < this.size ? this.values[i] : 0
        }
        const k = clean(key)
        const i = this.keys.findIndex((x) => same(x, k))
        return i < 0 ? 0 : this.values[i]
    }

    set(key: unknown, value: unknown, allowUnset: boolean): void {
        if (!this.assoc) {
            if (typeof key !== 'number') {return}
            const i = Math.trunc(key)
            if (i >= 0 && i < this.size) {this.values[i] = clean(value)}
            return
        }
        const k = clean(key)
        const i = this.keys.findIndex((x) => same(x, k))
        if (i >= 0 && this.readOnly) {return}
        if (allowUnset && !this.readOnly && value === 0) {
            if (i >= 0) {
                this.keys.splice(i, 1)
                this.values.splice(i, 1)
            }
            return
        }
        if (i < 0) {
            if (this.size >= ARRAY_MAX_SIZE) {return}
            this.keys.push(k)
            this.values.push(clean(value))
        } else {
            this.values[i] = clean(value)
        }
    }

    resize(newLen: number): void {
        if (newLen === -1 || this.size === newLen) {return}
        if (!this.assoc) {
            if (newLen === 0) {this.values = []}
            else if (newLen > 0) {
                const len = Math.min(newLen, ARRAY_MAX_SIZE)
                if (len < this.size) {this.values.length = len}
                else {while (this.values.length < len) {this.values.push(0)}}
            } else if (newLen >= ACTION_SHUFFLE) {
                listSort(this.values, newLen, compare)
            }
            return
        }
        if (newLen >= 0 && newLen < this.size) {
            this.keys.length = newLen
            this.values.length = newLen
        } else if (newLen < 0) {
            if (newLen < ACTION_SHUFFLE - 2) {return}
            let type = newLen
            let byValue = false
            if (type < ACTION_SHUFFLE) {
                type += 4
                byValue = true
            }
            const pairs = this.keys.map((k, i) => [k, this.values[i]] as [ArrayValue, ArrayValue])
            listSort(pairs, type, (a, b) => (byValue ? compare(a[1], b[1]) : compare(a[0], b[0])))
            this.keys = pairs.map((p) => p[0])
            this.values = pairs.map((p) => p[1])
        }
    }

    /** scan_array: the index (list) or key (associative) of a value, or −1. */
    scan(value: unknown): ArrayValue {
        const v = clean(value)
        const i = this.values.findIndex((x) => same(x, v))
        if (i < 0) {return -1}
        return this.assoc ? this.keys[i] : i
    }
}

const arrays = new Map<number, SfallArray>()
const temporary = new Set<number>()
const saved = new Map<string, number>()
let nextId = 1

export function resetSfallArrays(): void {
    arrays.clear()
    temporary.clear()
    saved.clear()
    nextId = 1
}

export function createArray(len: number, flags: number): number {
    flags &= ~1
    if (len < 0) {flags |= ARRAYFLAG_ASSOC}
    else if (len > ARRAY_MAX_SIZE) {len = ARRAY_MAX_SIZE}
    const id = nextId++
    arrays.set(id, new SfallArray(Math.max(0, len), flags))
    return id
}

export function createTempArray(len: number, flags: number): number {
    const id = createArray(len, flags)
    temporary.add(id)
    return id
}

export function getArray(id: number): SfallArray | undefined {
    return arrays.get(id)
}

export function lenArray(id: number): number {
    return arrays.get(id)?.size ?? -1
}

export function freeArray(id: number): void {
    arrays.delete(id)
    temporary.delete(id)
    for (const [key, value] of saved) {if (value === id) {saved.delete(key)}}
}

export function fixArray(id: number): void {
    temporary.delete(id)
}

/** DeleteAllTempArrays: run once a frame. */
export function deleteTempArrays(): void {
    for (const id of temporary) {arrays.delete(id)}
    temporary.clear()
}

/** arrayexpr: the compiler's array literal — sets a slot of the last array made, growing it. */
export function stackArray(key: unknown, value: unknown): number {
    const arr = arrays.get(nextId - 1)
    if (!arr) {return 0}
    if (arr.size >= ARRAY_MAX_SIZE) {return 0}
    if (!arr.assoc && typeof key === 'number' && key >= arr.size) {arr.resize(arr.size + 1)}
    arr.set(key, value, false)
    return 0
}

/** string_split: a temporary list of the pieces (single characters for an empty separator). */
export function stringSplit(str: string, sep: string): number {
    const pieces = sep === '' ? [...str] : str.split(sep)
    const id = createTempArray(pieces.length, 0)
    const arr = arrays.get(id)!
    pieces.forEach((p, i) => arr.set(i, p, false))
    return id
}

/** A temporary list holding `items`. */
export function arrayOf(items: readonly unknown[], flags = 0): number {
    const id = createTempArray(items.length, flags)
    const arr = arrays.get(id)!
    items.forEach((v, i) => arr.set(i, v, false))
    return id
}

/** save_array(key, id): keep the array across saves under a key; load_array(key) finds it again. */
export function saveArray(key: unknown, id: number): void {
    if (!arrays.has(id)) {return}
    fixArray(id)
    saved.set(String(key), id)
}

export function loadArray(key: unknown): number {
    return saved.get(String(key)) ?? 0
}

export interface SerializedSfallArrays {
    next: number
    arrays: Array<{ id: number; flags: number; keys: ArrayValue[]; values: ArrayValue[] }>
    saved: Array<[string, number]>
}

/** Saved arrays survive a save (objects inside them do not). */
export function serializeSfallArrays(): SerializedSfallArrays {
    const ids = new Set(saved.values())
    const plain = (v: ArrayValue) => (v && typeof v === 'object' ? 0 : v)
    return {
        next: nextId,
        arrays: [...ids].filter((id) => arrays.has(id)).map((id) => {
            const a = arrays.get(id)!
            return { id, flags: a.flags, keys: a.keys.map(plain), values: a.values.map(plain) }
        }),
        saved: [...saved.entries()],
    }
}

export function deserializeSfallArrays(data: SerializedSfallArrays | null | undefined): void {
    resetSfallArrays()
    if (!data || !Array.isArray(data.arrays)) {return}
    for (const a of data.arrays) {
        const arr = new SfallArray(0, a.flags)
        arr.keys = [...(a.keys ?? [])]
        arr.values = [...(a.values ?? [])]
        arrays.set(a.id, arr)
    }
    for (const [key, id] of data.saved ?? []) {saved.set(key, id)}
    nextId = Math.max(1, data.next ?? 1)
}
