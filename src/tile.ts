// Copyright 2014-2022 darkf
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { hexFromScreen, hexToScreen, Point } from './geometry.js'
import globalState from './globalState.js'
import { SCREEN_HEIGHT, SCREEN_WIDTH } from './renderer.js'

export const TILE_WIDTH = 80
export const TILE_HEIGHT = 36

export function toTileNum(position: Point): number {
    return position.y * 200 + position.x
}

export function fromTileNum(tile: number): Point {
    return { x: tile % 200, y: Math.floor(tile / 200) } // TODO: use x|0 instead of floor for some of these
}

export function tileToScreen(x: number, y: number): Point {
    x = 99 - x // this algorithm expects x to be reversed
    const sx = 4752 + 32 * y - 48 * x
    const sy = 24 * y + 12 * x

    return { x: sx, y: sy }
}

export function tileFromScreen(x: number, y: number): Point {
    const off_x = -4800 + x
    const off_y = y
    const xx = off_x - (off_y * 4) / 3
    let tx = xx / 64

    if (xx >= 0) {tx++}
    tx = -tx
    const yy = off_y + off_x / 4
    let ty = yy / 32
    if (yy < 0) {ty--}

    return { x: 99 - Math.round(tx), y: Math.round(ty) }
}

export function hexToTile(pos: Point): Point {
    // Calculate screen position of `pos`, then look up which roof tile that belongs to,
    // and then calculate the square tile position from the screen position.
    const scrPos = hexToScreen(pos.x, pos.y)
    return tileFromScreen(scrPos.x, scrPos.y)
}

function getCenterTile(cameraPosition: Point): Point {
    return hexFromScreen(
        cameraPosition.x + ((SCREEN_WIDTH / 2) | 0) - 32,
        cameraPosition.y + ((SCREEN_HEIGHT / 2) | 0) - 16
    )
    /*return hexFromScreen(cameraX + Math.floor((SCREEN_WIDTH - 32) / 2),
                       cameraY + Math.floor((SCREEN_HEIGHT - 16) / 2))*/
}

export function setCenterTile() {
    globalState.centerTile = getCenterTile(globalState.cameraPosition)
}

// tile_coord(0x319E) == {x: -336, y: -250}
// tile_coord(0x319F) should be the same
// tile_coord(0x5018) should be (230, 304)

function tile_coord(tileNum: number): Point | null {
    if (tileNum < 0 || tileNum >= 200 * 200) {return null}

    //var tile_x = 0x62 // todo: ?
    //var tile_y = 0x64 // todo: ?
    setCenterTile()
    const tile_x = /*199 -*/ globalState.centerTile.x
    const tile_y = globalState.centerTile.y

    const tile_offx = 272
    const tile_offy = 182

    let a2 = tile_offx // x (normally this would be cameraX aka tile_offx)
    let a3 = tile_offy // y (normally this would be cameraY aka tile_offy)

    const v3 = 200 - 1 - (tileNum % 200)
    const v4 = Math.floor(tileNum / 200)

    const v5 = Math.floor((v3 - tile_x) / -2)

    a2 += 48 * Math.ceil((v3 - tile_x) / 2) // TODO: ceil, round or floor?
    a3 += 12 * v5

    console.log('v3:', v3, '=', v3 & 1)

    if (v3 & 1) {
        if (v3 > tile_x) {
            a2 += 32
        } else {
            a2 -= 16
            a3 += 12
        }
    }

    const v6 = v4 - tile_y
    a2 += 16 * v6
    a3 += 12 * v6

    return { x: a2, y: a3 }
}
/*
function tile_coord(tileNum: number): Point {
  if(tileNum < 0 || tileNum >= 200*200)
      return null

  var tile_x = 0x62 // todo: ? this seems to be the same as tile_offx right now
  var tile_y = 0x64 // same, but for tile_offy

  var a2 = tile_x // x (normally this would be cameraX aka tile_offx)
  var a3 = tile_y // y (normally this would be cameraY aka tile_offy)

  var v3 = 200 - 1 - tileNum % 200
  var v4 = Math.floor(tileNum / 200)

  var v5 = Math.floor((v3 - tile_x) / -2)

  a2 += 48 * Math.floor((v3 - tile_x) / 2)
  a3 += 12 * v5

  if ( v3 & 1 )
  {
    if ( v3 > tile_x )
    {
      a2 += 32
    }
    else
    {
      a2 -= 16
      a3 += 12
    }
  }

  var v6 = v4 - tile_y
  a2 += 16 * v6
  a3 += 12 * v6

  return {x: a2, y: a3}
}*/
