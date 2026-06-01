/*
Copyright 2014 darkf

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

import { Combat } from './combat.js'
import { Area, Elevator, loadAreas, lookupMapNameFromLookup } from './data.js'
import globalState from './globalState.js'
import { Critter, cloneItem, Obj } from './object.js'
import { Player } from './player.js'
import { lookupInterfaceArt } from './pro.js'
import { objectBoundingBox } from './renderer.js'
import { formatSaveDate, load, save, SaveGame, saveList } from './saveload.js'
import { Scripting } from './scripting.js'
import { Skills } from './skills.js'
import { fromTileNum } from './tile.js'
import { $id, $img, $q, $qa, clearEl, show, hide, showv, hidev, off, appendHTML, makeEl, ElementOptions } from './dom.js'
import { CSSBoundingBox, Widget, WindowFrame, SmallButton, Label, List, ListItem } from './widgets.js'
import { pad } from './util.js'
import { Worldmap } from './worldmap.js'
import { Config } from './config.js'
import { Point } from './geometry.js'
import { lazyLoadImage } from './images.js'
import { assertNoLegacyGameplayPanelFallback } from './ui2/index.js'
import { xpForLevel } from './ecs/derivedStats.js'
import { UIMode } from './uiMode.js'

// UI system

let playerUseHandler: (obj?: Obj) => void = () => {}

export function setPlayerUseHandler(handler: (obj?: Obj) => void): void {
    playerUseHandler = handler
}

// NOTE: UIMode moved to src/uiMode.ts, DOM helpers to src/dom.ts, widget classes to src/widgets.ts,
//       shared uiDragMove extracted from barter/loot handlers, inventory stats view, UI scaling option
// Container that all of the top-level UI elements reside in
let $uiContainer: HTMLElement

function uiInit() {
    $uiContainer = document.getElementById('game-container')!

    initSkilldex()
    // initCharacterScreen();

    document.getElementById('chrButton')!.onclick = () => {
        characterWindow && characterWindow.close()
        initCharacterScreen()
    }
}

let skilldexWindow: WindowFrame
let characterWindow: WindowFrame

function initSkilldex() {
    function useSkill(skill: Skills) {
        return () => {
            skilldexWindow.close()
            globalState.uiMode = UIMode.useSkill
            globalState.skillMode = skill
            console.log('[UI] Using skill:', skill)
        }
    }

    skilldexWindow = new WindowFrame(
        'art/intrface/skldxbox',
        {
            x: Config.ui.screenWidth - 185,
            y: Config.ui.screenHeight - 368 - 99,
        },
        185,
        368
    )
        .add(new Label(65, 13, 'Skilldex'))
        .add(new Label(25, 85, 'Lockpick').onClick(useSkill(Skills.Lockpick)))
        .add(new Label(25, 300, 'Repair').onClick(useSkill(Skills.Repair)))

    lazyLoadImage(skilldexWindow.background, () => globalState.renderer.addWindow(skilldexWindow))
}

function initCharacterScreen() {
    const skillList = new List({ x: 380, y: 27, w: 'auto', h: 'auto' })

    skillList.css({ fontSize: '0.75em' })

    characterWindow = new WindowFrame(
        'art/intrface/edtredt.png',
        {
            x: Config.ui.screenWidth / 2 - 640 / 2,
            y: Config.ui.screenHeight / 2 - 480 / 2,
        },
        640,
        480
    )
        .add(new SmallButton(455, 454).onClick(() => {
            globalState.player.stats = newStatSet
            globalState.player.skills = newSkillSet
            characterWindow.close()
        }))
        .add(new Label(455 + 18, 454, 'Done'))
        .add(
            new SmallButton(552, 454).onClick(() => {
                characterWindow.close()
            })
        )
        .add(new Label(552 + 18, 454, 'Cancel'))
        .add(new Label(22, 6, 'Name'))
        .add(new Label(160, 6, 'Age'))
        .add(new Label(242, 6, 'Gender'))
        .add(
            new Label(33, 280, `Level: ${globalState.player.getStat('Level')}`).css({
                fontSize: '0.75em',
                color: '#00FF00',
            })
        )
        .add(
            new Label(33, 292, `Exp: ${globalState.player.getStat('Experience')}`).css({
                fontSize: '0.75em',
                color: '#00FF00',
            })
        )
        .add(new Label(380, 5, 'Skill'))
        .add(new Label(399, 233, 'Skill Points'))
        .add(
            new Label(
                194,
                45,
                `Hit Points ${globalState.player.getStat('HP')}/${globalState.player.getStat('Max HP')}`
            ).css({ fontSize: '0.75em', color: '#00FF00' })
        )
        .add(skillList)
        .show()

    const skills = [
        'Small Guns',
        'Big Guns',
        'Energy Weapons',
        'Unarmed',
        'Melee Weapons',
        'Throwing',
        'First Aid',
        'Doctor',
        'Sneak',
        'Lockpick',
        'Steal',
        'Traps',
        'Science',
        'Repair',
        'Speech',
        'Barter',
        'Gambling',
        'Outdoorsman',
    ]

    const stats = ['STR', 'PER', 'END', 'CHA', 'INT', 'AGI', 'LUK']

    const statWidgets: Label[] = []

    let selectedStat = stats[0]
    const STAT_ROW_HEIGHT = 33

    for (let i = 0; i < stats.length; i++) {
        const stat = stats[i]
        const widget = new Label(20, 39 + i * STAT_ROW_HEIGHT, '').css({ background: 'black', padding: '5px' })
        widget.onClick(() => {
            selectedStat = stat
        })
        statWidgets.push(widget)
        characterWindow.add(widget)
    }

    const newStatSet = globalState.player.stats.clone()
    const newSkillSet = globalState.player.skills.clone()

    // Skill Points / Tag Skills counter
    const skillPointCounter = new Label(522, 230, '').css({ background: 'black', padding: '5px' })
    characterWindow.add(skillPointCounter)

    const redrawStatsSkills = () => {
        // Draw skills
        skillList.clear()

        for (const skill of skills) {
            skillList.addItem({ text: `${skill} ${newSkillSet.get(skill, newStatSet)}%`, id: skill })
        }

        // Draw stats
        for (let i = 0; i < stats.length; i++) {
            const stat = stats[i]
            statWidgets[i].setText(`${stat} - ${newStatSet.get(stat)}`)
        }

        // Update skill point counter
        skillPointCounter.setText(pad(newSkillSet.skillPoints, 2))
    }

    redrawStatsSkills()

    const isLevelUp = globalState.playerPerksOwed > 0 || newSkillSet.skillPoints > 0
    const canChangeStats = false

    if (isLevelUp) {
        const modifySkill = (inc: boolean) => {
            const skill = skillList.getSelection()!.id
            console.log('skill: %s currently: %d', skill, newSkillSet.get(skill, newStatSet))

            if (inc) {
                const changed = newSkillSet.incBase(skill)
                if (!changed) {
                    console.warn('Not enough skill points!')
                }
            } else {
                newSkillSet.decBase(skill)
            }

            redrawStatsSkills()
        }

        const toggleTagSkill = () => {
            const skill = skillList.getSelection()!.id
            const tagged = newSkillSet.isTagged(skill)
            console.log('skill: %s currently: %d tagged: %s', skill, newSkillSet.get(skill, newStatSet), tagged)

            if (!tagged) {
                newSkillSet.tag(skill)
            } else {
                newSkillSet.untag(skill)
            }

            redrawStatsSkills()
        }

        const modifyStat = (change: number) => {
            console.log('stat: %s currently: %d', selectedStat, newStatSet.get(selectedStat))

            newStatSet.modifyBase(selectedStat, change)
            redrawStatsSkills()
        }

        // Skill level up buttons
        characterWindow.add(
            new Label(580, 236, '-').onClick(() => {
                console.log('-')
                modifySkill(false)
            })
        )
        characterWindow.add(
            new Label(600, 236, '+').onClick(() => {
                console.log('+')
                modifySkill(true)
            })
        )
        characterWindow.add(
            new Label(620, 236, 'Tag').onClick(() => {
                console.log('Tag')
                toggleTagSkill()
            })
        )

        // Stat level up buttons
        if (canChangeStats) {
            characterWindow.add(
                new Label(115, 260, '-').onClick(() => {
                    console.log('-')
                    modifyStat(-1)
                })
            )
            characterWindow.add(
                new Label(135, 260, '+').onClick(() => {
                    console.log('+')
                    modifyStat(+1)
                })
            )
        }
    }
}



// NOTE: DOM helpers ($id, makeEl, clearEl, showv, hidev, etc.) moved to src/dom.ts

function drawInventory($el: HTMLElement, objects: Obj[], prefix: string, options?: {
    clickCallback?: (item: Obj, e: MouseEvent) => void
    extraClearEls?: string[]
    onDragEnd?: () => void
}): void {
    clearEl($el)
    if (options?.extraClearEls) {
        for (const id of options.extraClearEls) {
            clearEl($id(id))
        }
    }

    for (let i = 0; i < objects.length; i++) {
        const obj = objects[i]
        const img = makeEl('img', {
            src: obj.invArt + '.png',
            attrs: { width: 64, height: 49, title: obj.name },
            style: { display: 'block', imageRendering: 'pixelated' },
            click: options?.clickCallback
                ? (e: MouseEvent) => { options.clickCallback!(obj, e) }
                : undefined,
        })
        $el.appendChild(img)
        const amountEl = makeEl('span', {
            classes: ['inventoryAmount'],
            style: { color: '#00FF00', fontSize: '8pt', display: 'block', textAlign: 'center', marginTop: '-4px' },
        })
        amountEl.textContent = 'x' + obj.amount
        $el.appendChild(amountEl)
        makeDraggable(img, prefix + i, options?.onDragEnd)
    }
}

export function initUI() {
    uiInit()

    makeDropTarget($id('inventoryBoxList'), (data: string) => {
        uiMoveSlot(data, 'inventory')
    })
    makeDropTarget($id('inventoryBoxItem1'), (data: string) => {
        uiMoveSlot(data, 'leftHand')
    })
    makeDropTarget($id('inventoryBoxItem2'), (data: string) => {
        uiMoveSlot(data, 'rightHand')
    })

    for (let i = 0; i < 2; i++) {
        for (const $chance of Array.from(document.querySelectorAll('#calledShotBox .calledShotChance'))) {
            $chance.appendChild(
                makeEl('div', { classes: ['number'], style: { left: i * 9 + 'px' }, id: 'digit' + (i + 1) })
            )
        }
    }

    $id('calledShotCancelBtn').onclick = () => {
        uiCloseCalledShot()
    }

    /*
    $id("worldmapViewButton").onclick = () => {
        var onAreaMap = ($("#areamap").css("visibility") === "visible")
        if(onAreaMap)
            uiWorldMapWorldView()
        else {
            var currentArea = areaContainingMap(gMap.name)
            if(currentArea)
                uiWorldMapShowArea(currentArea)
            else
                uiWorldMapAreaView()
        }
    }
    */

    $id('inventoryButton').onclick = () => {
        uiInventoryScreen()
    }
    $id('inventoryDoneButton').onclick = () => {
        globalState.uiMode = UIMode.none
        $id('inventoryBox').style.visibility = 'hidden'
        uiDrawWeapon()
    }

    $id('lootBoxDoneButton').onclick = () => {
        uiEndLoot()
    }

    $id('attackButtonContainer').onclick = () => {
        if (!Config.engine.doCombat) {
            return
        }
        if (globalState.inCombat) {
            // Toggle targeting cursor — next click on a critter will attack
            const $canvas = document.getElementById('cnv')
            if ($canvas) {
                if ($canvas.style.cursor === 'crosshair') {
                    $canvas.style.cursor = 'default'
                } else {
                    $canvas.style.cursor = 'crosshair'
                }
            }
        } else {
            // begin combat
            Combat.start()
        }
    }

    $id('attackButtonContainer').oncontextmenu = () => {
        // right mouse button (cycle weapon modes)
        const wep = globalState.player.equippedWeapon
        if (!wep || !wep.weapon) {
            return false
        }
        wep.weapon.cycleMode()
        uiDrawWeapon()
        return false
    }

    $id('endTurnButton').onclick = () => {
        if (globalState.inCombat && globalState.combat!.inPlayerTurn) {
            if (globalState.player.anim !== null && globalState.player.anim !== 'idle') {
                console.log("Can't end turn while player is in an animation.")
                return
            }
            console.log('[TURN]')
            globalState.combat!.nextTurn()
        }
    }

    $id('endCombatButton').onclick = () => {
        if (globalState.inCombat) {
            globalState.combat!.end()
        }
    }

    $id('endContainer').addEventListener('animationiteration', uiEndCombatAnimationDone)
    $id('endContainer').addEventListener('webkitAnimationIteration', uiEndCombatAnimationDone)

    $id('skilldexButton').onclick = () => {
        skilldexWindow.toggle()
    }

    function makeScrollable($el: HTMLElement, scroll = 60) {
        $el.onwheel = (e: WheelEvent) => {
            const delta = e.deltaY > 0 ? 1 : -1
            $el.scrollTop = $el.scrollTop + scroll * delta
            e.preventDefault()
        }
    }

    makeScrollable($id('inventoryBoxList'))

    makeScrollable($id('barterBoxInventoryLeft'))
    makeScrollable($id('barterBoxInventoryRight'))
    makeScrollable($id('barterBoxLeft'))
    makeScrollable($id('barterBoxRight'))
    makeScrollable($id('lootBoxLeft'))
    makeScrollable($id('lootBoxRight'))
    makeScrollable($id('worldMapLabels'))
    makeScrollable($id('displayLog'))
    makeScrollable($id('dialogueBoxReply'), 30)

    drawHP(globalState.player.getStat('HP'))
    uiDrawWeapon()
}

