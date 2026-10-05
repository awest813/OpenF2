import { describe, it, expect } from 'vitest'
import { Scripting } from './scripting.js'
import { ScriptVMBridge } from './vm_bridge.js'
import { opMap } from './vm_opcodes.js'

/** Run an opcode on a fresh VM stack and return what it left. */
function run(opcode: number, scriptObj: any, ...args: unknown[]): unknown[] {
    const vm: any = {
        stack: [...args],
        scriptObj,
        lastOpcode: opcode,
        intfile: { name: 'test', identifiers: {} },
        recordUnsupportedProcedure() {},
        push(v: unknown) { this.stack.push(v) },
        pop() { return this.stack.pop() },
    }
    opMap[opcode].call(vm)
    return vm.stack
}

/** What each vanilla opcode leaves on the stack must match interpreter_extra.cc. */
describe('vanilla opcode stack effects', () => {
    it('critter_heal returns a value; set_light_level, explosion and gsay_start do not', () => {
        const obj: any = {
            critter_heal: () => 0,
            set_light_level: () => 1,
            explosion: () => 1,
            gsay_start: () => 1,
        }
        expect(run(0x80e8, obj, {}, 5)).toEqual([0])
        expect(run(0x80e9, obj, 50)).toEqual([])
        expect(run(0x811a, obj, 100, 0, 20)).toEqual([])
        expect(run(0x811c, obj)).toEqual([])
    })

    it('script_action gives the number of the running procedure', () => {
        const script: any = new (Scripting as any).Script()
        script._action = 6 // use_p_proc
        expect(run(0x80c7, script)).toEqual([6])
    })
})

describe('tokenize (0x80A0, intlib opTokenize)', () => {
    const comma = ','.charCodeAt(0)

    it('walks the fields of a string', () => {
        expect(run(0x80a0, {}, 'a,bb,c', 0, comma)).toEqual(['a'])
        expect(run(0x80a0, {}, 'a,bb,c', 'a', comma)).toEqual(['bb'])
        expect(run(0x80a0, {}, 'a,bb,c', 'bb', comma)).toEqual(['c'])
        expect(run(0x80a0, {}, 'a,bb,c', 'c', comma)).toEqual([0])
    })

    it('a string without the separator is one field', () => {
        expect(ScriptVMBridge.tokenize('word', 0, ',')).toBe('word')
    })
})

describe('has_trait / critter_add_trait / critter_state (interpreter_extra.cc)', () => {
    const critter = (extra: Record<string, unknown> = {}): any => ({
        _type: 'obj', type: 'critter', perkRanks: {}, inventory: [], orientation: 3, aiNum: 7, teamNum: 2, ...extra,
    })

    it('has_trait object fields: AI packet, team, rotation, visibility, inventory weight; others 0', () => {
        const script: any = new (Scripting as any).Script()
        const c = critter({ inventory: [{ pro: { extra: { weight: 4 } }, amount: 3 }] })
        expect(script.has_trait(1, c, 5)).toBe(7)
        expect(script.has_trait(1, c, 6)).toBe(2)
        expect(script.has_trait(1, c, 10)).toBe(3)
        expect(script.has_trait(1, c, 666)).toBe(1)
        expect(script.has_trait(1, c, 669)).toBe(12)
        for (const other of [0, 1, 2, 3, 7, 8, 9, 667, 668]) {expect(script.has_trait(1, c, other)).toBe(0)}
    })

    it('has_trait(TRAIT_TRAIT) asks about the player\'s traits, whoever is passed', async () => {
        const { default: globalState } = await import('./globalState.js')
        const saved = globalState.player
        globalState.player = { charTraits: new Set([4]) } as any
        const script: any = new (Scripting as any).Script()
        expect(script.has_trait(2, critter(), 4)).toBe(1)
        expect(script.has_trait(2, critter({ charTraits: new Set([5]) }), 5)).toBe(0)
        globalState.player = saved
    })

    it('critter_add_trait adds or takes one perk rank and returns -1', () => {
        const script: any = new (Scripting as any).Script()
        const c = critter()
        expect(script.critter_add_trait(c, 0, 10, 1)).toBe(-1)
        script.critter_add_trait(c, 0, 10, 5)
        expect(c.perkRanks[10]).toBe(2)
        script.critter_add_trait(c, 0, 10, 0)
        expect(c.perkRanks[10]).toBe(1)
        script.critter_add_trait(c, 1, 6, 9)
        expect(c.teamNum).toBe(9)
        script.critter_add_trait(c, 2, 3, 1) // traits cannot be added
        expect(c.charTraits).toBeUndefined()
    })

    it('critter_state: dead 1; knocked out 2 with no limb bits; else prone and crippled bits', () => {
        const script: any = new (Scripting as any).Script()
        expect(script.critter_state(critter({ dead: true }))).toBe(1)
        expect(script.critter_state({ _type: 'obj', type: 'item' })).toBe(1)
        expect(script.critter_state(critter({ knockedOut: true, crippledLeftLeg: true }))).toBe(2)
        expect(script.critter_state(critter({ knockedDown: true, crippledLeftLeg: true }))).toBe(0x06)
        expect(script.critter_state(critter({ blinded: true }))).toBe(0x40)
    })
})

