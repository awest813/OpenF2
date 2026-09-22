/**
 * ui2 visual harness — Node renderer.
 *
 * Renders each panel scenario with the real UIManagerImpl pipeline into
 * @napi-rs/canvas and writes PNGs to tools/ui2harness/out/<state>.png for
 * eyeball QA (no browser needed).
 *
 * Bundle & run:
 *   npx esbuild tools/ui2harness/ui2harness-node.ts --bundle --platform=node \
 *     --format=cjs --external:@napi-rs/canvas --outfile=js/ui2harness-node.cjs
 *   node js/ui2harness-node.cjs [state ...]
 */

import './node-globals.js'
import fs from 'node:fs'
import path from 'node:path'

import { UIManagerImpl, UIFontSet, setActiveUIFont } from '../../src/ui2/uiPanel.js'
import { buildSyntheticFonts } from './synthetic-fonts.js'
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
import { EntityManager } from '../../src/ecs/entityManager.js'
import { createPlayerEntity } from '../../src/ecs/entityFactory.js'
import { QuestLog } from '../../src/quest/questLog.js'
import { grantPerk, PERKS } from '../../src/character/perks.js'
import { syncPlayerEntityFromCritter } from '../../src/playerProjection.js'
import globalState from '../../src/globalState.js'

const WIDTH = 800
const HEIGHT = 600
const OUT_DIR = path.resolve(__dirname, '..', 'tools', 'ui2harness', 'out')