function uiHideContextMenu() {
    globalState.uiMode = UIMode.none
    $id('itemContextMenu').style.visibility = 'hidden'
}

export function uiContextMenu(obj: Obj, evt: any) {
    globalState.uiMode = UIMode.contextMenu

    function button(obj: Obj, action: string, onclick: (() => void) | undefined = undefined) {
        return makeEl('img', {
            id: 'context_' + action,
            classes: ['itemContextMenuButton'],
            click: () => {
                if (onclick) {
                    onclick()
                }
                uiHideContextMenu()
            },
        })
    }

    const $menu = $id('itemContextMenu')
    clearEl($menu)
    Object.assign($menu.style, {
        visibility: 'visible',
        left: `${evt.clientX}px`,
        top: `${evt.clientY}px`,
    })
    const cancelBtn = button(obj, 'cancel')
    const lookBtn = button(obj, 'look', () => {
        const didOverride = Scripting.lookAt(obj, globalState.player)
        if (!didOverride) {
            uiLog('You see: ' + obj.getDescription())
        }
    })
    const useBtn = button(obj, 'use', () => playerUseHandler(obj))
    const talkBtn = button(obj, 'talk', () => {
        console.log('talking to ' + obj.name)
        if (!obj._script) {
            console.warn('obj has no script')
            return
        }
        Scripting.talk(obj._script, obj)
    })
    const pickupBtn = button(obj, 'pickup', () => obj.pickup(globalState.player))

    $menu.appendChild(cancelBtn)
    $menu.appendChild(lookBtn)
    if (obj._script && obj._script.talk_p_proc !== undefined) {
        $menu.appendChild(talkBtn)
    }
    if (obj.canUse) {
        $menu.appendChild(useBtn)
    }
    $menu.appendChild(pickupBtn)
}

