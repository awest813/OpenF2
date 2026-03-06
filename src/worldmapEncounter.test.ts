/**
 * World-map encounter reliability tests — Epic B.
 *
 * Covers:
 *   - B2: Encounter transition atomicity (no double-enter, click-through,
 *         concurrent transitions, or save during invalid transient state)
 *   - B3: Encounter-generated entity validation (critter template, inventory,
 *         equipment slots, scripting hooks)
 *   - B4: Golden-path travel suite (move, roll, enter location, save, reload,
 *         continue travel)
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { applyEncounterCritterLoadout } from './encounterLoadout.js'

// ===========================================================================
// B2 — Encounter transition atomicity
// ===========================================================================

/**
 * Minimal in-process model of the encounter-transition state machine that
 * mirrors the `isEncounterTransitionPending` / `setWorldmapInteractionLocked`
 * logic in worldmap.ts.
 *
 * Tests here verify the invariants that must hold regardless of how the
 * underlying timer or DOM APIs behave:
 *   • beginTransition() is idempotent — calling it twice returns false the
 *     second time and does not double-lock.
 *   • completeTransition() always clears the lock, even when the encounter
 *     handler throws.
 *   • canAcceptInput() is exactly the inverse of isPending().
 *   • save is refused while a transition is in progress.
 */
class EncounterTransitionStateMachine {
    private pending = false
    private interactionLocked = false

    isPending(): boolean {
        return this.pending
    }

    isInteractionLocked(): boolean {
        return this.interactionLocked
    }

    canAcceptInput(): boolean {
        return !this.pending
    }

    canSave(): boolean {
        return !this.pending
    }

    /**
     * Attempt to begin an encounter transition.
     * Returns true if the transition started, false if one was already in progress.
     */
    beginTransition(): boolean {
        if (this.pending) return false
        this.pending = true
        this.interactionLocked = true
        return true
    }

    /**
     * Execute the encounter callback and then unconditionally release the lock.
     * Mirrors the try/finally in the worldmap.ts setTimeout callback.
     */
    executeAndComplete(encounterFn: () => void): void {
        try {
            encounterFn()
        } finally {
            this.pending = false
            this.interactionLocked = false
        }
    }
}

describe('B2 — encounter transition atomicity: basic state', () => {
    let fsm: EncounterTransitionStateMachine

    beforeEach(() => {
        fsm = new EncounterTransitionStateMachine()
    })

    it('starts with no pending transition and interaction unlocked', () => {
        expect(fsm.isPending()).toBe(false)
        expect(fsm.isInteractionLocked()).toBe(false)
        expect(fsm.canAcceptInput()).toBe(true)
        expect(fsm.canSave()).toBe(true)
    })

    it('beginTransition locks interaction and marks transition pending', () => {
        const started = fsm.beginTransition()
        expect(started).toBe(true)
        expect(fsm.isPending()).toBe(true)
        expect(fsm.isInteractionLocked()).toBe(true)
        expect(fsm.canAcceptInput()).toBe(false)
    })

    it('canSave returns false while transition is pending', () => {
        fsm.beginTransition()
        expect(fsm.canSave()).toBe(false)
    })
})

describe('B2 — encounter transition atomicity: double-enter guard', () => {
    let fsm: EncounterTransitionStateMachine

    beforeEach(() => {
        fsm = new EncounterTransitionStateMachine()
    })

    it('second beginTransition while pending returns false (no double-enter)', () => {
        fsm.beginTransition()
        const secondAttempt = fsm.beginTransition()
        expect(secondAttempt).toBe(false)
    })

    it('state remains consistently locked after failed second beginTransition', () => {
        fsm.beginTransition()
        fsm.beginTransition() // no-op
        expect(fsm.isPending()).toBe(true)
        expect(fsm.isInteractionLocked()).toBe(true)
    })
})

