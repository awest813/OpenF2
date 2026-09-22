/**
 * ui2 visual harness — renders the canvas panels with representative mock
 * data into the real UIManagerImpl pipeline for eyeball QA.
 *
 * Bundle with:
 *   npx esbuild tools/ui2harness/ui2harness.ts --bundle --format=esm \
 *     --outfile=js/ui2harness.js
 * Serve the repo root and open /tools/ui2harness/ui2harness.html
 *
 * window.showState(name) switches the rendered scenario; window.listStates()
 * lists them.
 */

import { UIManagerImpl } from '../../src/ui2/uiPanel.js'
import { registerDefaultPanels } from '../../src/ui2/registerPanels.js'
import { DialoguePanel } from '../../src/ui2/dialoguePanel.js'
import { LootPanel } from '../../src/ui2/lootPanel.js'
import { BarterPanel } from '../../src/ui2/barterPanel.js'
import { ElevatorPanel } from '../../src/ui2/elevatorPanel.js'
import { InventoryPanel } from '../../src/ui2/inventoryPanel.js'
import { PipBoyPanel } from '../../src/ui2/pipboy.js'
import { CharacterScreen } from '../../src/ui2/characterScreen.js'
import { CharacterCreationPanel } from '../../src/ui2/characterCreationPanel.js'
import { WorldMapPanel } from '../../src/ui2/worldMapPanel.js'
import { CalledShotPanel } from '../../src/ui2/calledShotPanel.js'
import { SkilldexPanel } from '../../src/ui2/skilldexPanel.js'
import { EventBus } from '../../src/eventBus.js'
import { EntityManager } from '../../src/ecs/entityManager.js'
import { createPlayerEntity } from '../../src/ecs/entityFactory.js'
import { QuestLog } from '../../src/quest/questLog.js'
import { grantPerk, PERKS } from '../../src/character/perks.js'
import { syncPlayerEntityFromCritter } from '../../src/playerProjection.js'
import globalState from '../../src/globalState.js'

const WIDTH = 800
const HEIGHT = 600

function makeItem(name: string, amount = 1, canUse = false) {
    return { name, amount, canUse }
}