export function uiStartCombat() {
    // play end container animation
    Object.assign($id('endContainer').style, { animationPlayState: 'running', webkitAnimationPlayState: 'running' })
    uiUpdateCombatHUD()
}

export function uiEndCombat() {
    // play end container animation
    Object.assign($id('endContainer').style, { animationPlayState: 'running', webkitAnimationPlayState: 'running' })

    // disable buttons
    hidev($id('endTurnButton'))
    hidev($id('endCombatButton'))

    // clear combat AP display and targeting cursor
    uiUpdateCombatHUD()
    const $canvas = document.getElementById('cnv')
    if ($canvas) {
        $canvas.style.cursor = 'default'
    }
}

export function uiUpdateCombatHUD() {
    if (!globalState.player || typeof globalState.player.getStat !== 'function') {return}

    // update HP
    drawHP(globalState.player.getStat('HP'))

    // update AP digits on the attack button
    if (globalState.inCombat && globalState.player.AP) {
        const currentAP = globalState.player.AP.getAvailableMoveAP()
        const maxAP = globalState.player.AP.getMaxAP().combat
        const CHAR_W = 10
        const $apDigit1 = $id('attackButtonAPDigit1')
        const $apDigit2 = $id('attackButtonAPDigit2')

        if (currentAP > 9) {
            const tens = Math.floor(currentAP / 10)
            const ones = currentAP % 10
            $apDigit1.style.backgroundPosition = 0 - CHAR_W * tens + 'px'
            $apDigit2.style.backgroundPosition = 0 - CHAR_W * ones + 'px'
        } else {
            $apDigit1.style.backgroundPosition = '0px'
            $apDigit2.style.backgroundPosition = 0 - CHAR_W * currentAP + 'px'
        }

        // also show max AP alongside if we have an element for it
        const $acNumber = $id('acNumber')
        if ($acNumber) {
            drawDigits('#acDigit', maxAP, 4, false)
        }
    }
}

function uiEndCombatAnimationDone(this: HTMLElement) {
    Object.assign(this.style, { animationPlayState: 'paused', webkitAnimationPlayState: 'paused' })

    if (globalState.inCombat) {
        // enable buttons
        showv($id('endTurnButton'))
        showv($id('endCombatButton'))
        uiUpdateCombatHUD()
    }
}

function uiDrawWeapon() {
    // draw the active weapon in the interface bar
    const weapon = globalState.player.equippedWeapon
    clearEl($id('attackButton'))
    if (!weapon || !weapon.weapon) {
        return
    }

    if (weapon.weapon.type !== 'melee') {
        const $attackButtonWeapon = $id('attackButtonWeapon') as HTMLImageElement
        $attackButtonWeapon.onload = null
        $attackButtonWeapon.onload = function (this: HTMLImageElement) {
            if (!this.complete) {
                return
            }
            Object.assign(this.style, {
                position: 'absolute',
                top: '5px',
                left: $id('attackButton').offsetWidth / 2 - this.width / 2 + 'px',
                maxHeight: $id('attackButton').offsetHeight - 10 + 'px',
            })
            this.setAttribute('draggable', 'false')
        }
        $attackButtonWeapon.src = weapon.invArt + '.png'
    }

    // draw weapon AP
    const CHAR_W = 10
    const apCost = weapon.weapon.getAPCost(1)
    if (apCost === undefined) {
        return
    }

    const apDigits = apCost.toString().split('')
    const $apDigit1 = $id('attackButtonAPDigit1')
    const $apDigit2 = $id('attackButtonAPDigit2')
    if (apDigits.length === 1) {
        $apDigit1.style.backgroundPosition = '0px'
        $apDigit2.style.backgroundPosition = 0 - CHAR_W * parseInt(apDigits[0]) + 'px'
    } else {
        $apDigit1.style.backgroundPosition = 0 - CHAR_W * parseInt(apDigits[0]) + 'px'
        $apDigit2.style.backgroundPosition = 0 - CHAR_W * parseInt(apDigits[1]) + 'px'
    }

    // draw weapon type (single, burst, called, punch, kick, swing, thrust, throw, flame, ...)
    const attackSkin = weapon.weapon.getAttackSkin()
    const skinToIcon: { [skin: string]: string } = {
        q: 'punch',
        r: 'kick',
        g: 'swing',
        f: 'thrust',
        s: 'throw',
        j: 'single',
        k: 'burst',
        l: 'burst',
    }
    const type = skinToIcon[attackSkin ?? 'q'] ?? 'punch'
    $img('attackButtonType').src = `art/intrface/${type}.png`

    // hide or show called shot sigil?
    if (weapon.weapon.mode === 'called') {
        show($id('attackButtonCalled'))
    } else {
        hide($id('attackButtonCalled'))
    }
}

