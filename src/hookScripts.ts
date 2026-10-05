/**
 * sfall hook scripts (HookScripts.cpp, HookScripts/Common.cpp).
 *
 * A hook is an engine event scripts can watch and change. Each hook may
 * have an hs_<name>.int script (run from its start procedure) and global
 * scripts that register_hook / register_hook_proc for it. When the event
 * happens the engine sets the arguments, runs every attached script (the
 * last registered first) and reads back what they set with
 * set_sfall_return. Hooks can run inside hooks, up to eight deep.
 */

export const HOOK = {
    TOHIT: 0, AFTERHITROLL: 1, CALCAPCOST: 2, DEATHANIM1: 3, DEATHANIM2: 4, COMBATDAMAGE: 5, ONDEATH: 6,
    FINDTARGET: 7, USEOBJON: 8, REMOVEINVENOBJ: 9, BARTERPRICE: 10, MOVECOST: 11, HEXMOVEBLOCKING: 12,
    HEXAIBLOCKING: 13, HEXSHOOTBLOCKING: 14, HEXSIGHTBLOCKING: 15, ITEMDAMAGE: 16, AMMOCOST: 17, USEOBJ: 18,
    KEYPRESS: 19, MOUSECLICK: 20, USESKILL: 21, STEAL: 22, WITHINPERCEPTION: 23, INVENTORYMOVE: 24,
    INVENWIELD: 25, ADJUSTFID: 26, COMBATTURN: 27, CARTRAVEL: 28, SETGLOBALVAR: 29, RESTTIMER: 30,
    GAMEMODECHANGE: 31, USEANIMOBJ: 32, EXPLOSIVETIMER: 33, DESCRIPTIONOBJ: 34, USESKILLON: 35, ONEXPLOSION: 36,
    SUBCOMBATDAMAGE: 37, SETLIGHTING: 38, SNEAK: 39, STDPROCEDURE: 40, STDPROCEDURE_END: 41, TARGETOBJECT: 42,
    ENCOUNTER: 43, ADJUSTPOISON: 44, ADJUSTRADS: 45, ROLLCHECK: 46, BESTWEAPON: 47, CANUSEWEAPON: 48,
    BUILDSFXWEAPON: 61,
} as const

export const HOOK_COUNT = 62

/** The hs_*.int file of each hook (the Init*HookScripts lists). */
/** sfall's RMOBJ_* reasons for HOOK_REMOVEINVENOBJ (the engine call sites' addresses). */
export const RMOBJ_ITEM_REMOVED_INVEN = 4831349
export const RMOBJ_ITEM_REMOVED = 4548572
export const RMOBJ_ITEM_REMOVED_MULTI = 4563866
export const RMOBJ_ITEM_DESTROYED = 4543215
export const RMOBJ_ITEM_DESTROY_MULTI = 4571599
export const RMOBJ_ITEM_MOVE = 4683293
export const RMOBJ_CONSUME_DRUG = 4666772
export const RMOBJ_AI_USE_DRUG_ON = 4359920
export const RMOBJ_USE_OBJ = 4666865
export const RMOBJ_INVEN_DROP_ALL_CAPS = 4683864
export const RMOBJ_INVEN_DROP_ALL_ITEM = 4684069
export const RMOBJ_THROW = 4266040

export const HOOK_FILES: Record<number, string> = {
    0: 'hs_tohit', 1: 'hs_afterhitroll', 2: 'hs_calcapcost', 3: 'hs_deathanim1', 4: 'hs_deathanim2',
    5: 'hs_combatdamage', 6: 'hs_ondeath', 7: 'hs_findtarget', 8: 'hs_useobjon', 9: 'hs_removeinvenobj',
    10: 'hs_barterprice', 11: 'hs_movecost', 12: 'hs_hexmoveblocking', 13: 'hs_hexaiblocking',
    14: 'hs_hexshootblocking', 15: 'hs_hexsightblocking', 16: 'hs_itemdamage', 17: 'hs_ammocost', 18: 'hs_useobj',
    19: 'hs_keypress', 20: 'hs_mouseclick', 21: 'hs_useskill', 22: 'hs_steal', 23: 'hs_withinperception',
    24: 'hs_inventorymove', 25: 'hs_invenwield', 26: 'hs_adjustfid', 27: 'hs_combatturn', 28: 'hs_cartravel',
    29: 'hs_setglobalvar', 30: 'hs_resttimer', 31: 'hs_gamemodechange', 32: 'hs_useanimobj',
    33: 'hs_explosivetimer', 34: 'hs_descriptionobj', 35: 'hs_useskillon', 36: 'hs_onexplosion',
    37: 'hs_subcombatdmg', 38: 'hs_setlighting', 39: 'hs_sneak', 40: 'hs_stdprocedure', 41: 'hs_stdprocedure',
    42: 'hs_targetobject', 43: 'hs_encounter', 44: 'hs_adjustpoison', 45: 'hs_adjustrads', 46: 'hs_rollcheck',
    47: 'hs_bestweapon', 48: 'hs_canuseweapon', 61: 'hs_buildsfxweapon',
}

