/**
 * Highwayman car travel helpers (parity Slice H / P1-6 minimal).
 *
 * Ownership + fuel burn + world-map speed bonus. Acquisition/trunk/parking
 * remain out of scope for this stub.
 */

import globalState from './globalState.js'

export const CAR_FUEL_MAX = 80000
/** Fuel burned per world-map travel update tick while the car is moving. */
export const CAR_FUEL_BURN_PER_TICK = 12
/** Speed multiplier when the player owns a fueled car. */
export const CAR_SPEED_MULT = 2

export function hasCar(): boolean {
    return !!globalState.hasCar
}

export function setHasCar(owned: boolean): void {
    globalState.hasCar = !!owned
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
