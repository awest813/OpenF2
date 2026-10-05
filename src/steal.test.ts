import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import globalState from './globalState.js'
import { EventBus } from './eventBus.js'
import { finishStealing, openStealing, performStealing, StealSession, type StealScreen } from './steal.js'
import { TICKS_PER_DAY } from './gameTime.js'

function critter(opts: { steal?: number; orientation?: number; flags?: number; isPlayer?: boolean } = {}) {
    return {
        type: 'critter',
        isPlayer: opts.isPlayer ?? false,
        dead: false,
        orientation: opts.orientation ?? 0,
        xp: 0,
        level: 1,
        inventory: [] as any[],
        pro: { extra: { flags: opts.flags ?? 0 } },
        getStat: () => 0,
        getSkill: (s: string) => (s === 'Steal' ? opts.steal ?? 0 : 0),
    } as any
}

const item = (name: string, size = 1) => ({ type: 'item', name, pro: { extra: { size } } })

/** Scripted d100s. */
function rolls(...values: number[]): (min: number, max: number) => number {
    let i = 0
    return (min, max) => Math.max(min, Math.min(max, values[Math.min(i++, values.length - 1)]))
}

describe('stealing (skillsPerformStealing)', () => {
    let messages: string[]
    let off: () => void
    let saved: any

    beforeEach(() => {
        saved = { player: globalState.player, time: globalState.gameTickTime, party: globalState.gParty }
        globalState.player = critter({ isPlayer: true, steal: 60 })
        globalState.gParty = null as any
        globalState.gameTickTime = 2 * TICKS_PER_DAY
        messages = []
        const handler = ({ text }: { text: string }) => messages.push(text)
        EventBus.on('ui:message', handler)
        off = () => EventBus.off('ui:message', handler)
    })

    afterEach(() => {
        off()
        globalState.player = saved.player
        globalState.gameTickTime = saved.time
        globalState.gParty = saved.party
    })

    it('steals unnoticed when the steal roll passes and the catch roll fails', () => {
        const mark = critter({ steal: 20, orientation: 0 })
        globalState.player.orientation = 0 // behind the mark: no facing penalty
        // steal: 60 − 4 = 56 vs d100 10 → success (crit check 100 no); catch: 20 + 4 = 24 vs 90 → failure (crit-fail check 100 no)
        expect(performStealing(globalState.player, mark, item('Knife'), false, 1, rolls(10, 100, 90, 100))).toBe(1)
        expect(messages).toEqual(['You steal the Knife.'])
    })

    it('facing the mark costs 25 and a failed steal still needs the mark to notice', () => {
        const mark = critter({ steal: 50, orientation: 3 })
        globalState.player.orientation = 0
        // steal chance 60 − 4 − 25 = 31 vs 50 → failure; catch: 50 + 29 = 79 vs 20 → caught
        expect(performStealing(globalState.player, mark, item('Knife'), false, 1, rolls(50, 100, 20, 100))).toBe(0)
        expect(messages).toEqual(["You're caught stealing the Knife."])
    })

    it('each extra move this session is 1% harder', () => {
        const mark = critter({ steal: 0 })
        globalState.player = critter({ isPlayer: true, steal: 10 })
        // 3rd move: modifier −2 − 4 (size 1) = −6 → chance 4 vs d100 5 fails; catch 0 + 6 = 6 vs 7 → not caught
        expect(performStealing(globalState.player, mark, item('Rock'), true, 3, rolls(5, 100, 7, 100))).toBe(1)
        expect(messages).toEqual(['You plant the Rock.'])
    })

    it('party members never catch the player', () => {
        const friend = critter({ steal: 200 })
        globalState.gParty = { isPartyMember: (c: any) => c === friend } as any
        expect(performStealing(globalState.player, friend, item('Gun', 10), false, 1, rolls(100))).toBe(1)
    })
})