describe('B2 — encounter transition atomicity: lock release', () => {
    let fsm: EncounterTransitionStateMachine

    beforeEach(() => {
        fsm = new EncounterTransitionStateMachine()
    })

    it('executeAndComplete clears pending flag and unlocks interaction on success', () => {
        fsm.beginTransition()
        fsm.executeAndComplete(() => { /* normal encounter handler */ })
        expect(fsm.isPending()).toBe(false)
        expect(fsm.isInteractionLocked()).toBe(false)
        expect(fsm.canAcceptInput()).toBe(true)
    })

    it('executeAndComplete clears pending flag even when encounter handler throws', () => {
        fsm.beginTransition()
        expect(() => {
            fsm.executeAndComplete(() => { throw new Error('encounter setup failed') })
        }).toThrow('encounter setup failed')
        // Lock MUST be released even after an error
        expect(fsm.isPending()).toBe(false)
        expect(fsm.isInteractionLocked()).toBe(false)
        expect(fsm.canAcceptInput()).toBe(true)
    })

    it('new transition can begin after previous one completes', () => {
        fsm.beginTransition()
        fsm.executeAndComplete(() => { /* first encounter */ })
        const canBegin = fsm.beginTransition()
        expect(canBegin).toBe(true)
        expect(fsm.isPending()).toBe(true)
    })
})

describe('B2 — encounter transition atomicity: click-through prevention', () => {
    let fsm: EncounterTransitionStateMachine

    beforeEach(() => {
        fsm = new EncounterTransitionStateMachine()
    })

    it('canAcceptInput() is false during transition — prevents click-through', () => {
        fsm.beginTransition()
        expect(fsm.canAcceptInput()).toBe(false)
    })

    it('multiple canAcceptInput() checks during transition are all false', () => {
        fsm.beginTransition()
        // Simulate multiple UI ticks arriving during the transition
        for (let i = 0; i < 5; i++) {
            expect(fsm.canAcceptInput()).toBe(false)
        }
    })

    it('canAcceptInput() is restored to true after executeAndComplete', () => {
        fsm.beginTransition()
        fsm.executeAndComplete(() => { /* encounter */ })
        // Multiple subsequent checks should all allow input
        expect(fsm.canAcceptInput()).toBe(true)
        expect(fsm.canAcceptInput()).toBe(true)
    })
})

// ===========================================================================
// B3 — Encounter-generated entity validation
// ===========================================================================

function makeBaseObj() {
    const inventory: any[] = []
    return {
        dead: false,
        leftHand: null as any,
        rightHand: null as any,
        equippedArmor: null as any,
        anim: 'idle',
        art: null as any,
        inventory,
        addInventoryItem(item: any, amount: number) {
            for (let i = 0; i < amount; i++) inventory.push({ ...item })
        },
        getAnimation(name: string) { return `art_${name}` },
    }
}

function makeWeaponItem(pid: number) {
    return { pid, pro: { extra: { damage: 10, maxRange: 5 } } }
}

function makeArmorItem(pid: number) {
    return { pid, pro: { extra: { AC: 5, stats: { DT_normal: 2 } } } }
}

function makeGenericItem(pid: number) {
    return { pid, pro: {} }
}

describe('B3 — encounter entity validation: null/undefined safety', () => {
    it('applyEncounterCritterLoadout is a no-op when obj is null', () => {
        expect(() =>
            applyEncounterCritterLoadout(null, { dead: false, items: [] }, {
                createItem: (pid) => makeGenericItem(pid),
                isWeapon: () => false,
            })
        ).not.toThrow()
    })

    it('applyEncounterCritterLoadout is a no-op when critter is null', () => {
        const obj = makeBaseObj()
        expect(() =>
            applyEncounterCritterLoadout(obj, null as any, {
                createItem: (pid) => makeGenericItem(pid),
                isWeapon: () => false,
            })
        ).not.toThrow()
        expect(obj.inventory).toHaveLength(0)
    })

    it('applyEncounterCritterLoadout is a no-op when items is not an array', () => {
        const obj = makeBaseObj()
        applyEncounterCritterLoadout(obj, { dead: false, items: null as any }, {
            createItem: (pid) => makeGenericItem(pid),
            isWeapon: () => false,
        })
        expect(obj.inventory).toHaveLength(0)
    })
})

