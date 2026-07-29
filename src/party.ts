/*
Copyright 2015 darkf

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import globalState from './globalState.js'
import { Critter, deserializeObj, SerializedObj } from './object.js'
import { arrayIncludes, arrayRemove } from './util.js'
import {
    PartyMemberControl,
    PartyDistance,
    PartyDisposition,
    PartyAttackWho,
    PartyRunAway,
    PARTY_STATE_WAITING,
    defaultControlFromDef,
    getPartyMemberDef,
    expectedLevelIndex,
    sanitizePartyMemberControl,
} from './partyDefs.js'

export type { PartyMemberControl } from './partyDefs.js'
export {
    getPartyMemberDef,
    listPartyMemberDefs,
    parsePartyTxt,
    BUILTIN_PARTY_DEFS,
    PARTY_STATE_WAITING,
} from './partyDefs.js'

// Party member system for OpenF2 (Slice G / P1-3 control depth)

function controlKey(obj: Critter): number {
    return typeof obj?.pid === 'number' ? obj.pid : 0
}

export class Party {
    // party members
    party: Critter[] = []
    /** Combat-control / follow state keyed by member PID. */
    private controls = new Map<number, PartyMemberControl>()

    addPartyMember(obj: Critter) {
        console.log('party member %o added', obj)
        this.party.push(obj)
        const pid = controlKey(obj)
        if (pid && !this.controls.has(pid)) {
            this.controls.set(pid, defaultControlFromDef(getPartyMemberDef(pid)))
        }
        // FO2: party members join the player's team
        if (obj && typeof (obj as any).teamNum !== 'undefined') {
            ;(obj as any).teamNum = 0
        }
    }

    removePartyMember(obj: Critter) {
        console.log('party member %o removed', obj)
        if (!arrayRemove(this.party, obj))
            {console.warn('removePartyMember: member not in party — no-op')}
        const pid = controlKey(obj)
        if (pid) this.controls.delete(pid)
    }

    getPartyMembers(): Critter[] {
        return this.party
    }

    getPartyMembersAndPlayer(): Critter[] {
        return [<Critter>globalState.player].concat(this.party)
    }

    isPartyMember(obj: Critter) {
        return arrayIncludes(this.party, obj)
    }

    getPartyMemberByPID(pid: number) {
        return this.party.find((obj) => obj.pid === pid) || null
    }

    getControl(obj: Critter | null | undefined): PartyMemberControl | null {
        if (!obj) return null
        const pid = controlKey(obj)
        if (!pid || !this.isPartyMember(obj)) return null
        let ctrl = this.controls.get(pid)
        if (!ctrl) {
            ctrl = defaultControlFromDef(getPartyMemberDef(pid))
            this.controls.set(pid, ctrl)
        }
        return ctrl
    }

    getControlByPid(pid: number): PartyMemberControl | null {
        const member = this.getPartyMemberByPID(pid)
        return member ? this.getControl(member) : null
    }

    setWaiting(obj: Critter, waiting: boolean): void {
        const ctrl = this.getControl(obj)
        if (ctrl) ctrl.waiting = !!waiting
    }

    setDistance(obj: Critter, distance: PartyDistance): void {
        const ctrl = this.getControl(obj)
        const def = getPartyMemberDef(obj?.pid)
        if (!ctrl) return
        if (def && def.distance.length > 0 && !def.distance.includes(distance)) {
            console.warn('setDistance: %s not allowed for pid %s', distance, obj.pid)
            return
        }
        ctrl.distance = distance
        // Stay implies wait-in-place for follow queries
        if (distance === 'stay') ctrl.waiting = true
        if (distance !== 'stay' && distance !== undefined) {
            // leaving stay resumes follow unless explicitly waiting
        }
    }

    setDisposition(obj: Critter, disposition: PartyDisposition): void {
        const ctrl = this.getControl(obj)
        const def = getPartyMemberDef(obj?.pid)
        if (!ctrl) return
        if (def && def.disposition.length > 0 && !def.disposition.includes(disposition)) {
            console.warn('setDisposition: %s not allowed for pid %s', disposition, obj.pid)
            return
        }
        ctrl.disposition = disposition
    }

    setAttackWho(obj: Critter, attackWho: PartyAttackWho): void {
        const ctrl = this.getControl(obj)
        const def = getPartyMemberDef(obj?.pid)
        if (!ctrl) return
        if (def && def.attackWho.length > 0 && !def.attackWho.includes(attackWho)) {
            console.warn('setAttackWho: %s not allowed for pid %s', attackWho, obj.pid)
            return
        }
        ctrl.attackWho = attackWho
    }

    setRunAwayMode(obj: Critter, runAwayMode: PartyRunAway): void {
        const ctrl = this.getControl(obj)
        const def = getPartyMemberDef(obj?.pid)
        if (!ctrl) return
        if (def && def.runAwayMode.length > 0 && !def.runAwayMode.includes(runAwayMode)) {
            console.warn('setRunAwayMode: %s not allowed for pid %s', runAwayMode, obj.pid)
            return
        }
        ctrl.runAwayMode = runAwayMode
    }

    /** True when the member should trail the player (not waiting / stay). */
    isFollowing(obj: Critter): boolean {
        const ctrl = this.getControl(obj)
        if (!ctrl) return false
        if (ctrl.waiting) return false
        if (ctrl.distance === 'stay') return false
        return true
    }

    /**
     * FO2-ish state bitfield for metarule(25).
     * Bit 0 (PARTY_STATE_WAITING) = ordered to wait / stay.
     */
    getStateFlags(obj: Critter): number {
        const ctrl = this.getControl(obj)
        if (!ctrl) return 0
        let flags = 0
        if (ctrl.waiting || ctrl.distance === 'stay') flags |= PARTY_STATE_WAITING
        return flags
    }

    /**
     * Apply party.txt level tiers for the current player level.
     * Records appliedLevelPid; does not swap art (asset-free).
     * Returns number of tier advancements performed.
     */
    applyLevelTiersForPlayerLevel(playerLevel: number): number {
        if (typeof playerLevel !== 'number' || !Number.isFinite(playerLevel)) return 0
        let advanced = 0
        for (const member of this.party) {
            const def = getPartyMemberDef(member.pid)
            const ctrl = this.getControl(member)
            if (!def || !ctrl) continue
            const expected = expectedLevelIndex(def, playerLevel)
            while (ctrl.levelIndex < expected) {
                const nextPid = def.levelPids[ctrl.levelIndex]
                ctrl.levelIndex++
                ctrl.appliedLevelPid = nextPid
                advanced++
                console.log(
                    'party tier: %s → level_pid %s (index %s) at player level %s',
                    def.name,
                    nextPid,
                    ctrl.levelIndex,
                    playerLevel,
                )
            }
        }
        return advanced
    }

    serialize(): SerializedObj[] {
        return this.party.map((obj) => obj.serialize())
    }

    serializeControls(): Record<string, PartyMemberControl> {
        const out: Record<string, PartyMemberControl> = {}
        for (const [pid, ctrl] of this.controls) {
            out[String(pid)] = { ...ctrl }
        }
        return out
    }

    deserialize(objs: SerializedObj[]): void {
        this.party.length = 0
        this.controls.clear()
        for (const obj of objs) {
            const member = <Critter>deserializeObj(obj)
            this.party.push(member)
            const pid = controlKey(member)
            if (pid) {
                this.controls.set(pid, defaultControlFromDef(getPartyMemberDef(pid)))
            }
        }
    }

    deserializeControls(raw: Record<string, any> | null | undefined): void {
        if (!raw || typeof raw !== 'object') return
        for (const [key, value] of Object.entries(raw)) {
            const pid = Number(key)
            if (!Number.isFinite(pid)) continue
            // Only keep controls for members currently in the party
            if (!this.getPartyMemberByPID(pid)) continue
            this.controls.set(pid, sanitizePartyMemberControl(value))
        }
    }
}
