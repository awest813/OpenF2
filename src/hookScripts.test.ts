import { describe, it, expect, afterEach } from 'vitest'
import { clearHookScripts, getHookArg, getHookArgAt, HOOK, hookReturn, registerHook, runHook, setHookArg, setHookReturn, startHookScripts } from './hookScripts.js'

afterEach(() => clearHookScripts())

describe('sfall hook scripts (HookScripts/Common.cpp)', () => {
    it('hs_* scripts run at load with init_hook, then for each event; returns come back', () => {
        const seen: unknown[] = []
        const hs: any = {
            start() {
                seen.push(getHookArg(), getHookArg(), getHookArg())
                setHookReturn(42)
            },
        }
        startHookScripts(['hs_tohit'], () => hs)
        seen.length = 0
        const r = runHook(HOOK.TOHIT, [60, 'attacker', 'target'])
        expect(seen).toEqual([60, 'attacker', 'target'])
        expect(hookReturn(r, 0, 60)).toBe(42)
        expect(runHook(HOOK.AFTERHITROLL, [])).toBeNull() // nothing attached
    })

    it('registered global scripts run last-registered first; set_sfall_arg is seen by the next', () => {
        const order: string[] = []
        const a: any = { start() { order.push('a:' + getHookArgAt(0)) } }
        const b: any = {
            start() {
                order.push('b:' + getHookArgAt(0))
                setHookArg(0, 7)
            },
        }
        registerHook(a, HOOK.ONDEATH, null, false)
        registerHook(b, HOOK.ONDEATH, null, false)
        runHook(HOOK.ONDEATH, [1])
        expect(order).toEqual(['b:1', 'a:7'])
        registerHook(b, HOOK.ONDEATH, null, true) // unregister
        order.length = 0
        runHook(HOOK.ONDEATH, [1])
        expect(order).toEqual(['a:1'])
    })

    it('register_hook_proc runs the named procedure; non-int returns are ignored', () => {
        const g: any = {
            onHit() {
                setHookReturn('text')
                setHookReturn(5)
            },
        }
        registerHook(g, HOOK.CALCAPCOST, 'onHit', false)
        const r = runHook(HOOK.CALCAPCOST, [0, 0, 0, 4, 0])
        expect(r!.rets).toEqual([5])
    })

    it('a hook inside a hook keeps its own arguments', () => {
        const inner: any = { start() { setHookReturn(Number(getHookArgAt(0)) + 1) } }
        const outer: any = {
            start() {
                const r = runHook(HOOK.ONDEATH, [10])
                setHookReturn(hookReturn(r, 0, 0) + Number(getHookArgAt(0)))
            },
        }
        registerHook(inner, HOOK.ONDEATH, null, false)
        registerHook(outer, HOOK.TOHIT, null, false)
        expect(hookReturn(runHook(HOOK.TOHIT, [100]), 0, 0)).toBe(111)
    })
})