const INVENTORY_SLOTS = ['leftHand', 'rightHand', 'armor'] as const
type InventorySlot = typeof INVENTORY_SLOTS[number]

function playerGetSlot(slot: string): Obj | null {
    const player = globalState.player as any
    return player[slot] ?? null
}

function playerSetSlot(slot: string, obj: Obj | null): void {
    const player = globalState.player as any
    player[slot] = obj
}

function uiMoveSlot(data: string, target: string) {
    let obj: Obj | null = null

    if (data[0] === 'i') {
        if (target === 'inventory') {
            return
        }

        const idx = parseInt(data.slice(1))
        console.log('idx: ' + idx)
        obj = globalState.player.inventory[idx]
        globalState.player.inventory.splice(idx, 1)
    } else {
        obj = playerGetSlot(data)
        playerSetSlot(data, null)
    }

    console.log('obj: ' + obj + ' (data: ' + data + ', target: ' + target + ')')

    if (target === 'inventory') {
        globalState.player.inventory.push(obj)
    } else {
        const existing = playerGetSlot(target)
        if (existing !== undefined && existing !== null) {
            if (data[0] === 'i') {
                globalState.player.inventory.push(existing)
            } else {
                playerSetSlot(data, existing)
            }
        }

        playerSetSlot(target, obj)
    }

    uiInventoryScreen()
}

function makeDropTarget($el: HTMLElement, dropCallback: (data: string, e?: DragEvent) => void) {
    $el.ondrop = (e: DragEvent) => {
        const data = e.dataTransfer.getData('text/plain')
        dropCallback(data, e)
        return false
    }
    $el.ondragenter = () => false
    $el.ondragover = () => false
}

function makeDraggable($el: HTMLElement, data: string, endCallback?: () => void) {
    $el.setAttribute('draggable', 'true')
    $el.ondragstart = (e: DragEvent) => {
        e.dataTransfer.setData('text/plain', data)
        console.log('start drag')
    }
    $el.ondragend = (e: DragEvent) => {
        if (e.dataTransfer.dropEffect !== 'none') {
            //$(this).remove()
            endCallback && endCallback()
        }
    }
}

function drawStatsInfo(): void {
    const $info = $id('inventoryBoxInfo')
    clearEl($info)

    const p = globalState.player

    // Helper: create a text span
    const span = (text: string, color = '#00FF00', bold = false): HTMLSpanElement => {
        const $s = document.createElement('span')
        $s.style.color = color
        if (bold) $s.style.fontWeight = 'bold'
        $s.textContent = text
        return $s
    }

    // Header row
    $info.appendChild(span('CHARACTER', '#00FF00', true))

    // Level / XP / Karma
    $info.appendChild(span(''))
    const level = p.getStat('Level')
    const xp = p.getStat('Experience')
    const xpNext = xpForLevel(level + 1)
    $info.appendChild(span(`LVL ${level}`))
    $info.appendChild(span(`XP  ${xp}/${xpNext}`))
    const karma = (p as any).karma ?? 0
    $info.appendChild(span(`KAR ${karma}`))
    $info.appendChild(span(''))

    // SPECIAL stats in 3 columns
    const specNames = ['STR', 'PER', 'END', 'CHA', 'INT', 'AGI', 'LUK']
    $info.appendChild(span(''))
    for (let i = 0; i < specNames.length; i += 3) {
        const parts: HTMLSpanElement[] = []
        for (let j = i; j < Math.min(i + 3, specNames.length); j++) {
            const s = specNames[j]
            parts.push(span(`${s}=${p.getStat(s)}`))
        }
        const $row = document.createElement('div')
        $row.style.cssText = 'display:flex;justify-content:space-between'
        for (const $s of parts) $row.appendChild($s)
        $info.appendChild($row)
    }
    $info.appendChild(span(''))

    // Key derived stats
    const hp = p.getStat('HP')
    const maxHp = p.getStat('Max HP')
    const ap = p.getStat('AP')
    const ac = p.getStat('AC')
    const md = p.getStat('Melee')
    const cw = p.getStat('Carry')
    const sq = p.getStat('Sequence')
    const hr = p.getStat('Healing Rate')
    const cc = p.getStat('Critical Chance')

    const row = (a: string, b: string, c?: string) => {
        const $r = document.createElement('div')
        $r.style.cssText = 'display:flex;justify-content:space-between'
        $r.appendChild(span(a))
        $r.appendChild(span(b ?? ''))
        if (c !== undefined) $r.appendChild(span(c))
        $info.appendChild($r)
    }
    row(`HP ${hp}/${maxHp}`, `AP ${ap}`)
    row(`AC ${ac}`, `MD ${md}`, `CW ${cw}`)
    row(`SQ ${sq}`, `HR ${hr}`, `CC ${cc}%`)
    $info.appendChild(span(''))

    // Resistances
    const pr = p.getStat('DR Poison')
    const rr = p.getStat('DR Radiation')
    row(`PR ${pr}%`, `RR ${rr}%`)
}