interface HookEntry {
    script: any
    /** The procedure register_hook_proc named; null runs the script's start. */
    callback: string | null
    isGlobalScript: boolean
}

const MAX_ARGS = 16
const MAX_RETS = 8
const MAX_DEPTH = 8

const hooks: HookEntry[][] = Array.from({ length: HOOK_COUNT }, () => [])
const hasHsScript: boolean[] = new Array(HOOK_COUNT).fill(false)

interface HookState {
    hook: number
    args: unknown[]
    cArg: number
    rets: unknown[]
    cRetTmp: number
    allowNonIntReturn: boolean
}

let current: HookState | null = null
const saved: HookState[] = []
let depth = 0

/** init_hook: 1 while the hs_* scripts first run (at game start or load). */
let initing = 0

export function initingHookScripts(): number {
    return initing
}

export function hookHasScript(hook: number): boolean {
    return (hooks[hook]?.length ?? 0) > 0
}

/** HookScriptClear: before a game starts or loads. */
export function clearHookScripts(): void {
    for (const list of hooks) {list.length = 0}
    hasHsScript.fill(false)
    current = null
    saved.length = 0
    depth = 0
}

/**
 * InitHookScripts: load each hook's hs_*.int there is, then run each once
 * (its start, with init_hook 1) so it can set itself up.
 */
export function startHookScripts(names: readonly string[], load: (name: string) => any): void {
    clearHookScripts()
    const available = new Set(names.map((n) => n.toLowerCase()))
    const loaded = new Map<string, any>()
    for (const [id, file] of Object.entries(HOOK_FILES)) {
        if (!available.has(file)) {continue}
        let script = loaded.get(file)
        if (script === undefined) {
            try {
                script = load(file) ?? null
            } catch (e) {
                console.warn('[sfall] could not load hook script ' + file + ':', e)
                script = null
            }
            loaded.set(file, script)
        }
        if (script) {hooks[Number(id)].push({ script, callback: null, isGlobalScript: false })}
    }
    initing = 1
    const started = new Set<any>()
    for (let id = 0; id < HOOK_COUNT; id++) {
        if (hooks[id].length === 0) {continue}
        hasHsScript[id] = true
        // hs_stdprocedure serves two hooks; it starts once.
        if (started.has(hooks[id][0].script)) {continue}
        started.add(hooks[id][0].script)
        runEntry(hooks[id][0])
    }
    initing = 0
}

/**
 * RegisterHook: a global script attaches itself (its start, or a
 * procedure), or with procedure 0 detaches. register_hook_proc_spec puts
 * it first in line instead of last.
 */
export function registerHook(script: any, hook: number, callback: string | null, unregister: boolean, first = false): void {
    if (!(hook >= 0 && hook < HOOK_COUNT) || HOOK_FILES[hook] === undefined) {return}
    const list = hooks[hook]
    const at = list.findIndex((e) => e.script === script)
    if (at >= 0) {
        if (unregister) {list.splice(at, 1)}
        return
    }
    if (unregister) {return}
    const entry: HookEntry = { script, callback, isGlobalScript: true }
    if (first) {list.unshift(entry)}
    else {list.push(entry)}
}

function runEntry(entry: HookEntry): void {
    if (current) {
        current.cArg = 0
        current.cRetTmp = 0
    }
    const fn = entry.callback ? entry.script?.[entry.callback] : entry.script?.start
    if (typeof fn !== 'function') {return}
    try {
        fn.call(entry.script)
    } catch (e) {
        console.warn('[sfall] hook script failed:', e)
    }
}