describe('B3 — encounter entity validation: dead critter template', () => {
    it('sets obj.dead = true when critter.dead is true', () => {
        const obj = makeBaseObj()
        applyEncounterCritterLoadout(obj, { dead: true, items: [] }, {
            createItem: (pid) => makeGenericItem(pid),
            isWeapon: () => false,
        })
        expect(obj.dead).toBe(true)
    })

    it('leaves obj.dead = false when critter.dead is false', () => {
        const obj = makeBaseObj()
        applyEncounterCritterLoadout(obj, { dead: false, items: [] }, {
            createItem: (pid) => makeGenericItem(pid),
            isWeapon: () => false,
        })
        expect(obj.dead).toBe(false)
    })
})

describe('B3 — encounter entity validation: inventory construction', () => {
    it('adds each item with amount=1 by default', () => {
        const obj = makeBaseObj()
        applyEncounterCritterLoadout(
            obj,
            { dead: false, items: [{ pid: 10, wielded: false }, { pid: 20, wielded: false }] },
            { createItem: (pid) => makeGenericItem(pid), isWeapon: () => false }
        )
        expect(obj.inventory).toHaveLength(2)
    })

    it('respects item.amount > 1', () => {
        const obj = makeBaseObj()
        applyEncounterCritterLoadout(
            obj,
            { dead: false, items: [{ pid: 5, wielded: false, amount: 3 }] },
            { createItem: (pid) => makeGenericItem(pid), isWeapon: () => false }
        )
        expect(obj.inventory).toHaveLength(3)
    })

    it('skips items with amount=0 (zero-quantity items are not added)', () => {
        const obj = makeBaseObj()
        applyEncounterCritterLoadout(
            obj,
            { dead: false, items: [{ pid: 7, wielded: false, amount: 0 }] },
            { createItem: (pid) => makeGenericItem(pid), isWeapon: () => false }
        )
        expect(obj.inventory).toHaveLength(0)
    })

    it('skips items with negative amount', () => {
        const obj = makeBaseObj()
        applyEncounterCritterLoadout(
            obj,
            { dead: false, items: [{ pid: 7, wielded: false, amount: -1 }] },
            { createItem: (pid) => makeGenericItem(pid), isWeapon: () => false }
        )
        expect(obj.inventory).toHaveLength(0)
    })
})

describe('B3 — encounter entity validation: equipment state (weapon slots)', () => {
    it('wielded weapon goes into leftHand slot when empty', () => {
        const weaponPid = 42
        const weapon = makeWeaponItem(weaponPid)
        const obj = makeBaseObj()

        applyEncounterCritterLoadout(
            obj,
            { dead: false, items: [{ pid: weaponPid, wielded: true }] },
            {
                createItem: () => weapon,
                isWeapon: (item) => item?.pro?.extra?.damage !== undefined,
            }
        )
        expect(obj.leftHand).not.toBeNull()
    })

    it('second wielded weapon goes into rightHand when leftHand is occupied', () => {
        const weaponA = makeWeaponItem(1)
        const weaponB = makeWeaponItem(2)
        const obj = makeBaseObj()

        let callCount = 0
        applyEncounterCritterLoadout(
            obj,
            { dead: false, items: [{ pid: 1, wielded: true }, { pid: 2, wielded: true }] },
            {
                createItem: () => (callCount++ === 0 ? weaponA : weaponB),
                isWeapon: (item) => item?.pro?.extra?.damage !== undefined,
            }
        )
        expect(obj.leftHand).not.toBeNull()
        expect(obj.rightHand).not.toBeNull()
    })

    it('armor goes into equippedArmor when item is not a weapon', () => {
        const armorPid = 99
        const armor = makeArmorItem(armorPid)
        const obj = makeBaseObj()

        applyEncounterCritterLoadout(
            obj,
            { dead: false, items: [{ pid: armorPid, wielded: true }] },
            {
                createItem: () => armor,
                isWeapon: (item) => item?.pro?.extra?.damage !== undefined,
            }
        )
        expect(obj.equippedArmor).not.toBeNull()
    })

    it('non-wielded items do not go into weapon or armor slots', () => {
        const obj = makeBaseObj()
        applyEncounterCritterLoadout(
            obj,
            { dead: false, items: [{ pid: 55, wielded: false }] },
            { createItem: (pid) => makeGenericItem(pid), isWeapon: () => false }
        )
        expect(obj.leftHand).toBeNull()
        expect(obj.rightHand).toBeNull()
        expect(obj.equippedArmor).toBeNull()
    })
})