function uiInventoryScreen() {
    assertNoLegacyGameplayPanelFallback('inventory', 'uiInventoryScreen')
    globalState.uiMode = UIMode.inventory

    showv($id('inventoryBox'))
    drawStatsInfo()
    drawInventory($id('inventoryBoxList'), globalState.player.inventory, 'i', {
        clickCallback: (obj, e) => makeItemContextMenu(e, obj, 'inventory'),
        extraClearEls: ['inventoryBoxItem1', 'inventoryBoxItem2'],
        onDragEnd: () => uiInventoryScreen(),
    })

    function itemAction(obj: Obj, slot: keyof Player, action: 'cancel' | 'use' | 'drop') {
        switch (action) {
            case 'cancel':
                break
            case 'use':
                console.log('using object: ' + obj.art)
                obj.use(globalState.player)
                break
            case 'drop':
                console.log('dropping: ' + obj.art + ' with pid ' + obj.pid)
                if (slot !== 'inventory') {
                    // add into inventory to drop
                    console.log('moving into inventory first')
                    globalState.player.inventory.push(obj)
                    // Clear the equipment slot we just pulled this from.
                    // We map the drag-source slot id back to a Critter field;
                    // any unrecognised slot id is logged and ignored.
                    switch (slot) {
                        case 'leftHand':
                        case 'rightHand':
                        case 'equippedArmor':
                            (globalState.player as any)[slot] = null
                            break
                        default:
                            console.warn('uiInventoryScreen drop: unrecognised slot "' + slot + '" — leaving it set')
                            break
                    }
                }

                obj.drop(globalState.player)
                uiInventoryScreen()
                break
        }
    }

    function makeContextButton(obj: Obj, slot: keyof Player, action: 'cancel' | 'use' | 'drop') {
        return makeEl('img', {
            id: 'context_' + action,
            classes: ['itemContextMenuButton'],
            click: () => {
                itemAction(obj, slot, action)
                hidev($id('itemContextMenu'))
            },
        })
    }

    function makeItemContextMenu(e: MouseEvent, obj: Obj, slot: keyof Player) {
        const $menu = $id('itemContextMenu')
        clearEl($menu)
        Object.assign($menu.style, {
            visibility: 'visible',
            left: `${e.clientX}px`,
            top: `${e.clientY}px`,
        })
        const cancelBtn = makeContextButton(obj, slot, 'cancel')
        const useBtn = makeContextButton(obj, slot, 'use')
        const dropBtn = makeContextButton(obj, slot, 'drop')

        $menu.appendChild(cancelBtn)
        if (obj.canUse) {
            $menu.appendChild(useBtn)
        }
        $menu.appendChild(dropBtn)
    }

    function drawSlot(slot: keyof Player, slotID: string) {
        const art = globalState.player[slot].invArt
        const img = makeEl('img', {
            src: art + '.png',
            attrs: { width: 64, height: 49, title: globalState.player[slot].name },
            style: { display: 'block', imageRendering: 'pixelated' },
            click: (e: MouseEvent) => {
                makeItemContextMenu(e, globalState.player[slot], slot)
            },
        })
        makeDraggable(img, slot)

        const $slotEl = $id(slotID)
        clearEl($slotEl)
        $slotEl.appendChild(img)
    }

    if (globalState.player.leftHand) {
        drawSlot('leftHand', 'inventoryBoxItem1')
    }
    if (globalState.player.rightHand) {
        drawSlot('rightHand', 'inventoryBoxItem2')
    }
}

function drawHP(hp: number) {
    drawDigits('#hpDigit', hp, 4, true)
}

function drawDigits(idPrefix: string, amount: number, maxDigits: number, hasSign: boolean) {
    const CHAR_W = 9,
        CHAR_NEG = 12
    const sign = amount < 0 ? CHAR_NEG : 0
    if (amount < 0) {
        amount = -amount
    }
    const digits = amount.toString()
    const firstDigitIdx = hasSign ? 2 : 1
    if (hasSign) {
        $q(idPrefix + '1').style.backgroundPosition = 0 - CHAR_W * sign + 'px'
    } // sign
    for (
        let i = firstDigitIdx;
        i <= maxDigits - digits.length;
        i++ // left-fill with zeroes
    ) {
        $q(idPrefix + i).style.backgroundPosition = '0px'
    }
    for (let i = 0; i < digits.length; i++) {
        const idx = digits.length - 1 - i
        let digit
        if (digits[idx] === '-') {
            digit = 12
        } else {
            digit = parseInt(digits[idx])
        }
        $q(idPrefix + (maxDigits - i)).style.backgroundPosition = 0 - CHAR_W * digit + 'px'
    }
}

// Smoothly transition an element's top property from an origin to a target position over a duration
function uiAnimateBox($el: HTMLElement, origin: number | null, target: number, callback?: () => void): void {
    const style = $el.style

    // Reset to origin, instantly
    if (origin !== null) {
        style.transition = 'none'
        style.top = `${origin}px`
    }

    // We need to wait for the browser to process the updated CSS position, so we need to wait here
    setTimeout(() => {
        // Set up our transition finished callback if necessary
        if (callback) {
            let listener = () => {
                callback()
                $el.removeEventListener('transitionend', listener)
                ;(listener as any) = null // Allow listener to be GC'd
            }

            $el.addEventListener('transitionend', listener)
        }

        // Ease into the target position over 1 second
        $el.style.transition = 'top 1s ease'
        $el.style.top = `${target}px`
    }, 1)
}

export function uiStartDialogue(force: boolean, target?: Critter) {
    assertNoLegacyGameplayPanelFallback('dialogue', 'uiStartDialogue')
    if (globalState.uiMode === UIMode.barter && force !== true) {
        return
    }

    globalState.uiMode = UIMode.dialogue
    $id('dialogueContainer').style.visibility = 'visible'
    $id('dialogueBox').style.visibility = 'visible'
    uiAnimateBox($id('dialogueBox'), 480, 290)

    // center around the dialogue target
    if (!target) {
        return
    }
    const bbox = objectBoundingBox(target)
    if (bbox !== null) {
        const dc = $id('dialogueContainer')
        // alternatively: dc.offset().left - $(heart.canvas).offset().left
        const dx = ((dc.offsetWidth / 2) | 0) + dc.offsetLeft
        const dy = ((dc.offsetHeight / 4) | 0) + dc.offsetTop - ((bbox.h / 2) | 0)
        globalState.cameraPosition.x = bbox.x - dx
        globalState.cameraPosition.y = bbox.y - dy
    }
}

export function uiEndDialogue() {
    globalState.uiMode = UIMode.none

    const $dialogueBox = $id('dialogueBox')
    uiAnimateBox($dialogueBox, null, 480, () => {
        $id('dialogueContainer').style.visibility = 'hidden'
        $dialogueBox.style.visibility = 'hidden'
        $id('dialogueBoxReply').innerHTML = ''
    })
}