describe('obj_type / obj_item_subtype / critter_inven_obj / inven_cmds / get_pc_stat', () => {
    const script: any = new (Scripting as any).Script()

    it('obj_type and obj_item_subtype give -1 when they do not apply', () => {
        expect(script.obj_type(null)).toBe(-1)
        expect(script.obj_type({ _type: 'obj', type: 'scenery', pid: 0x02000005 })).toBe(2)
        expect(script.obj_item_subtype({ _type: 'obj', type: 'item', pro: { extra: { subType: 4 } } })).toBe(4)
        expect(script.obj_item_subtype({ _type: 'obj', type: 'critter' })).toBe(-1)
    })

    it('critter_inven_obj: the player\'s hands answer only for the hand in use', () => {
        const left = { id: 'L', pid: 1 }
        const right = { id: 'R', pid: 2 }
        const dude: any = { _type: 'obj', type: 'critter', isPlayer: true, leftHand: left, rightHand: right, activeHand: 0, inventory: [left, right] }
        expect(script.critter_inven_obj(dude, 2)).toBe(left)
        expect(script.critter_inven_obj(dude, 1)).toBe(0)
        dude.activeHand = 1
        expect(script.critter_inven_obj(dude, 1)).toBe(right)
        expect(script.critter_inven_obj(dude, 2)).toBe(0)
        expect(script.critter_inven_obj(dude, -2)).toBe(2)
        const npc: any = { _type: 'obj', type: 'critter', leftHand: left, rightHand: right, inventory: [left, right] }
        expect(script.critter_inven_obj(npc, 1)).toBe(right)
        expect(script.critter_inven_obj(npc, 2)).toBe(left)
        expect(script.critter_inven_obj({ _type: 'obj', type: 'item' }, 0)).toBe(0)
        // An empty hand's stand-in fist (no pid) is not an item.
        expect(script.critter_inven_obj({ _type: 'obj', type: 'critter', rightHand: { type: 'item', subtype: 'weapon' } }, 1)).toBe(0)
    })

    it('inven_cmds only knows INVEN_CMD_INDEX_PTR (13), on any object', () => {
        const box: any = { _type: 'obj', type: 'item', inventory: ['a', 'b'] }
        expect(script.inven_cmds(box, 13, 1)).toBe('b')
        expect(script.inven_cmds(box, 13, 2)).toBeNull()
        expect(script.inven_cmds(box, 0, 0)).toBeNull()
    })

    it('get_pc_stat has five stats', () => {
        expect(script.get_pc_stat(5)).toBe(0)
    })
})

describe('set_critter_stat / critter_mod_skill / is_success / is_critical', () => {
    it('set_critter_stat adds to the player\'s base stat and refuses anyone else', async () => {
        const { default: globalState } = await import('./globalState.js')
        const { Critter } = await import('./object.js')
        const { SkillSet, StatSet } = await import('./char.js')
        const make = (): any => {
            const c: any = new (Critter as any)()
            c.stats = new StatSet()
            c.skills = new SkillSet()
            return c
        }
        const saved = globalState.player
        const dude: any = make()
        dude.isPlayer = true
        dude.stats.setBase('STR', 5)
        globalState.player = dude
        const script: any = new (Scripting as any).Script()
        expect(script.set_critter_stat(dude, 0, 2)).toBe(0)
        expect(dude.stats.getBase('STR')).toBe(7)
        script.set_critter_stat(dude, 0, 5) // 12 is out of range: refused
        expect(dude.stats.getBase('STR')).toBe(7)
        const npc: any = make()
        npc.stats.setBase('STR', 5)
        expect(script.set_critter_stat(npc, 0, 2)).toBe(-1)
        expect(npc.stats.getBase('STR')).toBe(5)

        // critter_mod_skill: points one by one, half for a tagged skill; player only.
        const lockpick = dude.skills.getBase('Lockpick')
        expect(script.critter_mod_skill(dude, 9, 10)).toBe(0)
        expect(dude.skills.getBase('Lockpick')).toBe(lockpick + 10)
        dude.skills.tagged.push('Lockpick')
        script.critter_mod_skill(dude, 9, 10)
        expect(dude.skills.getBase('Lockpick')).toBe(lockpick + 15)
        script.critter_mod_skill(dude, 9, -1000)
        expect(dude.skills.getBase('Lockpick')).toBe(lockpick)
        const npcLockpick = npc.skills.getBase('Lockpick')
        script.critter_mod_skill(npc, 9, 10)
        expect(npc.skills.getBase('Lockpick')).toBe(npcLockpick)
        globalState.player = saved
    })

    it('is_success and is_critical give -1 for values that are not rolls', () => {
        const script: any = new (Scripting as any).Script()
        expect([0, 1, 2, 3, 7].map((r) => script.is_success(r))).toEqual([0, 0, 1, 1, -1])
        expect([0, 1, 2, 3, 7].map((r) => script.is_critical(r))).toEqual([1, 0, 0, 1, -1])
    })
})