describe('B3 — encounter entity validation: scripting hooks (animation state)', () => {
    it('refreshes art via getAnimation("idle") after loadout is applied', () => {
        const obj = makeBaseObj()
        applyEncounterCritterLoadout(
            obj,
            { dead: false, items: [{ pid: 10, wielded: false }] },
            { createItem: (pid) => makeGenericItem(pid), isWeapon: () => false }
        )
        // applyEncounterCritterLoadout calls obj.getAnimation('idle') when anim === 'idle'
        expect(obj.art).toBe('art_idle')
    })

    it('does not overwrite art when object anim is not idle', () => {
        const obj = makeBaseObj()
        obj.anim = 'run'
        obj.art = 'art_run_original'
        applyEncounterCritterLoadout(
            obj,
            { dead: false, items: [] },
            { createItem: (pid) => makeGenericItem(pid), isWeapon: () => false }
        )
        expect(obj.art).toBe('art_run_original')
    })
})

// ===========================================================================
// B4 — Golden-path travel tests
// ===========================================================================

/**
 * Self-contained travel harness that exercises the full golden path without
 * depending on browser APIs or live game state.
 *
 * Steps exercised:
 *   1. Player moves on the world map.
 *   2. Encounter roll is performed (deterministic seeded roll).
 *   3. Encounter or no-encounter branch is taken.
 *   4. Location is entered.
 *   5. State is saved.
 *   6. State is reloaded.
 *   7. Travel continues with the same encounter rate.
 */

interface TravelState {
    worldPosition: { x: number; y: number }
    currentMap: string | null
    inEncounter: boolean
    encounterRate: number
    lastEncounterRoll: number | null
    travelTicks: number
}

class TravelHarness {
    state: TravelState = {
        worldPosition: { x: 0, y: 0 },
        currentMap: null,
        inEncounter: false,
        encounterRate: 30,
        lastEncounterRoll: null,
        travelTicks: 0,
    }

    private transitionPending = false

    moveOnWorldMap(x: number, y: number): void {
        this.state.worldPosition = { x, y }
    }

    /**
     * Simulate one travel tick with a deterministic roll.
     * Returns true if an encounter was triggered.
     */
    tickTravel(roll: number): boolean {
        if (this.transitionPending) return false
        this.state.travelTicks++
        this.state.lastEncounterRoll = roll

        const rate = this.state.encounterRate
        if (rate <= 0 || !Number.isFinite(rate)) return false
        if (rate === 100) {
            this.triggerEncounter()
            return true
        }
        if (roll < rate) {
            this.triggerEncounter()
            return true
        }
        return false
    }

    private triggerEncounter(): void {
        this.transitionPending = true
        this.state.inEncounter = true
        this.state.currentMap = 'encounter_wastes'
    }

    resolveEncounter(destinationMap: string): void {
        if (!this.transitionPending) throw new Error('no encounter in progress')
        this.state.currentMap = destinationMap
        this.state.inEncounter = false
        this.transitionPending = false
    }