export function uiSetDialogueReply(reply: string) {
    const $dialogueBoxReply = $id('dialogueBoxReply')
    $dialogueBoxReply.innerHTML = reply
    $dialogueBoxReply.scrollTop = 0

    $id('dialogueBoxTextArea').innerHTML = ''
}

export function uiAddDialogueOption(msg: string, optionID: number) {
    $id('dialogueBoxTextArea').insertAdjacentHTML(
        'beforeend',
        `<li><a href="javascript:dialogueReply(${optionID})">${msg}</a></li>`
    )
}

function uiGetAmount(item: Obj) {
    const forever = true
    while (forever) {
        let amount: any = prompt('How many?')
        if (amount === null) {
            return 0
        } else if (amount === '') {
            return item.amount
        } // all of it!
        else {
            amount = parseInt(amount)
        }

        if (isNaN(amount) || item.amount < amount) {
            alert('Invalid amount')
        } else {
            return amount
        }
    }
}

function _uiAddItem(items: Obj[], item: Obj, count: number) {
    for (let i = 0; i < items.length; i++) {
        if (items[i].approxEq(item)) {
            items[i].amount += count
            return
        }
    }

    // no existing item, add new inventory object
    items.push(item.clone().setAmount(count))
}

function uiSwapItem(a: Obj[], item: Obj, b: Obj[], amount: number) {
    // swap item from a -> b
    if (amount === 0) {
        return
    }

    let idx = -1
    for (let i = 0; i < a.length; i++) {
        if (a[i].approxEq(item)) {
            idx = i
            break
        }
    }
    if (idx === -1) {
        console.warn('uiSwapItem: item (' + item + ') does not exist in source list — skipping swap')
        return
    }

    if (amount < item.amount) {
        // deduct amount from a and give amount to b
        item.amount -= amount
    }
    // just swap them
    else {
        a.splice(idx, 1)
    }

    // add the item to b
    _uiAddItem(b, item, amount)
}

function uiDragMove(
    data: string,
    where: string,
    fromMap: Record<string, Obj[]>,
    toMap: Record<string, Obj[]>,
    options?: {
        guard?: (data: string, where: string) => boolean
        onDone?: () => void
    },
): void {
    const from = fromMap[data[0]]
    if (from === undefined) {
        console.warn(`uiDragMove: unrecognized source prefix "${data[0]}" — skipping`)
        return
    }
    const idx = parseInt(data.slice(1))
    const obj = from[idx]
    if (obj === undefined) {
        console.warn(`uiDragMove: obj not found at index ${idx} — skipping`)
        return
    }
    if (options?.guard && !options.guard(data, where)) return

    const to = toMap[where]
    if (to === undefined) {
        console.warn(`uiDragMove: invalid destination "${where}" — skipping`)
        return
    }
    if (to === from) return

    if (obj.amount > 1) {
        uiSwapItem(from, obj, to, uiGetAmount(obj))
    } else {
        uiSwapItem(from, obj, to, 1)
    }
    options?.onDone?.()
}

function uiEndBarterMode() {
    const $barterBox = $id('barterBox')

    uiAnimateBox($barterBox, null, 480, () => {
        hidev($id('barterBox'))
        off($id('barterBoxLeft'), 'drop dragenter dragover')
        off($id('barterBoxRight'), 'drop dragenter dragover')
        off($id('barterBoxInventoryLeft'), 'drop dragenter dragover')
        off($id('barterBoxInventoryRight'), 'drop dragenter dragover')
        off($id('barterTalkButton'), 'click')
        off($id('barterOfferButton'), 'click')

        uiStartDialogue(true) // force dialogue mode
    })
}

export function uiBarterMode(merchant: Critter) {
    assertNoLegacyGameplayPanelFallback('barter', 'uiBarterMode')
    globalState.uiMode = UIMode.barter

    // Hide dialogue screen for now (animate down)
    const $dialogueBox = $id('dialogueBox')
    uiAnimateBox($dialogueBox, null, 480, () => {
        $dialogueBox.style.visibility = 'hidden'
        console.log('going to pop up barter box')

        // Pop up the bartering screen (animate up)
        const $barterBox = $id('barterBox')
        $barterBox.style.visibility = 'visible'
        uiAnimateBox($barterBox, 480, 290)
    })

    // logic + UI for bartering
    // NOTE: We keep "working" copies of both inventories so the UI can
    // mutate the offer without touching globalState.player.inventory or
    // merchant.inventory until the player accepts.  Re-cloning on each
    // open is cheap (≤ dozens of items) and prevents stale state.

    // a copy of inventories for both parties
    let workingPlayerInventory = globalState.player.inventory.map(cloneItem)
    let workingMerchantInventory = merchant.inventory.map(cloneItem)

    // and our working barter tables
    let playerBarterTable: Obj[] = []
    let merchantBarterTable: Obj[] = []

    function totalAmount(objects: Obj[]): number {
        let total = 0
        for (let i = 0; i < objects.length; i++) {
            total += objects[i].pro.extra.cost * objects[i].amount
        }
        return total
    }

    // Evaluate the current offer: pull totals from both tables, compute
    // value difference, and (if non-negative) commit the trade.  The
    // inline check is small enough that a separate checkOffer() helper
    // would just add indirection.
    function offer() {
        console.log('[OFFER]')

        const merchantOffered = totalAmount(merchantBarterTable)
        const playerOffered = totalAmount(playerBarterTable)
        const diffOffered = playerOffered - merchantOffered

        if (diffOffered >= 0) {
            // OK, player offered equal to more more than the value
            console.log('[OFFER OK]')

            // finalize and apply the deal

            // swap to working inventories
            merchant.inventory = workingMerchantInventory
            globalState.player.inventory = workingPlayerInventory

            // add in the table items
            for (let i = 0; i < merchantBarterTable.length; i++) {
                globalState.player.addInventoryItem(merchantBarterTable[i], merchantBarterTable[i].amount)
            }
            for (let i = 0; i < playerBarterTable.length; i++) {
                merchant.addInventoryItem(playerBarterTable[i], playerBarterTable[i].amount)
            }

            // re-clone so we can continue bartering if necessary
            workingPlayerInventory = globalState.player.inventory.map(cloneItem)
            workingMerchantInventory = merchant.inventory.map(cloneItem)

            playerBarterTable = []
            merchantBarterTable = []

            redrawBarterInventory()
        } else {
            console.log('[OFFER REFUSED]')
        }
    }

    function uiBarterMove(data: string, where: 'left' | 'right' | 'leftInv' | 'rightInv') {
        console.log('barter: move ' + data + ' to ' + where)
        uiDragMove(data, where, {
            p: workingPlayerInventory,
            m: workingMerchantInventory,
            l: playerBarterTable,
            r: merchantBarterTable,
        }, {
            left: playerBarterTable,
            right: merchantBarterTable,
            leftInv: workingPlayerInventory,
            rightInv: workingMerchantInventory,
        }, {
            guard: (data, where) => {
                if (data[0] === 'p' && where !== 'left' && where !== 'leftInv') return false
                if (data[0] === 'm' && where !== 'right' && where !== 'rightInv') return false
                return true
            },
            onDone: () => redrawBarterInventory(),
        })
    }

    // bartering drop targets
    makeDropTarget($id('barterBoxLeft'), (data: string) => {
        uiBarterMove(data, 'left')
    })
    makeDropTarget($id('barterBoxRight'), (data: string) => {
        uiBarterMove(data, 'right')
    })
    makeDropTarget($id('barterBoxInventoryLeft'), (data: string) => {
        uiBarterMove(data, 'leftInv')
    })
    makeDropTarget($id('barterBoxInventoryRight'), (data: string) => {
        uiBarterMove(data, 'rightInv')
    })

    $id('barterTalkButton').onclick = uiEndBarterMode
    $id('barterOfferButton').onclick = offer

    function redrawBarterInventory() {
        drawInventory($id('barterBoxInventoryLeft'), workingPlayerInventory, 'p')
        drawInventory($id('barterBoxInventoryRight'), workingMerchantInventory, 'm')
        drawInventory($id('barterBoxLeft'), playerBarterTable, 'l')
        drawInventory($id('barterBoxRight'), merchantBarterTable, 'r')

        const moneyLeft = totalAmount(playerBarterTable)
        const moneyRight = totalAmount(merchantBarterTable)

        $id('barterBoxLeftAmount').innerHTML = '$' + moneyLeft
        $id('barterBoxRightAmount').innerHTML = '$' + moneyRight
    }

    redrawBarterInventory()
}

