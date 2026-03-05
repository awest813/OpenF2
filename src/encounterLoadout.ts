export interface EncounterLoadoutItem {
    amount?: number
    pid: number
    wielded: boolean
}

export interface EncounterLoadoutCritter {
    dead: boolean
    items: EncounterLoadoutItem[]
}

interface EncounterLoadoutDeps {
    createItem: (pid: number) => any
    isWeapon: (obj: any) => boolean
}

function isArmorItem(item: any): boolean {
    const extra = item?.pro?.extra
    return !!(extra && (extra.stats !== undefined || extra.AC !== undefined))
}

export function applyEncounterCritterLoadout(
    obj: any,
    critter: EncounterLoadoutCritter,
    deps: EncounterLoadoutDeps
): void {
    if (!obj || !critter || !Array.isArray(critter.items) || typeof obj.addInventoryItem !== 'function') return

    if (critter.dead === true && 'dead' in obj) {
        obj.dead = true
    }

    for (let i = 0; i < critter.items.length; i++) {
        const item = critter.items[i]
        const amount = item.amount ?? 1
        if (amount <= 0) continue

        const itemObj = deps.createItem(item.pid)
        obj.addInventoryItem(itemObj, amount)

        if (item.wielded !== true) continue

        const invObj = Array.isArray(obj.inventory) ? obj.inventory.find((inv: any) => inv.pid === item.pid) : itemObj

        if (deps.isWeapon(invObj)) {
            if (!obj.leftHand || !deps.isWeapon(obj.leftHand)) obj.leftHand = invObj
            else if (!obj.rightHand || !deps.isWeapon(obj.rightHand)) obj.rightHand = invObj
        } else if (!obj.equippedArmor && isArmorItem(invObj)) {
            obj.equippedArmor = invObj
        }
    }

    if (typeof obj.getAnimation === 'function' && obj.anim === 'idle') {
        obj.art = obj.getAnimation('idle')
    }
}
