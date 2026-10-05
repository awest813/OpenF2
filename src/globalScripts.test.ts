import { describe, it, expect, afterEach } from 'vitest'
import {
    clearGlobalScripts, globalScriptList, runGlobalScripts, runGlobalScriptsAtProc, setGlobalScriptNames,
    setGlobalScriptRepeat, setGlobalScriptType, startGlobalScripts,
} from './globalScripts.js'

function fakeScript(log: string[], name: string): any {
    const s: any = {
        start() {
            log.push(name + ':start')
        },
        map_enter_p_proc() { log.push(name + ':enter') },
    }
    return s
}

describe('sfall global scripts (ScriptExtender.cpp)', () => {
    afterEach(() => {
        clearGlobalScripts()
        setGlobalScriptNames(null)
    })

    it('start runs once at load, then every `repeat` frames of its loop', () => {
        const log: string[] = []
        setGlobalScriptNames(['gl_a', 'gl_b'])
        startGlobalScripts((name) => fakeScript(log, name))
        expect(log).toEqual(['gl_a:start', 'gl_b:start'])
        const [a, b] = globalScriptList().map((g) => g.script)
        setGlobalScriptRepeat(a, 2) // main loop, every other frame
        setGlobalScriptRepeat(b, 1)
        setGlobalScriptType(b, 2) // world map only
        log.length = 0
        runGlobalScripts(0, 3)
        runGlobalScripts(0, 3)
        expect(log).toEqual(['gl_a:start'])
        log.length = 0
        runGlobalScripts(2, 3)
        expect(log).toEqual(['gl_b:start'])
    })

    it('repeat 0 never reruns; -1 flips between the main and input loops', () => {
        const log: string[] = []
        setGlobalScriptNames(['gl_c'])
        startGlobalScripts((name) => fakeScript(log, name))
        const c = globalScriptList()[0].script
        log.length = 0
        runGlobalScripts(0, 3)
        expect(log).toEqual([])
        setGlobalScriptRepeat(c, 1)
        setGlobalScriptRepeat(c, -1)
        expect(globalScriptList()[0].mode).toBe(1)
        runGlobalScripts(0, 3)
        expect(log).toEqual([])
        runGlobalScripts(1, 1)
        expect(log).toEqual(['gl_c:start'])
    })

    it('types 0 and 3 get the map procedures', () => {
        const log: string[] = []
        setGlobalScriptNames(['gl_d', 'gl_e'])
        startGlobalScripts((name) => fakeScript(log, name))
        setGlobalScriptType(globalScriptList()[1].script, 2)
        log.length = 0
        runGlobalScriptsAtProc('map_enter_p_proc')
        expect(log).toEqual(['gl_d:enter'])
    })
})