function uiEndLoot() {
    globalState.uiMode = UIMode.none

    hidev($id('lootBox'))
    off($id('lootBoxLeft'), 'drop dragenter dragover')
    off($id('lootBoxRight'), 'drop dragenter dragover')
    off($id('lootBoxTakeAllButton'), 'click')
}

export function uiLoot(object: Obj) {
    assertNoLegacyGameplayPanelFallback('loot', 'uiLoot')
    globalState.uiMode = UIMode.loot

    function uiLootMove(data: string /* "l"|"r" */, where: 'left' | 'right') {
        console.log('loot: move ' + data + ' to ' + where)
        uiDragMove(data, where, {
            l: globalState.player.inventory,
            r: object.inventory,
        }, {
            left: globalState.player.inventory,
            right: object.inventory,
        }, {
            onDone: () => drawLoot(),
        })
    }

    console.log('looting...')

    showv($id('lootBox'))

    // loot drop targets
    makeDropTarget($id('lootBoxLeft'), (data: string) => {
        uiLootMove(data, 'left')
    })
    makeDropTarget($id('lootBoxRight'), (data: string) => {
        uiLootMove(data, 'right')
    })

    $id('lootBoxTakeAllButton').onclick = () => {
        console.log('take all...')
        const inv = object.inventory.slice(0) // clone inventory
        for (let i = 0; i < inv.length; i++) {
            uiSwapItem(object.inventory, inv[i], globalState.player.inventory, inv[i].amount)
        }
        drawLoot()
    }

    function drawLoot() {
        drawInventory($id('lootBoxLeft'), globalState.player.inventory, 'l')
        drawInventory($id('lootBoxRight'), object.inventory, 'r')
    }

    drawLoot()
}

export function uiLog(msg: string) {
    if (typeof document === 'undefined') {
        console.log('[uiLog stub] ' + msg)
        return
    }
    const $log = $id('displayLog')
    if ($log) {
        $log.insertAdjacentHTML('beforeend', `<li>${msg}</li>`)
        $log.scrollTop = $log.scrollHeight
    }
}

export function uiCloseWorldMap() {
    globalState.uiMode = UIMode.none

    hide($id('worldMapContainer'))
    hidev($id('areamap'))
    hidev($id('worldmap'))

    Worldmap.stop()
}

export function uiWorldMap(onAreaMap = false) {
    assertNoLegacyGameplayPanelFallback('worldMap', 'uiWorldMap')
    globalState.uiMode = UIMode.worldMap
    show($id('worldMapContainer'))

    if (!globalState.mapAreas) {
        globalState.mapAreas = loadAreas()
    }

    if (onAreaMap) {
        uiWorldMapAreaView()
    } else {
        uiWorldMapWorldView()
    }
    uiWorldMapLabels()
}

function uiWorldMapAreaView() {
    hidev($id('worldmap'))
    showv($id('areamap'))

    Worldmap.stop()
}

function uiWorldMapWorldView() {
    showv($id('worldmap'))
    hidev($id('areamap'))

    Worldmap.start()
}

export function uiWorldMapShowArea(area: Area) {
    uiWorldMapAreaView()

    const $areamap = $id('areamap')
    $areamap.style.backgroundImage = `url('${area.mapArt}.png')`
    clearEl($areamap)

    for (const entrance of area.entrances) {
        console.log('Area entrance: ' + entrance.mapLookupName)
        const $entranceEl = makeEl('div', { classes: ['worldmapEntrance'] })
        const $hotspot = makeEl('div', { classes: ['worldmapEntranceHotspot'] })

        $hotspot.onclick = () => {
            // hotspot click -- travel to relevant map
            const mapName = lookupMapNameFromLookup(entrance.mapLookupName)
            console.log('hotspot -> ' + mapName + ' (via ' + entrance.mapLookupName + ')')
            globalState.gMap.loadMap(mapName)
            uiCloseWorldMap()
        }

        $entranceEl.appendChild($hotspot)
        appendHTML($entranceEl, entrance.mapLookupName)
        $entranceEl.style.left = entrance.x + 'px'
        $entranceEl.style.top = entrance.y + 'px'
        $id('areamap').appendChild($entranceEl)
    }
}

