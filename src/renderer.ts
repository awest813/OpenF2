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

/* eslint-disable @typescript-eslint/no-empty-function */

import { heart } from './heart.js'
import { BoundingBox, hexFromScreen, hexToScreen, Point, pointInBoundingBox } from './geometry.js'
import globalState from './globalState.js'
import { lazyLoadImage } from './images.js'
import { Obj } from './object.js'
import { tileFromScreen } from './tile.js'
import { Config } from './config.js'
import { WindowFrame } from './widgets.js'
import { Font } from './formats/fon.js'
import { accuracyLabel, moveCostLabel, type CursorLabel } from './ui2/cursorReadouts.js'
import { Combat, movementApCost } from './combat.js'

// Abstract game renderer

export type TileMap = string[][]

interface ObjectRenderInfo {
    x: number
    y: number
    spriteX: number
    frameWidth: number
    frameHeight: number
    uniformFrameWidth: number
    uniformFrameHeight: number
    spriteFrameNum: number
    artInfo: any
    visible: boolean
}

export const SCREEN_WIDTH: number = Config.ui.screenWidth
export const SCREEN_HEIGHT: number = Config.ui.screenHeight

export class Renderer {
    private windows: WindowFrame[] = []
    private objects: Obj[]
    roofTiles: TileMap
    floorTiles: TileMap
    fonts: Font[]

    initData(roof: TileMap, floor: TileMap, objects: Obj[]): void {
        this.roofTiles = roof
        this.floorTiles = floor
        this.objects = objects
    }

    addWindow(window: WindowFrame) {
        this.windows.push(window)
    }