describe('inventory opcodes (interpreter_extra.cc / item.cc)', () => {
    const script: any = new (Scripting as any).Script()
    const item = (pid: number, amount = 1, extra: Record<string, unknown> = {}): any => ({
        _type: 'obj', type: 'item', pid, amount, inventory: [], approxEq(o: any) { return o.pid === this.pid }, ...extra,
    })

    it('obj_is_carrying_obj_pid counts items, not stacks, including containers', () => {
        const bag = item(9, 1, { subtype: 'container', inventory: [item(41, 30)] })
        const gun = item(8)
        const c: any = { _type: 'obj', type: 'critter', inventory: [item(41, 50), bag, gun], rightHand: gun }
        expect(script.obj_is_carrying_obj_pid(c, 41)).toBe(80)
        expect(script.obj_is_carrying_obj_pid(c, 8)).toBe(1)
        expect(script.obj_carrying_pid_obj(c, 8)).toBe(gun)
        expect(script.item_caps_total(c)).toBe(80)
    })

    it('item_caps_adjust takes from money then containers, and refuses to overdraw', () => {
        const bag = item(9, 1, { subtype: 'container', inventory: [item(41, 30)] })
        const c: any = { _type: 'obj', type: 'critter', inventory: [item(41, 50), bag] }
        expect(script.item_caps_adjust(c, -100)).toBe(-1)
        expect(script.item_caps_total(c)).toBe(80)
        expect(script.item_caps_adjust(c, -60)).toBe(0)
        expect(script.item_caps_total(c)).toBe(20)
        expect(c.inventory.some((o: any) => o.pid === 41)).toBe(false)
        expect(script.item_caps_adjust(c, 5)).toBe(0)
    })

    it('rm_mult_objs_from_inven takes from that stack and frees an emptied slot', () => {
        const gun = item(8)
        const c: any = { _type: 'obj', type: 'critter', inventory: [gun], rightHand: gun }
        expect(script.rm_mult_objs_from_inven(c, gun, 5)).toBe(1)
        expect(c.inventory).toEqual([])
        expect(c.rightHand).toBeUndefined()
    })

    it('move_obj_inven_to_obj adds to what the other object already holds', () => {
        const from: any = { _type: 'obj', type: 'critter', inventory: [item(41, 10), item(5)] }
        const to: any = { _type: 'obj', type: 'item', inventory: [item(41, 3), item(6)] }
        script.move_obj_inven_to_obj(from, to)
        expect(from.inventory).toEqual([])
        expect(to.inventory.map((o: any) => [o.pid, o.amount])).toEqual([[41, 13], [6, 1], [5, 1]])
    })

    it('add_mult_objs_to_inven moves the object itself; a negative count means 1', () => {
        const box: any = { _type: 'obj', type: 'item', inventory: [] }
        const rock = item(7)
        script.add_mult_objs_to_inven(box, rock, -4)
        expect(box.inventory).toEqual([rock])
        expect(rock.amount).toBe(1)
        script.add_mult_objs_to_inven(box, item(7), 2)
        expect(rock.amount).toBe(3)
    })
})

describe('tile opcodes (interpreter_extra.cc / tile.cc)', () => {
    const script: any = new (Scripting as any).Script()
    const mid = 100 * 200 + 100

    it('tile_num_in_direction: -1 for a bad rotation or zero distance; stops at the map edge', () => {
        expect(script.tile_num_in_direction(mid, 6, 1)).toBe(-1)
        expect(script.tile_num_in_direction(mid, 0, 0)).toBe(-1)
        expect(script.tile_num_in_direction(-1, 0, 1)).toBe(-1)
        expect(script.tile_num_in_direction(mid, 0, -3)).toBe(mid)
        expect(script.tile_num_in_direction(mid, 1, 1)).not.toBe(mid)
        const edge = 5 * 200 // x = 0
        expect(script.tile_num_in_direction(edge, 1, 5)).toBe(edge)
    })

    it('tile_distance_objs gives 9999 when an object is missing or off the map', () => {
        const a: any = { _type: 'obj', type: 'item', position: { x: 1, y: 1 } }
        expect(script.tile_distance_objs(a, null)).toBe(9999)
        expect(script.tile_distance_objs(a, { _type: 'obj', type: 'item', position: null })).toBe(9999)
        expect(script.tile_num(null)).toBe(-1)
    })

    it('rotation_to_tile follows the screen angle', () => {
        // Each neighbour lies in its own direction.
        for (let dir = 0; dir < 6; dir++) {
            const next = script.tile_num_in_direction(mid, dir, 1)
            expect(script.rotation_to_tile(mid, next)).toBe(dir)
        }
    })

    it('tile_in_tile_rect spans the first and fourth corners', () => {
        const at = (x: number, y: number) => y * 200 + x
        const ul = at(120, 80), lr = at(100, 90)
        expect(script.tile_in_tile_rect(ul, 0, 0, lr, at(110, 85))).toBe(1)
        expect(script.tile_in_tile_rect(ul, 0, 0, lr, at(130, 85))).toBe(0)
    })
})
