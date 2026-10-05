import globalState from './globalState.js'
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

describe('engine events reach the hooks', () => {
    it('SetGlobalVar can change the value; RollCheck can change a skill roll', async () => {
        const { Scripting } = await import('./scripting.js')
        const script: any = new (Scripting as any).Script()
        const g: any = { start() { setHookReturn(Number(getHookArgAt(1)) * 2) } }
        registerHook(g, HOOK.SETGLOBALVAR, null, false)
        script.set_global_var(77, 21)
        expect(script.global_var(77)).toBe(42)

        const { skillRoll } = await import('./skillUse.js')
        const r: any = { start() { setHookReturn(3) } }
        registerHook(r, HOOK.ROLLCHECK, null, false)
        const critter: any = { getSkill: () => 0, getStat: () => 0, skills: {} }
        expect(skillRoll(critter, 0, 0, () => 100).roll).toBe(3)
    })

    it('DescriptionObj replaces the examine text', async () => {
        const { examineLines } = await import('./examine.js')
        const d: any = { start() { setHookReturn('A strange rock.') } }
        registerHook(d, HOOK.DESCRIPTIONOBJ, null, false)
        expect(examineLines(null, { type: 'scenery', getDescription: () => 'A rock.' })).toEqual(['A strange rock.'])
    })

    it('RemoveInvenObj sees rm_obj_from_inven and destroy_object with their RMOBJ reasons', async () => {
        const { Scripting } = await import('./scripting.js')
        const { RMOBJ_ITEM_DESTROYED, RMOBJ_ITEM_REMOVED } = await import('./hookScripts.js')
        const script: any = new (Scripting as any).Script()
        const seen: unknown[][] = []
        registerHook({ start() { seen.push([getHookArgAt(1), getHookArgAt(2), getHookArgAt(3)]) } }, HOOK.REMOVEINVENOBJ, null, false)
        const item: any = { type: 'item', pid: 41, amount: 3, approxEq: (o: any) => o === item }
        const owner: any = { type: 'critter', inventory: [item] }
        script.rm_obj_from_inven(owner, item)
        expect(seen).toEqual([[item, 1, RMOBJ_ITEM_REMOVED]])
        const other: any = { type: 'item', pid: 42, amount: 1, approxEq: () => false }
        owner.inventory.push(other)
        globalState.gMap = { getObjects: () => [owner], destroyObject() {}, removeObject() {} } as any
        script.destroy_object(other)
        expect(seen[1]).toEqual([other, 1, RMOBJ_ITEM_DESTROYED])
    })

    it('RestTimer can interrupt a rest after an hour', async () => {
        const { restForHours } = await import('./character/rest.js')
        globalState.player = { stats: { get: () => 1, modifyBase() {} }, getStat: () => 1 } as any
        globalState.inCombat = false
        globalState.gMap = null as any
        registerHook({ start() { setHookReturn(1) } }, HOOK.RESTTIMER, null, false)
        const result = restForHours(5)
        expect(result.refusedReason).toBeUndefined()
        expect(result.hoursCompleted).toBe(1)
        expect(result.interrupted).toBe(true)
    })

    it('TargetObject can refuse (-1) or redirect the target; InventoryMove refuses on any return but -1', async () => {
        const { inventoryMoveBlocked, INVMOVE, targetObjectHook } = await import('./hookScripts.js')
        const a: any = { dead: false }
        const b: any = { dead: false }
        expect(targetObjectHook(1, a)).toBe(a)
        registerHook({ start() { setHookReturn(getHookArgAt(2) === a ? b : -1) } }, HOOK.TARGETOBJECT, null, false)
        expect(targetObjectHook(1, a)).toBe(b)
        expect(targetObjectHook(1, b)).toBeNull()

        expect(inventoryMoveBlocked(INVMOVE.DROP, a)).toBe(false)
        registerHook({ start() { setHookReturn(getHookArgAt(0) === INVMOVE.DROP ? 1 : -1) } }, HOOK.INVENTORYMOVE, null, false)
        expect(inventoryMoveBlocked(INVMOVE.DROP, a)).toBe(true)
        expect(inventoryMoveBlocked(INVMOVE.PICKUP, a)).toBe(false)
    })
})
