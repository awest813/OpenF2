/**
 * sfall global variables (sfall ScriptExtender.cpp globalVars).
 *
 * sfall keeps one table of 32-bit values. A variable is named either by a
 * number or by a string of exactly eight characters (whose bytes form the
 * key); other names are refused. Setting a variable to 0 removes it. Floats
 * are stored as their bit pattern, so get_sfall_global_int on a float
 * variable returns the raw bits and get_sfall_global_float reads them back.
 */

/** The sfall version reported by metarule(56, 0): major·1000000 + minor·1000 + patch. */
export const SFALL_VER = 4_000_000

const f32 = new Float32Array(1)
const i32 = new Int32Array(f32.buffer)

/** The 32-bit value sfall stores for a script value (ctx.arg(1).rawValue()). */
export function rawValue(value: unknown): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {return 0}
    if (Number.isInteger(value)) {return value | 0}
    f32[0] = value
    return i32[0]
}

/** A stored value read back as a float. */
export function rawToFloat(raw: number): number {
    i32[0] = raw | 0
    return f32[0]
}

/** Values by key: "#<n>" for numbered variables, the name for named ones. */
const globals: Map<string, number> = new Map()

function keyOf(name: unknown): string | null {
    if (typeof name === 'string') {return name.length === 8 ? name : null}
    return '#' + ((Number(name) | 0) >>> 0)
}

function store(key: string, raw: number): void {
    if (raw === 0) {globals.delete(key)}
    else {globals.set(key, raw)}
}

/** set_sfall_global by name: -1 (and nothing stored) unless the name has 8 characters. */
export function setSfallGlobal(name: string, value: unknown): number {
    const key = keyOf(String(name ?? ''))
    if (key === null) {return -1}
    store(key, rawValue(value))
    return 0
}

/** get_sfall_global_int by name: 0 for unset variables and names that are not 8 characters. */
export function getSfallGlobal(name: string): number {
    const key = keyOf(String(name ?? ''))
    return key === null ? 0 : globals.get(key) ?? 0
}

export function setSfallGlobalInt(index: number, value: unknown): void {
    store(keyOf(index)!, rawValue(value))
}

export function getSfallGlobalInt(index: number): number {
    return globals.get(keyOf(index)!) ?? 0
}

/** A variable by name or number, as the opcodes take either. */
export function getSfallGlobalAny(nameOrIndex: unknown): number {
    return typeof nameOrIndex === 'string' ? getSfallGlobal(nameOrIndex) : getSfallGlobalInt(Number(nameOrIndex))
}

export function setSfallGlobalAny(nameOrIndex: unknown, value: unknown): number {
    if (typeof nameOrIndex === 'string') {return setSfallGlobal(nameOrIndex, value)}
    setSfallGlobalInt(Number(nameOrIndex), value)
    return 0
}

export interface SerializedSfallGlobals {
    /** Named variables. */
    stringKeyed?: Record<string, number>
    /** Numbered variables. */
    intIndexed?: Record<number, number>
}

export function serializeSfallGlobals(): SerializedSfallGlobals {
    const stringKeyed: Record<string, number> = {}
    const intIndexed: Record<number, number> = {}
    for (const [k, v] of globals) {
        if (k.startsWith('#')) {intIndexed[Number(k.slice(1))] = v}
        else {stringKeyed[k] = v}
    }
    return { stringKeyed, intIndexed }
}

export function deserializeSfallGlobals(data: SerializedSfallGlobals): void {
    globals.clear()
    for (const [k, v] of Object.entries(data.stringKeyed ?? {})) {
        if (typeof v === 'number' && Number.isFinite(v)) {setSfallGlobal(k, v)}
    }
    for (const [k, v] of Object.entries(data.intIndexed ?? {})) {
        const idx = Number(k)
        if (Number.isInteger(idx) && typeof v === 'number' && Number.isFinite(v)) {setSfallGlobalInt(idx, v)}
    }
}

export function resetSfallGlobals(): void {
    globals.clear()
}