function uiWorldMapLabels() {
    $id('worldMapLabels').innerHTML = "<div id='worldMapLabelsBackground'></div>"

    let i = 0
    for (const areaID in globalState.mapAreas) {
        const area = globalState.mapAreas[areaID]
        if (!area.labelArt) {
            continue
        }

        const label = makeEl('img', { classes: ['worldMapLabelImage'], src: area.labelArt + '.png' })
        const labelButton = makeEl('div', {
            classes: ['worldMapLabelButton'],
            click: () => {
                uiWorldMapShowArea(globalState.mapAreas[areaID])
            },
        })

        const areaLabel = makeEl('div', {
            classes: ['worldMapLabel'],
            style: { top: 1 + i * 27 + 'px' },
            children: [label, labelButton],
        })
        $id('worldMapLabels').appendChild(areaLabel)
        i++
    }
}

function uiElevatorDone() {
    globalState.uiMode = UIMode.none
    hidev($id('elevatorBox'))

    // flip all buttons to hidden
    for (const $elevatorButton of $qa('.elevatorButton')) {
        hidev($elevatorButton)
        $elevatorButton.onclick = null
    }
    hidev($id('elevatorLabel'))
}

export function uiElevator(elevator: Elevator) {
    assertNoLegacyGameplayPanelFallback('elevator', 'uiElevator')
    globalState.uiMode = UIMode.elevator
    const art = lookupInterfaceArt(elevator.type)
    console.log('elevator art: ' + art)
    console.log('buttons: ' + elevator.buttonCount)

    if (elevator.labels !== -1) {
        const labelArt = lookupInterfaceArt(elevator.labels)
        console.log('elevator label art: ' + labelArt)

        const $elevatorLabel = $id('elevatorLabel')
        showv($elevatorLabel)
        $elevatorLabel.style.backgroundImage = `url('${labelArt}.png')`
    }

    const $elevatorBox = $id('elevatorBox')
    showv($elevatorBox)
    $elevatorBox.style.backgroundImage = `url('${art}.png')`

    // flip the buttons we need visible
    for (let i = 1; i <= elevator.buttonCount; i++) {
        const $elevatorButton = $id('elevatorButton' + i)
        showv($elevatorButton)
        $elevatorButton.onclick = () => {
            // button `i` pushed
            // elevator positioner/spinner animation not yet implemented

            const mapID = elevator.buttons[i - 1].mapID
            const level = elevator.buttons[i - 1].level
            const position = fromTileNum(elevator.buttons[i - 1].tileNum)

            if (mapID !== globalState.gMap.mapID) {
                // different map
                console.log('elevator -> map ' + mapID + ', level ' + level + ' @ ' + position.x + ', ' + position.y)
                globalState.gMap.loadMapByID(mapID, position, level)
            } else if (level !== globalState.currentElevation) {
                // same map, different elevation
                console.log('elevator -> level ' + level + ' @ ' + position.x + ', ' + position.y)
                globalState.player.move(position)
                globalState.gMap.changeElevation(level, true)
            }

            // else, same elevation, do nothing
            uiElevatorDone()
        }
    }
}

export function uiCloseCalledShot() {
    globalState.uiMode = UIMode.none
    hide($id('calledShotBox'))
}

export function uiCalledShot(art: string, target: Critter, callback?: (regionHit: string) => void) {
    assertNoLegacyGameplayPanelFallback('calledShot', 'uiCalledShot')
    globalState.uiMode = UIMode.calledShot
    show($id('calledShotBox'))

    function drawChance(region: string) {
        let chance: any = Combat.prototype.getHitChance(globalState.player, target, region).hit
        console.log('id: %s | chance: %d', '#calledShot-' + region + '-chance #digit', chance)
        if (chance <= 0) {
            chance = '--'
        }
        drawDigits('#calledShot-' + region + '-chance #digit', chance, 2, false)
    }

    drawChance('torso')
    drawChance('head')
    drawChance('eyes')
    drawChance('groin')
    drawChance('leftArm')
    drawChance('rightArm')
    drawChance('leftLeg')
    drawChance('rightLeg')

    $id('calledShotBackground').style.backgroundImage = `url('${art}.png')`

    for (const $label of $qa('.calledShotLabel')) {
        $label.onclick = (evt: MouseEvent) => {
            const id = (evt.target as HTMLElement).id
            const regionHit = id.split('-')[1]
            console.log('clicked a called location (%s)', regionHit)
            if (callback) {
                callback(regionHit)
            }
        }
    }
}

export function uiSaveLoad(isSave: boolean): void {
    globalState.uiMode = UIMode.saveLoad

    const listOfSaves = new List({ x: 55, y: 50, w: 'auto', h: 'auto' })
    const saveInfo = new Label(404, 262, '', '#00FF00')
    Object.assign(saveInfo.elem.style, {
        width: '154px',
        height: '33px',
        fontSize: '8pt',
        overflow: 'hidden',
    })

    const saveLoadWindow = new WindowFrame('art/intrface/lsgame.png', { x: 80, y: 20 }, 640, 480)
        .add(new Widget('art/intrface/lscover.png', { x: 340, y: 40, w: 275, h: 173 }))
        .add(new Label(50, 26, isSave ? 'Save Game' : 'Load Game'))
        .add(new SmallButton(391, 349).onClick(selected))
        .add(new Label(391 + 18, 349, 'Done'))
        .add(new SmallButton(495, 349).onClick(done))
        .add(new Label(495 + 18, 349, 'Cancel'))
        .add(saveInfo)
        .add(listOfSaves)
        .show()

    if (isSave) {
        listOfSaves.select(
            listOfSaves.addItem({
                text: '<New Slot>',
                id: -1,
                onSelected: () => {
                    saveInfo.setText('New save')
                },
            })
        )
    }

    // List saves, and write them to the UI list
    saveList((saves: SaveGame[]) => {
        for (const save of saves) {
            listOfSaves.addItem({
                text: save.name,
                id: save.id,
                onSelected: () => {
                    saveInfo.setText(formatSaveDate(save) + '<br>' + save.currentMap)
                },
            })
        }
    })

    function done() {
        globalState.uiMode = UIMode.none
        saveLoadWindow.close()
    }

    function selected() {
        // Done was clicked, so save/load the slot
        const item = listOfSaves.getSelection()
        if (!item) {
            return
        } // No slot selected

        const saveID = item.id

        console.log('[UI] %s save #%d.', isSave ? 'Saving' : 'Loading', saveID)

        if (isSave) {
            const name = prompt('Save Name?')

            if (saveID !== -1) {
                if (!confirm('Are you sure you want to overwrite that save slot?')) {
                    return
                }
            }

            save(name, saveID === -1 ? undefined : saveID, done)
        } else {
            load(saveID)
            done()
        }
    }
}
