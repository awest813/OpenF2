/**
 * Highwayman car travel helpers (parity Slice H / P1-6).
 *
 * Ownership + fuel burn + world-map speed bonus + persistent trunk inventory
 * + per-map parking snapshot. Den acquisition quest remains out of scope.
 */

import globalState from './globalState.js'
import { Critter, deserializeObj, Obj, SerializedObj } from './object.js'
import { LootPanel } from './ui2/lootPanel.js'
import { UIMode } from './uiMode.js'
import { uiLog } from './ui.js'

export const CAR_FUEL_MAX = 80000
/** Fuel burned per world-map travel update tick while the car is moving. */
export const CAR_FUEL_BURN_PER_TICK = 12
/** Speed multiplier when the player owns a fueled car. */
export const CAR_SPEED_MULT = 2

export interface CarParkState {
    mapName: string
    x: number
    y: number
    elevation: number
}

/** Live trunk contents (not on globalState — serialized explicitly into saves). */
let carTrunk: Obj[] = []
/** Last town-map parking spot for the Highwayman (save v26). */
let carPark: CarParkState | null = null

export function hasCar(): boolean {
    return !!globalState.hasCar
}

export function setHasCar(owned: boolean): void {
    globalState.hasCar = !!owned
    if (!owned) carPark = null
}

export function getCarFuel(): number {
    const v = globalState.carFuel ?? 0
    return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(CAR_FUEL_MAX, Math.floor(v))) : 0
}

export function setCarFuel(amount: number): void {
    if (typeof amount !== 'number' || !Number.isFinite(amount)) {
        globalState.carFuel = 0
        return
    }
    globalState.carFuel = Math.max(0, Math.min(CAR_FUEL_MAX, Math.floor(amount)))
    // Acquiring fuel implies the player has the car (acquisition stub).
    if (globalState.carFuel > 0) setHasCar(true)
}

export function isCarFueled(): boolean {
    return hasCar() && getCarFuel() > 0
}

/** Apply car speed bonus to a base world-map travel speed. */
export function worldmapTravelSpeed(baseSpeed: number): number {
    if (!Number.isFinite(baseSpeed) || baseSpeed <= 0) return 0
    return isCarFueled() ? baseSpeed * CAR_SPEED_MULT : baseSpeed
}

/**
 * Burn fuel for one world-map movement tick. Returns amount burned.
 * No-op when the player does not own a car or fuel is empty.
 */
export function burnCarFuelOnTravel(): number {
    if (!hasCar()) return 0
    const fuel = getCarFuel()
    if (fuel <= 0) return 0
    const burn = Math.min(CAR_FUEL_BURN_PER_TICK, fuel)
    globalState.carFuel = fuel - burn
    return burn
}

export function getCarTrunk(): Obj[] {
    return carTrunk
}

export function clearCarTrunk(): void {
    carTrunk = []
}

export function serializeCarTrunk(): SerializedObj[] {
    return carTrunk.map((obj) => obj.serialize())
}

export function hydrateCarTrunk(items: SerializedObj[] | null | undefined): void {
    if (!Array.isArray(items)) {
        carTrunk = []
        return
    }
    carTrunk = []
    for (const raw of items) {
        try {
            carTrunk.push(deserializeObj(raw))
        } catch (err) {
            console.warn('hydrateCarTrunk: skipped bad item', err)
        }
    }
}

/** Add an object to the trunk (tests / scripts). */
export function addToCarTrunk(obj: Obj): void {
    if (!obj) return
    carTrunk.push(obj)
}

/**
 * Open the Highwayman trunk against the player's inventory via LootPanel.
 * Returns false when the player does not own a car or UI is unavailable.
 */
export function openCarTrunk(): boolean {
    if (!hasCar()) return false
    if (globalState.inCombat) return false
    const player = globalState.player as Critter | null
    if (!player || !Array.isArray(player.inventory)) return false

    const mgr = globalState.uiManager
    const panel = mgr?.get?.('loot') as LootPanel | undefined
    if (panel && typeof panel.openWithLive === 'function') {
        panel.openWithLive(player.inventory as Obj[], carTrunk)
        globalState.uiMode = UIMode.loot
        uiLog('Opened Highwayman trunk.')
        return true
    }
    console.warn('openCarTrunk: LootPanel unavailable')
    return false
}

export function canOpenCarTrunk(): boolean {
    return hasCar() && !globalState.inCombat && !!globalState.player
}

/** Park the Highwayman on a local map (called when leaving town via world map). */
export function parkCar(mapName: string, x: number, y: number, elevation: number = 0): boolean {
    if (!hasCar()) return false
    if (!mapName || typeof mapName !== 'string') return false
    if (![x, y, elevation].every((n) => typeof n === 'number' && Number.isFinite(n))) return false
    carPark = {
        mapName: mapName.toLowerCase(),
        x: Math.floor(x),
        y: Math.floor(y),
        elevation: Math.max(0, Math.floor(elevation)),
    }
    setHasCar(true)
    return true
}

/** Park using the player's current map/position when available. */
export function parkCarAtPlayer(): boolean {
    if (!hasCar()) return false
    const mapName = (globalState.gMap as any)?.name as string | undefined
    const pos = globalState.player?.position
    if (!mapName || !pos) return false
    return parkCar(mapName, pos.x, pos.y, globalState.currentElevation ?? 0)
}

export function getCarPark(): CarParkState | null {
    return carPark ? { ...carPark } : null
}

export function clearCarPark(): void {
    carPark = null
}

/** True when the car is parked on the given map name. */
export function isCarParkedOnMap(mapName: string | null | undefined): boolean {
    if (!carPark || !mapName) return false
    return carPark.mapName === mapName.toLowerCase()
}

export function serializeCarPark(): CarParkState | null {
    return getCarPark()
}

export function hydrateCarPark(raw: CarParkState | null | undefined): void {
    if (!raw || typeof raw !== 'object') {
        carPark = null
        return
    }
    const mapName = typeof raw.mapName === 'string' ? raw.mapName.toLowerCase() : ''
    const x = typeof raw.x === 'number' && Number.isFinite(raw.x) ? Math.floor(raw.x) : NaN
    const y = typeof raw.y === 'number' && Number.isFinite(raw.y) ? Math.floor(raw.y) : NaN
    const elevation =
        typeof raw.elevation === 'number' && Number.isFinite(raw.elevation)
            ? Math.max(0, Math.floor(raw.elevation))
            : 0
    if (!mapName || !Number.isFinite(x) || !Number.isFinite(y)) {
        carPark = null
        return
    }
    carPark = { mapName, x, y, elevation }
}