describe('the steal screen (inventoryOpenStealing)', () => {
    let saved: any
    let messages: string[]
    let off: () => void

    beforeEach(() => {
        saved = { player: globalState.player, time: globalState.gameTickTime, party: globalState.gParty }
        globalState.player = critter({ isPlayer: true, steal: 50 })
        globalState.gParty = null as any
        globalState.gameTickTime = 2 * TICKS_PER_DAY
        messages = []
        const handler = ({ text }: { text: string }) => messages.push(text)
        EventBus.on('ui:message', handler)
        off = () => EventBus.off('ui:message', handler)
    })

    afterEach(() => {
        off()
        globalState.player = saved.player
        globalState.gameTickTime = saved.time
        globalState.gParty = saved.party
    })

    function screen(): StealScreen & { opened: any[]; looted: any[]; pickups: any[] } {
        const s = {
            opened: [] as any[],
            looted: [] as any[],
            pickups: [] as any[],
            openSteal: (_t: any, target: any, session: StealSession) => s.opened.push({ target, session }),
            openLoot: (target: any) => s.looted.push(target),
            runPickup: (target: any) => {
                s.pickups.push(target)
                return false
            },
        }
        return s
    }

    it('refuses NO_STEAL critters', () => {
        const sc = screen()
        openStealing(globalState.player, critter({ flags: 0x20 }), sc)
        expect(sc.opened).toHaveLength(0)
        expect(messages).toEqual(["You can't find anything to take from that."])
    })

    it('loots the dead and the unconscious instead of stealing', () => {
        const sc = screen()
        const body = critter()
        body.knockedOut = true
        openStealing(globalState.player, body, sc)
        expect(sc.looted).toEqual([body])
        expect(sc.pickups).toEqual([body])
    })

    it('hides the mark\'s wielded and worn items until the screen closes', () => {
        const sc = screen()
        const mark = critter()
        const gun = item('Gun')
        const armor = item('Armor')
        const caps = item('Caps')
        mark.inventory = [gun, armor, caps]
        mark.rightHand = gun
        mark.equippedArmor = armor
        openStealing(globalState.player, mark, sc)
        expect(mark.inventory).toEqual([caps])
        finishStealing(sc.opened[0].session, sc)
        expect(mark.inventory).toEqual(expect.arrayContaining([gun, armor, caps]))
    })

    it('awards 10, 20, 30 … XP for a clean run, capped at 300 − Steal', () => {
        const sc = screen()
        const mark = critter()
        const session = new StealSession(globalState.player, mark, rolls(1, 100, 100, 100))
        for (let i = 0; i < 3; i++) {
            expect(session.beforeMove(item('Caps'), false)).toBe(true)
            session.afterMove()
        }
        finishStealing(session, sc)
        expect(globalState.player.xp).toBe(60)
        expect(messages.at(-1)).toBe('You gain 60 experience points for successfully using your Steal skill.')
        expect(sc.pickups).toHaveLength(0)
    })

    it('getting caught ends the run with no XP and runs the mark\'s pickup_p_proc', () => {
        const sc = screen()
        const mark = critter({ steal: 50 })
        const session = new StealSession(globalState.player, mark, rolls(1, 100, 100, 100, 99, 100, 1, 100))
        expect(session.beforeMove(item('Caps'), false)).toBe(true)
        session.afterMove()
        expect(session.beforeMove(item('Caps'), false)).toBe(false)
        finishStealing(session, sc)
        expect(globalState.player.xp).toBe(0)
        expect(sc.pickups).toEqual([mark])
    })
})

describe('LootPanel steal mode', () => {
    it('checks each move and closes when caught', async () => {
        const { LootPanel } = await import('./ui2/lootPanel.js')
        const panel = new LootPanel(800, 600)
        const caps = { name: 'Caps', amount: 1 } as any
        const knife = { name: 'Knife', amount: 1 } as any
        const player: any[] = []
        const mark: any[] = [caps, knife]
        const guard = { title: 'STEAL', beforeMove: vi.fn(() => true), afterMove: vi.fn(), onClose: vi.fn() }
        panel.openWithLive(player, mark, guard)
        expect(panel.stealing).toBe(true)
        ;(panel as any)._moveItem('container', 0, 'player')
        expect(guard.beforeMove).toHaveBeenCalledWith(caps, false)
        expect(guard.afterMove).toHaveBeenCalledTimes(1)
        expect(player).toEqual([caps])
        guard.beforeMove.mockReturnValueOnce(false)
        ;(panel as any)._moveItem('container', 0, 'player')
        expect(mark).toEqual([knife])
        expect(panel.visible).toBe(false)
        expect(guard.onClose).toHaveBeenCalledTimes(1)
    })
})