function main(): void {
    fs.mkdirSync(OUT_DIR, { recursive: true })

    // Exercise the bitmap-font path: panels draw through UIFontSet with
    // synthetic 9/11/13px fonts shaped exactly like parsed .FON files.
    setActiveUIFont(new UIFontSet(buildSyntheticFonts()))

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
    const chargen = mgr.get<CharacterCreationPanel>('characterCreation')
    const worldMap = mgr.get<WorldMapPanel>('worldMap')
    const calledShot = mgr.get<CalledShotPanel>('calledShot')
    const skilldex = mgr.get<SkilldexPanel>('skilldex')

    const closeAll = (): void => {
        for (const p of mgr.panels) {
            if (p.name !== 'gamePanel') {p.visible = false}
        }
    }
    const clickPipboyTab = (idx: number): void => {
        // Tab hit-testing uses panel-local coords: panel width 400 / 6 tabs.
        pipboy.onMouseDown(idx * Math.floor(400 / 6) + 4, 40, 'l')
    }
    const clickCharacterTab = (idx: number): void => {
        character.onMouseDown(10 + idx * 120 + 6, 42, 'l')
    }
    const clickWorldMapArea = (row: number): void => {
        // LIST_Y=48, rows start +4, AREA_ROW_H=24 (world map view)
        worldMap.onMouseDown(20, 48 + 4 + row * 24 + 5, 'l')
    }

    const STATES: Record<string, () => void> = {
        hud() { closeAll() },

        inventory() {
            closeAll()
            inventory.items = Array.from({ length: 14 }, (_, i) => ({
                name: i % 2 === 0 ? `Stimpak Mk.${i}` : `Super_Toolkit_${i}`,
                amount: (i % 4) + 1,
                canUse: i % 3 === 0,
            }))
            inventory.leftHand = { name: 'Minigun', amount: 1, canUse: false }
            inventory.rightHand = { name: 'Leather Jacket', amount: 1, canUse: false }
            inventory.show()
        },

        'dialogue-few'() {
            closeAll()
            dialogue.setReply('Hmm, I see you are new to Klamath. The traps downstairs can be deadly. You will want to destroy them with a spear or a crowbar before you explore further, friend.')
            dialogue.addOption('Tell me about the traps.', 0)
            dialogue.addOption('Where can I find a spear?', 1)
            dialogue.addOption('Goodbye.', 2)
            dialogue.show()
        },

        'dialogue-overflow'() {
            closeAll()
            dialogue.setReply('You want work? Everyone wants work. But me, I have plenty of jobs, and most of them are dangerous, dirty, and pay almost nothing. Which one do you fancy?')
            for (let i = 1; i <= 8; i++) {
                dialogue.addOption(`Very long option text number ${i} that would definitely overflow a narrow column if it were not truncated at some point`, i)
            }
            dialogue.show()
        },

        loot() {
            closeAll()
            const containerItems = Array.from({ length: 14 }, (_, i) => ({ name: `Rusty Part ${i + 1}`, amount: (i % 5) + 1 }))
            const playerItems = Array.from({ length: 12 }, (_, i) => ({ name: `Player Loot ${i + 1}`, amount: 1 }))
            loot.openWith(playerItems, containerItems)
        },

        barter() {
            closeAll()
            const mk = (prefix: string, value: number) => ({ name: prefix, amount: 2, value })
            barter.openWith(
                Array.from({ length: 9 }, (_, i) => mk(`Player Goods ${i + 1}`, 10 + i * 5)),
                Array.from({ length: 9 }, (_, i) => mk(`Merchant Wares ${i + 1}`, 20 + i * 7)),
            )
        },

        'elevator-many'() {
            closeAll()
            elevator.openWith(Array.from({ length: 7 }, (_, i) => ({
                label: `Level ${i + 1}`,
                mapID: 1,
                level: i,
                tileNum: 1000 + i * 100,
            })))
        },

        'pipboy-status'() {
            closeAll()
            pipboy.show()
            clickPipboyTab(0)
        },

        'pipboy-items'() {
            closeAll()
            const inv = EntityManager.get<'inventory'>(playerEntityId, 'inventory')
            inv.items = Array.from({ length: 30 }, (_, i) => ({ pid: 100 + i, count: (i % 6) + 1 })) as any
            pipboy.show()
            clickPipboyTab(1)
        },

        'character-perks'() {
            closeAll()
            syncPlayerEntityFromCritter()
            const stats = EntityManager.get<'stats'>(playerEntityId, 'stats')!
            const skills = EntityManager.get<'skills'>(playerEntityId, 'skills')!
            const player = EntityManager.get<'player'>(playerEntityId, 'player')!
            player.perksAvailable = 2
            if (grantPerk(PERKS[0].id, stats, skills, new Map())) {
                player.acquiredPerks.push(PERKS[0].id)
                player.perksAvailable = Math.max(0, player.perksAvailable - 1)
            }
            character.show()
            clickCharacterTab(2)
        },

        'character-skills'() {
            closeAll()
            const skills = EntityManager.get<'skills'>(playerEntityId, 'skills')!
            skills.availablePoints = 5
            character.show()
            clickCharacterTab(1)
        },

        chargen() {
            closeAll()
            chargen.show()
        },

        worldmap() {
            closeAll()
            worldMap.areas = [
                { name: 'Arroyo', id: 0, entrances: [{ mapLookupName: 'ARROYOENT', x: 10, y: 20 }] },
                { name: 'Klamath', id: 1, entrances: [{ mapLookupName: 'KLAMATH', x: 30, y: 40 }, { mapLookupName: 'KLADWNTHT', x: 5, y: 6 }] },
                { name: 'The Den', id: 2, entrances: [] },
                { name: 'Modoc With A Very Long Name Indeed', id: 3, entrances: [] },
                ...Array.from({ length: 14 }, (_, i) => ({ name: `Area ${i + 4}`, id: i + 4, entrances: [] })),
            ]
            worldMap.show()
        },

        'worldmap-area'(stateKey?: string) {
            // Rendered after worldmap() in the runner below (enter Klamath).
            void stateKey
        },

        'called-shot'() {
            closeAll()
            calledShot.openWith({ torso: 95, head: 46, eyes: 24, groin: 61, left_arm: 75, right_arm: 75, left_leg: 68, right_leg: 68 })
        },

        skilldex() {
            closeAll()
            skilldex.show()
        },

        options() {
            closeAll()
            mgr.get<import('../../src/ui2/optionsPanel.js').OptionsPanel>('options').show()
        },

        'savLoad-load'() {
            closeAll()
            mgr.get<import('../../src/ui2/saveLoadPanel.js').SaveLoadPanel>('saveLoad').openAs('load')
        },

        'main-menu'() {
            closeAll()
            mgr.get<import('../../src/ui2/mainMenuPanel.js').MainMenuPanel>('mainMenu').show()
        },

        credits() {
            closeAll()
            mgr.get<import('../../src/ui2/creditsPanel.js').CreditsPanel>('credits').show()
        },
    }

    const requested = process.argv.slice(2)
    const names = requested.length > 0 ? requested : Object.keys(STATES).filter((n) => n !== 'worldmap-area')

    for (const name of names) {
        const fn = STATES[name]
        if (!fn) {
            console.error('unknown state: ' + name)
            continue
        }
        fn()
        if (name === 'worldmap-area') {
            worldMap.show()
            clickWorldMapArea(1)  // enter Klamath area view
        }
        const frame = mgr.render() as unknown as OffscreenCanvasShim
        const out = path.join(OUT_DIR, name + '.png')
        fs.writeFileSync(out, frame.toBuffer('image/png'))
        console.log('wrote ' + out)
    }
}

main()