/**
 * Run a hook: BeginHook, the attached scripts last to first, EndHook.
 * Returns what the scripts set with set_sfall_return (none: no change),
 * or null when nothing is attached. `args` may be changed by set_sfall_arg;
 * the final values are in the result too.
 */
export function runHook(hook: number, args: unknown[], opts: { allowNonIntReturn?: boolean; noRecursion?: boolean } = {}):
    { rets: unknown[]; args: unknown[] } | null {
    const list = hooks[hook]
    if (!list || list.length === 0) {return null}
    if (depth >= MAX_DEPTH) {return null}
    if (opts.noRecursion && current?.hook === hook) {return null}
    if (current) {saved.push(current)}
    depth++
    current = {
        hook, args: args.slice(0, MAX_ARGS), cArg: 0, rets: [], cRetTmp: 0,
        allowNonIntReturn: opts.allowNonIntReturn === true,
    }
    const state = current
    try {
        for (let i = list.length - 1; i >= 0; i--) {runEntry(list[i])}
    } finally {
        depth--
        current = saved.pop() ?? null
    }
    return { rets: state.rets, args: state.args }
}

/** HOOK procedures for map events: each hs_* script also gets them (RunHookScriptsAtProc). */
export function runHookScriptsAtProc(procName: string): void {
    for (let id = 0; id < HOOK_COUNT; id++) {
        if (!hasHsScript[id]) {continue}
        const script = hooks[id][0]?.script
        const fn = script?.[procName]
        if (typeof fn === 'function') {
            try {
                fn.call(script)
            } catch (e) {
                console.warn('[sfall] hook script failed in ' + procName + ':', e)
            }
        }
    }
}

// ── the script side (get_sfall_arg and friends) ──

export function getHookArg(): unknown {
    if (!current || current.cArg >= current.args.length) {return 0}
    return current.args[current.cArg++] ?? 0
}

export function getHookArgAt(index: number): unknown {
    if (!current || !(index >= 0 && index < current.args.length)) {return 0}
    return current.args[index] ?? 0
}

export function getHookArgs(): unknown[] {
    return current ? current.args.slice() : []
}

export function hookArgCount(): number {
    return current?.args.length ?? 0
}

export function setHookArg(index: number, value: unknown): void {
    if (current && index >= 0 && index < current.args.length) {current.args[index] = value}
}

/** SetHSReturn: ints only, unless the hook takes other values. */
export function setHookReturn(value: unknown): void {
    if (!current) {return}
    const isInt = typeof value === 'number' && Number.isInteger(value)
    if (!current.allowNonIntReturn && !isInt) {return}
    if (current.cRetTmp < MAX_RETS) {current.rets[current.cRetTmp++] = value}
}

/** The first return value as a number, or `fallback` when none was set. */
export function hookReturn(result: { rets: unknown[] } | null, index: number, fallback: number): number {
    const v = result?.rets[index]
    return typeof v === 'number' ? v : fallback
}

/**
 * sfall HOOK_TARGETOBJECT: event 0 as the crosshair hovers, 1 on attacking.
 * Returns the (possibly replaced) target, or null when a script refused it.
 */
export function targetObjectHook<T extends { dead?: boolean }>(event: number, target: T): T | null {
    const result = runHook(HOOK.TARGETOBJECT, [event, target && !target.dead ? 1 : 0, target], { allowNonIntReturn: true })
    if (!result || result.rets.length === 0) {return target}
    const r = result.rets[0]
    if (r === -1) {return null}
    return r && typeof r === 'object' ? r as T : target
}

/** HOOK_INVENTORYMOVE target slots. */
export const INVMOVE = { BACKPACK: 0, LEFT_HAND: 1, RIGHT_HAND: 2, ARMOR: 3, WEAPON_RELOAD: 4, CONTAINER: 5, DROP: 6, PICKUP: 7, PORTRAIT: 8 }

/** sfall HOOK_INVENTORYMOVE: true when a script refused the move (any return but -1). */
export function inventoryMoveBlocked(slot: number, item: unknown, replaced: unknown = 0): boolean {
    const result = runHook(HOOK.INVENTORYMOVE, [slot, item, replaced ?? 0])
    return !!result && result.rets.length > 0 && hookReturn(result, 0, -1) !== -1
}