    render(): void {
        this.clear(127, 127, 127)

        if (globalState.isLoading) {
            this.color(0, 0, 0)
            const w = 256,
                h = 40
            const w2 = (globalState.loadingAssetsLoaded / globalState.loadingAssetsTotal) * w
            // draw a loading progress bar
            this.rectangle(SCREEN_WIDTH / 2 - w / 2, SCREEN_HEIGHT / 2, w, h, false)
            this.rectangle(SCREEN_WIDTH / 2 - w / 2 + 2, SCREEN_HEIGHT / 2 + 2, w2 - 4, h - 4)
            return
        }

        this.color(255, 255, 255)

        const mousePos = heart.mouse.getPosition()
        const mouseHex = hexFromScreen(
            mousePos[0] + globalState.cameraPosition.x,
            mousePos[1] + globalState.cameraPosition.y
        )
        const mouseSquare = tileFromScreen(
            mousePos[0] + globalState.cameraPosition.x,
            mousePos[1] + globalState.cameraPosition.y
        )
        //var mouseTile = tileFromScreen(mousePos[0] + cameraX, mousePos[1] + cameraY)

        if (Config.ui.showFloor) {
            this.renderFloor(this.floorTiles)
        }
        let cursorLabel: { label: CursorLabel; x: number; y: number } | null = null
        if (Config.ui.showCursor) {
            const scr = hexToScreen(mouseHex.x, mouseHex.y)
            const cx = scr.x - 16 - globalState.cameraPosition.x
            const cy = scr.y - 12 - globalState.cameraPosition.y
            const label = this.cursorReadout(mouseHex)
            if (label?.crosshair) {
                cursorLabel = { label: label.label, x: mousePos[0] + 16, y: mousePos[1] + 4 }
            } else if ((globalState.mouseMode ?? 'move') === 'move') {
                // Only the MOVE cursor is a hex (game_mouse.cc).
                this.renderImage('hex_outline', cx, cy, 32, 16)
                if (label) {cursorLabel = { label: label.label, x: cx + 12, y: cy + 12 }}
            }
        }
        if (Config.ui.showObjects) {
            this.renderObjects(this.objects)
        }
        if (Config.ui.showRoof) {
            this.renderRoof(this.roofTiles)
        }

        for (const window of this.windows.filter((w) => w.showing)) {
            this.renderWindow(window)
        }

        if (Config.ui.showFonts) {
            let currentYOffset = 0
            for (const font of this.fonts) {
                this.renderFont(font, 0, currentYOffset)
                currentYOffset += font.height
            }
        }

        if (globalState.inCombat && Config.ui.showDebugOverlay) {
            const whose = globalState.combat.inPlayerTurn
                ? 'player'
                : globalState.combat.combatants[globalState.combat.whoseTurn].name
            const AP = globalState.combat.inPlayerTurn
                ? globalState.player.AP
                : globalState.combat.combatants[globalState.combat.whoseTurn].AP
            this.renderText(
                '[turn ' + globalState.combat.turnNum + ' of ' + whose + ' AP: ' + AP.getAvailableMoveAP() + ']',
                SCREEN_WIDTH - 200,
                15
            )
        }

        if (Config.ui.showSpatials && Config.engine.doSpatials) {
            globalState.gMap.getSpatials().forEach((spatial) => {
                const scr = hexToScreen(spatial.position.x, spatial.position.y)
                //heart.graphics.draw(hexOverlay, scr.x - 16 - cameraX, scr.y - 12 - cameraY)
                this.renderText(
                    spatial.script,
                    scr.x - 10 - globalState.cameraPosition.x,
                    scr.y - 3 - globalState.cameraPosition.y
                )
            })
        }

        if (Config.ui.showCoordinates) {
            this.renderText('mh: ' + mouseHex.x + ',' + mouseHex.y, 5, 15)
            this.renderText('mt: ' + mouseSquare.x + ',' + mouseSquare.y, 75, 15)
            this.renderText('m: ' + mousePos[0] + ', ' + mousePos[1], 175, 15)
        }

        if (cursorLabel && cursorLabel.label.text) {
            heart.ctx.fillStyle = cursorLabel.label.color
            this.renderText(cursorLabel.label.text, cursorLabel.x, cursorLabel.y)
        }

        //this.text("fps: " + heart.timer.getFPS(), SCREEN_WIDTH - 50, 15)

        for (let i = 0; i < globalState.floatMessages.length; i++) {
            const bbox = objectBoundingBox(globalState.floatMessages[i].obj)
            if (bbox === null) {
                continue
            }
            heart.ctx.fillStyle = globalState.floatMessages[i].color
            const centerX = bbox.x - bbox.w / 2 - globalState.cameraPosition.x
            this.renderText(globalState.floatMessages[i].msg, centerX, bbox.y - globalState.cameraPosition.y - 16)
        }

        if (globalState.player.dead) {
            this.color(255, 0, 0, 50)
            this.rectangle(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT)
        }

        this.renderUIOverlay()
    }

    private _pathCache: { from: string; to: string; length: number } | null = null

    /**
     * What the cursor shows (game_mouse.cc): in CROSSHAIR mode over a
     * critter, the chance to hit; in MOVE mode during the player's combat
     * turn, what walking to the hex costs.
     */
    private cursorReadout(mouseHex: Point): { label: CursorLabel; crosshair: boolean } | null {
        const player: any = globalState.player
        if (!player?.position || !globalState.gMap) {return null}
        const combat = globalState.combat
        const playersTurn = globalState.inCombat && combat?.inPlayerTurn === true
        const critter: any = (globalState.gMap as any).critterAtPosition?.(mouseHex)
        if (globalState.mouseMode === 'crosshair') {
            if (!critter || critter === player || critter.dead) {return null}
            const accuracy = player.AP ? Combat.playerToHit(player, critter) : null
            return { label: accuracyLabel({ accuracy, isCritter: true, team: critter.teamNum ?? 0 }), crosshair: true }
        }
        if (!playersTurn || (globalState.mouseMode ?? 'move') !== 'move') {return null}
        const from = player.position.x + ',' + player.position.y
        const to = mouseHex.x + ',' + mouseHex.y
        if (!this._pathCache || this._pathCache.from !== from || this._pathCache.to !== to) {
            let length = 0
            try {
                const path = globalState.gMap.recalcPath(player.position, mouseHex)
                length = Array.isArray(path) ? Math.max(0, path.length - 1) : 0
            } catch {
                length = 0
            }
            this._pathCache = { from, to, length }
        }
        const length = this._pathCache.length
        return {
            label: moveCostLabel({
                inCombat: true,
                pathLength: length,
                moveCost: movementApCost(player, length),
                freeMove: player.AP?.move ?? 0,
                actionPoints: player.AP?.combat ?? 0,
            }),
            crosshair: false,
        }
    }

