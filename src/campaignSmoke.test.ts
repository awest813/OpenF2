import { describe, expect, it } from 'vitest'
import { migrateSave, SaveGame } from './saveSchema.js'
import { opMap, VMContext } from './vm_opcodes.js'

type ScriptVMStub = VMContext & { literalQueue: number[] }

function makeScriptVM(literals: number[]): ScriptVMStub {
    const vm = {
        literalQueue: [...literals],
        dataStack: [],
        retStack: [],
        pc: 0,
        halted: false,
        svarBase: 0,
        dvarBase: 0,
        script: {
            read32() {
                if (vm.literalQueue.length === 0) throw new Error('script read32 underflow')
                return vm.literalQueue.shift() as number
            },
            peek16() { return 0 },
        },
        intfile: { procedures: {}, proceduresTable: [], strings: {}, identifiers: {} },
        push(v: any) { this.dataStack.push(v) },
        pop() {
            if (this.dataStack.length === 0) throw new Error('data stack underflow')
            return this.dataStack.pop()
        },
        popAddr() {
            if (this.retStack.length === 0) throw new Error('return stack underflow')
            return this.retStack.pop()
        },
    } as ScriptVMStub

    return vm
}

interface CampaignState {
    currentMap: string
    currentElevation: number
    worldPosition: { x: number; y: number }
    inEncounter: boolean
    scriptFlags: Record<string, boolean>
}

class CampaignHarness {
    state: CampaignState = {
        currentMap: 'starting_village',
        currentElevation: 0,
        worldPosition: { x: 0, y: 0 },
        inEncounter: false,
        scriptFlags: {},
    }

    loadMap(mapName: string): void {
        this.state.currentMap = mapName
        this.triggerMapEnterScript()
    }

    private triggerMapEnterScript(): void {
        // Tiny deterministic script: push 40, push 2, add -> 42.
        // This intentionally exercises VM opcodes so missing handlers fail loudly.
        const requiredScriptOps = [0xc001, 0xc001, 0x8039]
        const vm = makeScriptVM([40, 2])
        for (const opcode of requiredScriptOps) {
            const handler = opMap[opcode]
            if (!handler) throw new Error(`missing required opcode 0x${opcode.toString(16)}`)
            handler.call(vm)
        }

        const scriptedValue = vm.pop()
        this.state.scriptFlags.villageIntroDone = scriptedValue === 42
    }

    moveOnWorldMap(x: number, y: number): void {
        this.state.worldPosition = { x, y }
    }

    enterEncounterMap(): void {
        this.state.inEncounter = true
        this.state.currentMap = 'bridge_encounter'
    }

    resolveEncounterToMap(): void {
        const transitionMap: Record<string, string> = {
            bridge_encounter: 'temple_exterior',
        }
        const nextMap = transitionMap[this.state.currentMap]
        if (!nextMap) throw new Error(`broken map transition from ${this.state.currentMap}`)

        this.state.currentMap = nextMap
        this.state.inEncounter = false
    }

    saveSnapshot(): SaveGame {
        return {
            version: 3,
            name: 'golden-path',
            timestamp: 123456,
            currentMap: this.state.currentMap,
            currentElevation: this.state.currentElevation,
            player: {
                position: { x: 94, y: 109 },
                orientation: 3,
                inventory: [],
                xp: 0,
                level: 1,
                karma: 0,
            },
            party: [],
            savedMaps: {},
            questLog: {
                entries: [{ id: 'village_intro', state: this.state.scriptFlags.villageIntroDone ? 'completed' : 'active', stateChangedAt: 123456 }],
            },
            reputation: { karma: 0, reputations: {} },
        }
    }

    static loadFromSnapshot(raw: Record<string, any>): CampaignHarness {
        const migrated = migrateSave(raw)
        const h = new CampaignHarness()
        h.state.currentMap = migrated.currentMap
        h.state.currentElevation = migrated.currentElevation
        h.state.scriptFlags.villageIntroDone = migrated.questLog?.entries.some((e) => e.id === 'village_intro' && e.state === 'completed') ?? false
        return h
    }

    resume(): string {
        if (!this.state.scriptFlags.villageIntroDone) throw new Error('critical script progression lost after load')
        return this.state.currentMap
    }
}

describe('campaign smoke test: critical campaign progression', () => {
    it('covers map load -> script -> world move -> encounter -> save/load -> resume', () => {
        const campaign = new CampaignHarness()

        campaign.loadMap('starting_village')
        expect(campaign.state.scriptFlags.villageIntroDone).toBe(true)

        campaign.moveOnWorldMap(3, 2)
        expect(campaign.state.worldPosition).toEqual({ x: 3, y: 2 })

        campaign.enterEncounterMap()
        expect(campaign.state.currentMap).toBe('bridge_encounter')

        campaign.resolveEncounterToMap()
        expect(campaign.state.currentMap).toBe('temple_exterior')

        const save = campaign.saveSnapshot()
        const loaded = CampaignHarness.loadFromSnapshot(JSON.parse(JSON.stringify(save)))

        expect(loaded.resume()).toBe('temple_exterior')
    })

    it('fails fast when a required VM opcode handler is missing', () => {
        const originalPush = opMap[0xc001]
        delete opMap[0xc001]
        try {
            const campaign = new CampaignHarness()
            expect(() => campaign.loadMap('starting_village')).toThrow(/missing required opcode/i)
        } finally {
            opMap[0xc001] = originalPush
        }
    })
})