    enterLocation(mapName: string): void {
        this.state.currentMap = mapName
    }

    isTransitionPending(): boolean {
        return this.transitionPending
    }

    snapshot(): Record<string, any> {
        return {
            worldPosition: { ...this.state.worldPosition },
            currentMap: this.state.currentMap,
            inEncounter: this.state.inEncounter,
            encounterRate: this.state.encounterRate,
            travelTicks: this.state.travelTicks,
        }
    }

    static fromSnapshot(data: Record<string, any>): TravelHarness {
        const h = new TravelHarness()
        h.state.worldPosition = { ...data.worldPosition }
        h.state.currentMap = data.currentMap
        h.state.inEncounter = data.inEncounter
        h.state.encounterRate = data.encounterRate
        h.state.travelTicks = data.travelTicks
        return h
    }
}

describe('B4 — golden-path travel: world-map movement', () => {
    it('updates world position when moving', () => {
        const h = new TravelHarness()
        h.moveOnWorldMap(10, 20)
        expect(h.state.worldPosition).toEqual({ x: 10, y: 20 })
    })

    it('sequential moves accumulate correctly', () => {
        const h = new TravelHarness()
        h.moveOnWorldMap(5, 5)
        h.moveOnWorldMap(12, 8)
        expect(h.state.worldPosition).toEqual({ x: 12, y: 8 })
    })
})

describe('B4 — golden-path travel: encounter roll', () => {
    it('low roll triggers encounter', () => {
        const h = new TravelHarness()
        h.state.encounterRate = 30
        const triggered = h.tickTravel(5)
        expect(triggered).toBe(true)
        expect(h.state.inEncounter).toBe(true)
    })

    it('high roll does not trigger encounter', () => {
        const h = new TravelHarness()
        h.state.encounterRate = 30
        const triggered = h.tickTravel(80)
        expect(triggered).toBe(false)
        expect(h.state.inEncounter).toBe(false)
    })

    it('zero encounter rate never triggers', () => {
        const h = new TravelHarness()
        h.state.encounterRate = 0
        expect(h.tickTravel(0)).toBe(false)
    })

    it('rate=100 always triggers regardless of roll', () => {
        const h = new TravelHarness()
        h.state.encounterRate = 100
        expect(h.tickTravel(99)).toBe(true)
    })

    it('travel tick is blocked while encounter transition is pending', () => {
        const h = new TravelHarness()
        h.state.encounterRate = 100
        h.tickTravel(0) // triggers encounter
        expect(h.isTransitionPending()).toBe(true)
        const blocked = h.tickTravel(0) // must be blocked
        expect(blocked).toBe(false)
    })
})

describe('B4 — golden-path travel: enter location', () => {
    it('entering a location sets the current map', () => {
        const h = new TravelHarness()
        h.enterLocation('vault_13')
        expect(h.state.currentMap).toBe('vault_13')
        expect(h.state.inEncounter).toBe(false)
    })

    it('after encounter, resolving sets a new map and clears encounter flag', () => {
        const h = new TravelHarness()
        h.state.encounterRate = 100
        h.tickTravel(0)
        expect(h.state.inEncounter).toBe(true)
        h.resolveEncounter('desert_plains')
        expect(h.state.currentMap).toBe('desert_plains')
        expect(h.state.inEncounter).toBe(false)
        expect(h.isTransitionPending()).toBe(false)
    })
})