    objectRenderInfo(obj: Obj): ObjectRenderInfo | null {
        // BLK-118: Guard against null position — objects in inventory or
        // mid-map-transition have no tile assignment; skip rendering them.
        if (!obj.position) {return null}
        const scr = hexToScreen(obj.position.x, obj.position.y)
        let visible = obj.visible

        if (globalState.images[obj.art] === undefined) {
            lazyLoadImage(obj.art) // try to load it in
            return null
        }

        const info = globalState.imageInfo[obj.art]
        if (info === undefined) {
            console.warn('[renderer] objectRenderInfo: no imageInfo for art "' + obj.art + '" — returning null')
            return null
        }

        if (!(obj.orientation in info.frameOffsets)) {
            obj.orientation = 0
        } // ...
        const frameInfo = info.frameOffsets[obj.orientation][obj.frame]
        const dirOffset = info.directionOffsets[obj.orientation]

        // Anchored from the bottom center
        let offsetX = -((frameInfo.w / 2) | 0) + dirOffset.x
        let offsetY = -frameInfo.h + dirOffset.y

        if (obj.shift) {
            offsetX += obj.shift.x
            offsetY += obj.shift.y
        } else {
            offsetX += frameInfo.ox
            offsetY += frameInfo.oy
        }

        const scrX = scr.x + offsetX,
            scrY = scr.y + offsetY

        if (
            scrX + frameInfo.w < globalState.cameraPosition.x ||
            scrY + frameInfo.h < globalState.cameraPosition.y ||
            scrX >= globalState.cameraPosition.x + SCREEN_WIDTH ||
            scrY >= globalState.cameraPosition.y + SCREEN_HEIGHT
        ) {
            visible = false
        } // out of screen bounds, no need to draw

        const spriteFrameNum = info.numFrames * obj.orientation + obj.frame
        const sx = spriteFrameNum * info.frameWidth

        return {
            x: scrX,
            y: scrY,
            spriteX: sx,
            frameWidth: frameInfo.w,
            frameHeight: frameInfo.h,
            uniformFrameWidth: info.frameWidth,
            uniformFrameHeight: info.frameHeight,
            spriteFrameNum: spriteFrameNum,
            artInfo: info,
            visible: visible,
        }
    }

    renderObjects(objs: Obj[]) {
        for (const obj of objs) {
            if (!Config.ui.showWalls && obj.type === 'wall') {
                continue
            }
            if (obj.outline) {
                this.renderObjectOutlined(obj)
            } else {
                this.renderObject(obj)
            }
        }
    }

    // stubs to be overriden
    init(): void {}

    clear(r: number, g: number, b: number): void {}
    color(r: number, g: number, b: number, a = 255): void {}
    rectangle(x: number, y: number, w: number, h: number, filled = true): void {}
    renderText(txt: string, x: number, y: number): void {}
    renderImage(imgPath: string, x: number, y: number, width: number, height: number): void {}

    renderRoof(roof: TileMap): void {}
    renderFloor(floor: TileMap): void {}
    renderObjectOutlined(obj: Obj): void {
        this.renderObject(obj)
    }
    renderObject(obj: Obj): void {}
    renderWindow(window: WindowFrame): void {
        this.renderImage(window.background, window.position.x, window.position.y, window.width, window.height)
    }
    renderFont(font: Font, x: number, y: number) {}
    /** Composite the ui2 UIManagerImpl OffscreenCanvas on top of the scene. */
    renderUIOverlay(): void {}
}

