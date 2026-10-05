/**
 * sfall global scripts (ScriptExtender.cpp): every scripts/gl*.int that is
 * not a game script is loaded once the game has started, its start
 * procedure run, and then run again every `repeat` frames of the loop its
 * type names: 0 the game's main loop (also in combat), 1 the input loop of
 * every screen, 2 the world map, 3 both the main loop and the world map.
 * Types 0 and 3 also get the map procedures (map_enter_p_proc and so on).
 *
 * The browser cannot list a directory, so setup.py writes the names to
 * data/scripts/sfall_scripts.json.
 */

import { getFileJSON } from './util.js'
import { isGameScript } from './data.js'

export interface GlobalScript {
    name: string
    script: any
    /** Frames between runs; 0 never repeats. */
    repeat: number
    /** 0 main loop, 1 input loop, 2 world map, 3 main loop and world map. */
    mode: number
    count: number
}

const globalScripts: GlobalScript[] = []
let scriptNames: string[] | null = null

/** sfall's availableGlobalScriptTypes: 1 input loop, 2 world map. */
export const AVAILABLE_GLOBAL_SCRIPT_TYPES = 3

function listedNames(): string[] {
    if (scriptNames) {return scriptNames}
    try {
        const listing = getFileJSON('data/scripts/sfall_scripts.json')
        scriptNames = (Array.isArray(listing?.global) ? listing.global : [])
            .map((n: unknown) => String(n).toLowerCase())
            .filter((n: string) => n.startsWith('gl') && !isGameScript(n))
    } catch {
        scriptNames = []
    }
    return scriptNames!
}

/** For tests: use these names instead of the listing. */
export function setGlobalScriptNames(names: string[] | null): void {
    scriptNames = names
}

export function globalScriptList(): readonly GlobalScript[] {
    return globalScripts
}

function runStart(g: GlobalScript): void {
    g.count = 0
    if (typeof g.script?.start !== 'function') {return}
    try {
        g.script.start()
    } catch (e) {
        console.warn('[sfall] global script ' + g.name + ' failed in start:', e)
    }
}

/** ClearGlobalScripts: before a game starts or loads. */
export function clearGlobalScripts(): void {
    globalScripts.length = 0
}

/**
 * InitGlobalScripts: load each global script and run its start procedure
 * once (where it usually sets its repeat and type).
 */
export function startGlobalScripts(load: (name: string) => any): void {
    clearGlobalScripts()
    for (const name of listedNames()) {
        let script: any
        try {
            script = load(name)
        } catch (e) {
            console.warn('[sfall] could not load global script ' + name + ':', e)
            continue
        }
        if (!script) {continue}
        const g: GlobalScript = { name, script, repeat: 0, mode: 0, count: 0 }
        script._globalScript = g
        globalScripts.push(g)
        runStart(g)
    }
}

/** RunGlobalScripts(mode1, mode2): one frame of a loop. */
export function runGlobalScripts(mode1: number, mode2: number): void {
    for (const g of globalScripts) {
        if (g.repeat && (g.mode === mode1 || g.mode === mode2) && ++g.count >= g.repeat) {runStart(g)}
    }
}

/** RunGlobalScriptsAtProc: the scripts of types 0 and 3 get the map procedures too. */
export function runGlobalScriptsAtProc(procName: string): void {
    for (const g of globalScripts) {
        if (g.mode !== 0 && g.mode !== 3) {continue}
        const proc = g.script?.[procName]
        if (typeof proc !== 'function') {continue}
        try {
            proc.call(g.script)
        } catch (e) {
            console.warn('[sfall] global script ' + g.name + ' failed in ' + procName + ':', e)
        }
    }
}

/** set_global_script_repeat: frames between runs; -1 flips the type between 0 and 1. */
export function setGlobalScriptRepeat(script: any, frames: number): void {
    const g: GlobalScript | undefined = script?._globalScript
    if (!g) {return}
    if (frames === -1) {g.mode = g.mode ? 0 : 1}
    else {g.repeat = Math.trunc(frames)}
}

/** set_global_script_type: 0–3. */
export function setGlobalScriptType(script: any, type: number): void {
    const g: GlobalScript | undefined = script?._globalScript
    if (g && type <= 3) {g.mode = Math.trunc(type)}
}