function main(): void {
    const canvas = document.getElementById('stage') as HTMLCanvasElement
    const ctx = canvas.getContext('2d')!

    const mgr = new UIManagerImpl(WIDTH, HEIGHT)
    const playerEntityId = createPlayerEntity({ name: 'VAULT DWELLER' })
    globalState.playerEntityId = playerEntityId

    registerDefaultPanels(mgr, WIDTH, HEIGHT, playerEntityId, new QuestLog())

    const dialogue = mgr.get<DialoguePanel>('dialogue')
    const loot = mgr.get<LootPanel>('loot')
    const barter = mgr.get<BarterPanel>('barter')
    const elevator = mgr.get<ElevatorPanel>('elevator')
    const inventory = mgr.get<InventoryPanel>('inventory')
    const pipboy = mgr.get<PipBoyPanel>('pipboy')
    const character = mgr.get<CharacterScreen>('characterScreen')
    const chargen = mgr.get<CharacterCreationPanel>('characterCreationPanel')
    const worldMap = mgr.get<WorldMapPanel>('worldMap')
    const calledShot = mgr.get<CalledShotPanel>('calledShot')
    const skilldex = mgr.get<SkilldexPanel>('skilldex')

    function clickCharacterTab(idx: number): void {
        character.onMouseDown(10 + idx * 120 + 6, 42, 'l')
    }

    // ── Scenario definitions ────────────────────────────────────────────
    const STATES: Record<string, () => void> = {
        hud() {
            closeAll(mgr)
        },

        inventory() {
            closeAll(mgr)
            inventory.items = Array.from({ length: 14 }, (_, i) =>
                makeItem(i % 2 === 0 ? `Stimpak Mk.${i}` : `Super_Toolkit_${i}`, (i % 4) + 1, i % 3 === 0))
            inventory.leftHand = makeItem('Minigun', 1)
            inventory.rightHand = makeItem('Leather Jacket', 1)
            inventory.show()
        },

        'dialogue-few'() {
            closeAll(mgr)
            dialogue.setReply('Hmm, I see you are new to Klamath. The traps downstairs can be deadly. You will want to destroy them with a spear or a crowbar before you explore further, friend.')
            dialogue.addOption('Tell me about the traps.', 0)
            dialogue.addOption('Where can I find a spear?', 1)
            dialogue.addOption('Goodbye.', 2)
            dialogue.show()
        },

        'dialogue-overflow'() {
            closeAll(mgr)
            dialogue.setReply('You want work? Everyone wants work. But me, I have plenty of jobs, and most of them are dangerous, dirty, and pay almost nothing. Which one do you fancy?')
            for (let i = 1; i <= 8; i++) {
                dialogue.addOption(`Very long option text number ${i} that would definitely overflow a narrow column if it were not truncated at some point`, i)
            }
            dialogue.show()
        },

        loot() {
            closeAll(mgr)
            const containerItems = Array.from({ length: 14 }, (_, i) => ({ name: `Rusty Part ${i + 1}`, amount: (i % 5) + 1 }))
            const playerItems = Array.from({ length: 12 }, (_, i) => ({ name: `Player Loot ${i + 1}`, amount: 1 }))
            loot.openWith(playerItems, containerItems)
        },

        barter() {
            closeAll(mgr)
            const mk = (prefix: string, value: number) => ({ name: prefix, amount: 2, value })
            const playerItems = Array.from({ length: 9 }, (_, i) => mk(`Player Goods ${i + 1}`, 10 + i * 5))
            const merchantItems = Array.from({ length: 9 }, (_, i) => mk(`Merchant Wares ${i + 1}`, 20 + i * 7))
            barter.openWith(playerItems, merchantItems)
        },

        'elevator-many'() {
            closeAll(mgr)
            elevator.openWith(Array.from({ length: 7 }, (_, i) => ({
                label: `Level ${i + 1}`,
                mapID: 1,
                level: i,
                tileNum: 1000 + i * 100,
            })))
        },

        'pipboy-status'() {
            closeAll(mgr)
            pipboy.show()
            clickPipboyTab(mgr, 0)
        },

        'pipboy-items'() {
            closeAll(mgr)
            const inv = EntityManager.get<'inventory'>(playerEntityId, 'inventory')
            inv.items = Array.from({ length: 30 }, (_, i) => ({
                pid: 100 + i,
                count: (i % 6) + 1,
            })) as any
            pipboy.show()
            clickPipboyTab(mgr, 1)
        },

        'character-perks'() {
            closeAll(mgr)
            syncPlayerEntityFromCritter()
            // Grant one perk and make one available so the perks list has
            // available + acquired sections.
            const stats = EntityManager.get<'stats'>(playerEntityId, 'stats')!
            const skills = EntityManager.get<'skills'>(playerEntityId, 'skills')!
            const player = EntityManager.get<'player'>(playerEntityId, 'player')!
            player.perksAvailable = 2
            const granted = grantPerk(PERKS[0].id, stats, skills, new Map())
            if (granted) {
                player.acquiredPerks.push(PERKS[0].id)
                player.perksAvailable = Math.max(0, player.perksAvailable - 1)
            }
            character.show()
            clickCharacterTab(2)  // perks
        },

        'character-skills'() {
            closeAll(mgr)
            const skills = EntityManager.get<'skills'>(playerEntityId, 'skills')!
            skills.availablePoints = 5
            character.show()
            clickCharacterTab(1)  // skills
        },

        chargen() {
            closeAll(mgr)
            chargen.show()
        },

        worldmap() {
            closeAll(mgr)
            worldMap.areas = [
                { name: 'Arroyo', id: 0, entrances: [{ mapLookupName: 'ARROYOENT', x: 10, y: 20 }] },
                { name: 'Klamath', id: 1, entrances: [{ mapLookupName: 'KLAMATH', x: 30, y: 40 }, { mapLookupName: 'KLADWNTHT', x: 5, y: 6 }] },
                { name: 'The Den', id: 2, entrances: [] },
                { name: 'Modoc With A Very Long Name Indeed', id: 3, entrances: [] },
                ...Array.from({ length: 14 }, (_, i) => ({ name: `Area ${i + 4}`, id: i + 4, entrances: [] })),
            ]
            worldMap.show()
        },

        'called-shot'() {
            closeAll(mgr)
            calledShot.openWith({ torso: 95, head: 46, eyes: 24, groin: 61, left_arm: 75, right_arm: 75, left_leg: 68, right_leg: 68 })
        },

        skilldex() {
            closeAll(mgr)
            skilldex.show()
        },
    }

    ;(window as any).showState = (name: string) => {
        const fn = STATES[name]
        if (!fn) {
            console.error('unknown state: ' + name + ' (available: ' + Object.keys(STATES).join(', ') + ')')
            return
        }
        fn()
        renderOnce()
    }
    ;(window as any).listStates = () => Object.keys(STATES)
    ;(window as any).__ready = true

    function closeAll(m: UIManagerImpl): void {
        for (const p of m.panels) {
            if (p.name !== 'gamePanel') {p.visible = false}
        }
    }

    function clickPipboyTab(m: UIManagerImpl, idx: number): void {
        const pip = m.get<PipBoyPanel>('pipboy')
        const tabW = Math.floor(WIDTH / 6)
        pip.onMouseDown(idx * tabW + 4, 40, 'l')
    }

    let rafPending = false
    function renderOnce(): void {
        if (rafPending) {return}
        rafPending = true
        requestAnimationFrame(() => {
            rafPending = false
            const frame = mgr.render()
            ctx.clearRect(0, 0, WIDTH, HEIGHT)
            ctx.drawImage(frame as unknown as CanvasImageSource, 0, 0)
        })
    }

    renderOnce()
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', main)
} else {
    main()
}

// Silence unused-import lint in the harness (EventBus kept for console experiments).
void EventBus