export function centerCamera(around: Point) {
    const scr = hexToScreen(around.x, around.y)
    globalState.cameraPosition.x = Math.max(0, (scr.x - SCREEN_WIDTH / 2) | 0)
    globalState.cameraPosition.y = Math.max(0, (scr.y - SCREEN_HEIGHT / 2) | 0)
}

export function objectOnScreen(obj: Obj): boolean {
    const bbox = objectBoundingBox(obj)
    if (bbox === null) {
        return false
    }

    if (
        bbox.x + bbox.w < globalState.cameraPosition.x ||
        bbox.y + bbox.h < globalState.cameraPosition.y ||
        bbox.x >= globalState.cameraPosition.x + SCREEN_WIDTH ||
        bbox.y >= globalState.cameraPosition.y + SCREEN_HEIGHT
    ) {
        return false
    }
    return true
}

export function objectTransparentAt(obj: Obj, position: Point) {
    const frame = obj.frame !== undefined ? obj.frame : 0
    const imageInfo = globalState.imageInfo[obj.art]
    if (!imageInfo) {
        console.warn('[renderer] objectTransparentAt: no imageInfo for art "' + obj.art + '" — assuming transparent')
        return true // no image info — treat as transparent
    }
    const sx = imageInfo.frameOffsets[obj.orientation]?.[frame]?.sx ?? 0

    if (!globalState.tempCanvasCtx) {
        console.warn('[renderer] objectTransparentAt: tempCanvasCtx is null — assuming transparent')
        return true
    }

    globalState.tempCanvasCtx.clearRect(0, 0, 1, 1) // clear previous color
    globalState.tempCanvasCtx.drawImage(globalState.images[obj.art], sx + position.x, position.y, 1, 1, 0, 0, 1, 1)
    const pixelAlpha = globalState.tempCanvasCtx.getImageData(0, 0, 1, 1).data[3]

    return pixelAlpha === 0
}

// get an object's bounding box in screen-space (note: not camera-space)
export function objectBoundingBox(obj: Obj): BoundingBox | null {
    // BLK-118: Guard against null position — objects in inventory or mid-transition
    // have no tile; skip bounding box calculation to avoid a TypeError.
    if (!obj.position) {return null}
    const scr = hexToScreen(obj.position.x, obj.position.y)

    if (globalState.images[obj.art] === undefined) {
        // no art
        return null
    }

    const info = globalState.imageInfo[obj.art]
    if (info === undefined) {
        console.warn('[renderer] objectBoundingBox: no imageInfo for art "' + obj.art + '" — returning null')
        return null
    }

    let frameIdx = 0
    if (obj.frame !== undefined) {
        frameIdx += obj.frame
    }

    if (!(obj.orientation in info.frameOffsets)) {
        obj.orientation = 0
    } // ...
    const frameInfo = info.frameOffsets[obj.orientation][frameIdx]
    const dirOffset = info.directionOffsets[obj.orientation]
    const offsetX = Math.floor(frameInfo.w / 2) - dirOffset.x - frameInfo.ox
    const offsetY = frameInfo.h - dirOffset.y - frameInfo.oy

    return { x: scr.x - offsetX, y: scr.y - offsetY, w: frameInfo.w, h: frameInfo.h }
}

export function getObjectUnderCursor(p: (obj: Obj) => boolean) {
    const mouse = heart.mouse.getPosition()
    const mousePosition = { x: mouse[0] + globalState.cameraPosition.x, y: mouse[1] + globalState.cameraPosition.y }

    // reverse z-ordered search
    const objects = globalState.gMap.getObjects()
    for (let i = objects.length - 1; i > 0; i--) {
        const bbox = objectBoundingBox(objects[i])
        if (bbox === null) {
            continue
        }
        if (pointInBoundingBox(mousePosition, bbox)) {
            if (p === undefined || p(objects[i]) === true) {
                const mouseRel = { x: mousePosition.x - bbox.x, y: mousePosition.y - bbox.y }
                if (!objectTransparentAt(objects[i], mouseRel)) {
                    return objects[i]
                }
            }
        }
    }

    return null
}
