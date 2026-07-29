/**
 * Parity Slice G (continued) — party companion control / party.txt tiers (P1-3).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import globalState from './globalState.js'
import { Party } from './party.js'
import {
    getPartyMemberDef,
    parsePartyTxt,
    expectedLevelIndex,
    PARTY_STATE_WAITING,
    BUILTIN_PARTY_DEFS,
} from './partyDefs.js'
import { Scripting } from './scripting.js'
import { migrateSave, SAVE_VERSION } from './saveSchema.js'
import { Critter } from './object.js'

function makeMember(pid: number, name = 'Companion'): Critter {
    return { pid, name, type: 'critter', teamNum: 3, position: { x: 10, y: 10 } } as any
}

describe('Parity Slice G — party defs', () => {
    it('embeds campaign companion defs including Sulik and Vic', () => {
        expect(BUILTIN_PARTY_DEFS.length).toBeGreaterThanOrEqual(8)
        expect(getPartyMemberDef(16777313)?.name).toBe('Sulik')
        expect(getPartyMemberDef(16777278)?.levelUpEvery).toBe(4)
    })

    it('parsePartyTxt registers a custom companion row', () => {
        const text = `
[Party Member 99]
; pM TestBuddy_PID
party_member_pid=16777999
area_attack_mode=always
attack_who=closest
best_weapon=unarmed
chem_use=clean
distance=stay_close,stay
run_away_mode=none
disposition=defensive
level_minimum=3
level_up_every=2
level_pids=16778000,16778001
`
        const defs = parsePartyTxt(text)
        expect(defs.some((d) => d.pid === 16777999)).toBe(true)
        expect(getPartyMemberDef(16777999)?.levelPids).toEqual([16778000, 16778001])
    })

    it('expectedLevelIndex follows level_minimum / level_up_every', () => {
        const sulik = getPartyMemberDef(16777313)!
        expect(expectedLevelIndex(sulik, 5)).toBe(0)
        expect(expectedLevelIndex(sulik, 6)).toBe(1)
        expect(expectedLevelIndex(sulik, 9)).toBe(2)
    })
})

describe('Parity Slice G — party control runtime', () => {
    let savedParty: typeof globalState.gParty

    beforeEach(() => {
        savedParty = globalState.gParty
        globalState.gParty = new Party()
    })

    afterEach(() => {
        globalState.gParty = savedParty
    })

    it('addPartyMember initializes control defaults from party.txt def', () => {
        const sulik = makeMember(16777313, 'Sulik')
        globalState.gParty.addPartyMember(sulik)
        const ctrl = globalState.gParty.getControl(sulik)!
        expect(ctrl.waiting).toBe(false)
        expect(ctrl.distance).toBe('stay_close')
        expect(globalState.gParty.isFollowing(sulik)).toBe(true)
        expect(sulik.teamNum).toBe(0)
    })

    it('setWaiting toggles follow metarule semantics', () => {
        const vic = makeMember(16777278, 'Vic')
        globalState.gParty.addPartyMember(vic)
        expect(globalState.gParty.isFollowing(vic)).toBe(true)
        globalState.gParty.setWaiting(vic, true)
        expect(globalState.gParty.isFollowing(vic)).toBe(false)
        expect(globalState.gParty.getStateFlags(vic) & PARTY_STATE_WAITING).toBe(PARTY_STATE_WAITING)
    })

    it('applyLevelTiersForPlayerLevel advances Sulik tiers', () => {
        const sulik = makeMember(16777313, 'Sulik')
        globalState.gParty.addPartyMember(sulik)
        const n = globalState.gParty.applyLevelTiersForPlayerLevel(9)
        expect(n).toBe(2)
        const ctrl = globalState.gParty.getControl(sulik)!
        expect(ctrl.levelIndex).toBe(2)
        expect(ctrl.appliedLevelPid).toBe(16777527)
    })

    it('serializeControls / deserializeControls round-trip waiting', () => {
        const marcus = makeMember(16777377, 'Marcus')
        globalState.gParty.addPartyMember(marcus)
        globalState.gParty.setWaiting(marcus, true)
        globalState.gParty.setDistance(marcus, 'on_your_own')
        const snap = globalState.gParty.serializeControls()
        globalState.gParty.setWaiting(marcus, false)
        globalState.gParty.deserializeControls(snap)
        expect(globalState.gParty.getControl(marcus)?.waiting).toBe(true)
        expect(globalState.gParty.getControl(marcus)?.distance).toBe('on_your_own')
    })

    it('metarule 19/25 reflect follow and waiting state', () => {
        const dog = makeMember(16777558, 'Dogmeat')
        globalState.gParty.addPartyMember(dog)
        const script = new (Scripting as any).Script()
        script.self_obj = dog
        expect(script.metarule(19, dog)).toBe(1)
        expect(script.metarule(25, dog)).toBe(0)
        globalState.gParty.setWaiting(dog, true)
        expect(script.metarule(19, dog)).toBe(0)
        expect(script.metarule(25, dog) & PARTY_STATE_WAITING).toBe(PARTY_STATE_WAITING)
    })
})

describe('Parity Slice G — save schema v21 partyControls', () => {
    it('migrates v20 saves to v21 with empty partyControls', () => {
        const migrated = migrateSave({
            version: 20,
            name: 't',
            timestamp: 0,
            currentMap: 'arroyo',
            currentElevation: 0,
            player: {
                position: { x: 1, y: 1 },
                orientation: 0,
                inventory: [],
                xp: 0,
                level: 1,
                karma: 0,
            },
            party: [],
            savedMaps: {},
            partyMembersHp: {},
        })
        expect(migrated.version).toBe(SAVE_VERSION)
        expect(SAVE_VERSION).toBe(23)
        expect(migrated.partyControls).toEqual({})
    })
})