describe('B4 — golden-path travel: save and reload', () => {
    it('snapshot preserves world position, map, and encounter rate', () => {
        const h = new TravelHarness()
        h.moveOnWorldMap(7, 14)
        h.enterLocation('gecko')
        h.state.encounterRate = 50
        const snap = h.snapshot()

        expect(snap.worldPosition).toEqual({ x: 7, y: 14 })
        expect(snap.currentMap).toBe('gecko')
        expect(snap.encounterRate).toBe(50)
        expect(snap.inEncounter).toBe(false)
    })

    it('fromSnapshot restores travel state faithfully', () => {
        const h = new TravelHarness()
        h.moveOnWorldMap(3, 9)
        h.state.encounterRate = 20
        h.state.travelTicks = 42
        const snap = h.snapshot()

        const loaded = TravelHarness.fromSnapshot(snap)
        expect(loaded.state.worldPosition).toEqual({ x: 3, y: 9 })
        expect(loaded.state.encounterRate).toBe(20)
        expect(loaded.state.travelTicks).toBe(42)
    })

    it('inEncounter=false is preserved across save/load (no phantom encounters)', () => {
        const h = new TravelHarness()
        h.state.encounterRate = 30
        h.tickTravel(80) // no encounter
        const snap = h.snapshot()

        const loaded = TravelHarness.fromSnapshot(snap)
        expect(loaded.state.inEncounter).toBe(false)
    })

    it('serialization round-trip is stable (no data drift on double save)', () => {
        const h = new TravelHarness()
        h.moveOnWorldMap(6, 6)
        h.state.encounterRate = 40
        const snap1 = h.snapshot()

        const h2 = TravelHarness.fromSnapshot(snap1)
        const snap2 = h2.snapshot()

        expect(snap2).toEqual(snap1)
    })
})

describe('B4 — golden-path travel: continue travel after reload', () => {
    it('travel ticks resume from saved tick count after reload', () => {
        const h = new TravelHarness()
        h.state.travelTicks = 10
        h.tickTravel(99) // no encounter (rate=30)
        expect(h.state.travelTicks).toBe(11)

        const snap = h.snapshot()
        const loaded = TravelHarness.fromSnapshot(snap)

        // one more tick after reload
        loaded.tickTravel(99)
        expect(loaded.state.travelTicks).toBe(12)
    })

    it('encounter rate is identical before and after reload', () => {
        const h = new TravelHarness()
        h.state.encounterRate = 25
        const snap = h.snapshot()
        const loaded = TravelHarness.fromSnapshot(snap)
        expect(loaded.state.encounterRate).toBe(h.state.encounterRate)
    })

    it('same roll produces same encounter outcome before and after reload', () => {
        const original = new TravelHarness()
        original.state.encounterRate = 30

        const snap = original.snapshot()
        const loaded = TravelHarness.fromSnapshot(snap)

        // deterministic roll = 10 (< 30, should encounter)
        const before = original.tickTravel(10)
        const after = loaded.tickTravel(10)
        expect(after).toBe(before)
    })

    it('full golden-path sequence: move → encounter → resolve → save → reload → move', () => {
        // 1. Start travel
        const h = new TravelHarness()
        h.moveOnWorldMap(5, 5)

        // 2. No-encounter tick
        expect(h.tickTravel(90)).toBe(false)

        // 3. Encounter tick
        h.state.encounterRate = 30
        expect(h.tickTravel(10)).toBe(true)
        expect(h.state.inEncounter).toBe(true)

        // 4. Resolve encounter and enter location
        h.resolveEncounter('raider_camp')
        expect(h.state.currentMap).toBe('raider_camp')

        // 5. Continue to a named location
        h.enterLocation('the_hub')
        expect(h.state.currentMap).toBe('the_hub')

        // 6. Save
        const snap = h.snapshot()
        expect(snap.inEncounter).toBe(false)
        expect(snap.currentMap).toBe('the_hub')

        // 7. Reload
        const loaded = TravelHarness.fromSnapshot(snap)
        expect(loaded.state.currentMap).toBe('the_hub')
        expect(loaded.state.inEncounter).toBe(false)

        // 8. Continue travel — no phantom encounters from stale state
        loaded.moveOnWorldMap(6, 6)
        expect(loaded.tickTravel(90)).toBe(false) // high roll — no encounter
        expect(loaded.state.inEncounter).toBe(false)
    })
})
