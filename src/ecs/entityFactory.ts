/**
 * EntityFactory — creates fully-initialized entities for common archetypes.
 *
 * All code that needs a "new critter" or "new player" should go through here,
 * not construct component objects manually. This centralizes defaults and
 * ensures all required components are always present.
 */

import { EntityManager, EntityId } from './entityManager.js'
import {
    PositionComponent,
    AnimationComponent,
    StatsComponent,
    SkillsComponent,
    InventoryComponent,
    ScriptComponent,
    CombatComponent,
    DialogueComponent,
    PathfindingComponent,
    RenderComponent,
    PlayerComponent,
    zeroDamageStats,
} from './components.js'
import { recomputeDerivedStats, computeBaseSkills } from './derivedStats.js'

// ---------------------------------------------------------------------------
// Default builders
// ---------------------------------------------------------------------------

function defaultPosition(): PositionComponent {
    return { componentType: 'position', x: 0, y: 0, elevation: 0, facing: 0 }
}

function defaultAnimation(): AnimationComponent {
    return {
        componentType: 'animation',
        currentAnim: 'idle',
        frame: 0,
        frameCount: 1,
        frameDuration: 100,
        lastFrameTime: 0,
        looping: true,
        queued: [],
    }
}

function defaultStats(overrides: Partial<Omit<StatsComponent, 'componentType'>> = {}): StatsComponent {
    const s: StatsComponent = {
        componentType: 'stats',
        strength: 5,
        perception: 5,
        endurance: 5,
        charisma: 5,
        intelligence: 5,
        agility: 5,
        luck: 5,
        strengthMod: 0,
        perceptionMod: 0,
        enduranceMod: 0,
        charismaMod: 0,
        intelligenceMod: 0,
        agilityMod: 0,
        luckMod: 0,
        maxAPMod: 0,
        // derived (recomputed below)
        maxHp: 0,
        currentHp: 0,
        maxAP: 0,
        armorClass: 0,
        carryWeight: 0,
        meleeDamage: 0,
        damageResistance: 0,
        poisonResistance: 0,
        radiationResistance: 0,
        sequence: 0,
        healingRate: 0,
        criticalChance: 0,
        maxHpMod: 0,
        carryWeightMod: 0,
        meleeDamageMod: 0,
        poisonResistanceMod: 0,
        radiationResistanceMod: 0,
        sequenceMod: 0,
        healingRateMod: 0,
        criticalChanceMod: 0,
        level: 1,
        xp: 0,
        xpToNextLevel: 1000,
        dt: zeroDamageStats(),
        dr: zeroDamageStats(),
        ...overrides,
    }
    recomputeDerivedStats(s)
    s.currentHp = s.maxHp
    return s
}

function defaultSkills(stats: StatsComponent): SkillsComponent {
    const base = computeBaseSkills(stats)
    return {
        componentType: 'skills',
        ...base,
        tagged: new Set(),
        availablePoints: 0,
    }
}

function defaultInventory(): InventoryComponent {
    return {
        componentType: 'inventory',
        items: [],
        equippedArmor: null,
        equippedWeaponPrimary: null,
        equippedWeaponSecondary: null,
        equippedHelmet: null,
        currentWeight: 0,
    }
}

function defaultScript(): ScriptComponent {
    return {
        componentType: 'script',
        scriptName: null,
        initialized: false,
        lvars: [],
    }
}

function defaultCombat(): CombatComponent {
    return {
        componentType: 'combat',
        combatAP: 0,
        moveAP: 0,
        teamNumber: 0,
        isAggressive: false,
        retaliatesWhenAttacked: true,
        aggressionRange: 10,
        targetEntityId: null,
        dead: false,
        knockedOut: false,
        knockedDown: false,
        crippledParts: 0,
    }
}

function defaultDialogue(): DialogueComponent {
    return {
        componentType: 'dialogue',
        currentNode: null,
        hasTalkProc: false,
    }
}

function defaultPathfinding(): PathfindingComponent {
    return {
        componentType: 'pathfinding',
        path: [],
        pathIndex: 0,
        isMoving: false,
        destination: null,
        moveSpeed: 5,
    }
}

function defaultRender(artKey: string): RenderComponent {
    return {
        componentType: 'render',
        artKey,
        visible: true,
        zOffset: 0,
        outlineColor: null,
    }
}

// ---------------------------------------------------------------------------
// Public factory functions
// ---------------------------------------------------------------------------

export interface PlayerCreationOptions {
    name: string
    strength?: number
    perception?: number
    endurance?: number
    charisma?: number
    intelligence?: number
    agility?: number
    luck?: number
    taggedSkills?: Array<keyof Omit<SkillsComponent, 'componentType' | 'tagged' | 'availablePoints'>>
    traits?: number[]
    artKey?: string
}

/**
 * Create the player entity. Should be called once per new game or on load.
 */
export function createPlayerEntity(opts: PlayerCreationOptions): EntityId {
    const id = EntityManager.create()

    const statsOverrides: Partial<Omit<StatsComponent, 'componentType'>> = {}
    if (opts.strength !== undefined) {statsOverrides.strength = opts.strength}
    if (opts.perception !== undefined) {statsOverrides.perception = opts.perception}
    if (opts.endurance !== undefined) {statsOverrides.endurance = opts.endurance}
    if (opts.charisma !== undefined) {statsOverrides.charisma = opts.charisma}
    if (opts.intelligence !== undefined) {statsOverrides.intelligence = opts.intelligence}
    if (opts.agility !== undefined) {statsOverrides.agility = opts.agility}
    if (opts.luck !== undefined) {statsOverrides.luck = opts.luck}

    const stats = defaultStats(statsOverrides)
    const skills = defaultSkills(stats)

    if (opts.taggedSkills) {
        for (const sk of opts.taggedSkills) {
            skills.tagged.add(sk)
            // Tagged skills get +20% base
            ;(skills as any)[sk] += 20
        }
        // Player starts with 1 unused tag slot per tagged skill up to 3
        skills.availablePoints = Math.max(0, 3 - opts.taggedSkills.length) * 20
    }

    const combat = defaultCombat()
    combat.teamNumber = 0   // player is always team 0

    const playerComp: PlayerComponent = {
        componentType: 'player',
        name: opts.name,
        perksAvailable: 0,
        acquiredPerks: [],
        acquiredTraits: opts.traits ?? [],
    }

    EntityManager.add(id, defaultPosition())
    EntityManager.add(id, defaultAnimation())
    EntityManager.add(id, stats)
    EntityManager.add(id, skills)
    EntityManager.add(id, defaultInventory())
    EntityManager.add(id, defaultScript())
    EntityManager.add(id, combat)
    EntityManager.add(id, defaultPathfinding())
    EntityManager.add(id, defaultRender(opts.artKey ?? 'critters/hmjmpsna'))
    EntityManager.add(id, playerComp)

    return id
}

export interface CritterCreationOptions {
    artKey: string
    scriptName?: string
    teamNumber?: number
    isAggressive?: boolean
    statsOverrides?: Partial<Omit<StatsComponent, 'componentType'>>
    hasTalkProc?: boolean
}

/**
 * Create a critter (NPC or hostile) entity.
 */
export function createCritterEntity(opts: CritterCreationOptions): EntityId {
    const id = EntityManager.create()

    const stats = defaultStats(opts.statsOverrides)
    const combat = defaultCombat()
    if (opts.teamNumber !== undefined) {combat.teamNumber = opts.teamNumber}
    if (opts.isAggressive !== undefined) {combat.isAggressive = opts.isAggressive}

    const dialogue = defaultDialogue()
    if (opts.hasTalkProc !== undefined) {dialogue.hasTalkProc = opts.hasTalkProc}

    const script = defaultScript()
    if (opts.scriptName) {script.scriptName = opts.scriptName}

    EntityManager.add(id, defaultPosition())
    EntityManager.add(id, defaultAnimation())
    EntityManager.add(id, stats)
    EntityManager.add(id, defaultInventory())
    EntityManager.add(id, script)
    EntityManager.add(id, combat)
    EntityManager.add(id, dialogue)
    EntityManager.add(id, defaultPathfinding())
    EntityManager.add(id, defaultRender(opts.artKey))

    return id
}

export interface ItemEntityOptions {
    pid: number
    artKey: string
    count?: number
    condition?: number
}

/**
 * Create a standalone item entity (dropped on the ground).
 */
export function createItemEntity(opts: ItemEntityOptions): EntityId {
    const id = EntityManager.create()

    EntityManager.add(id, defaultPosition())
    EntityManager.add(id, defaultRender(opts.artKey))
    EntityManager.add<'inventory'>(id, {
        componentType: 'inventory',
        items: [{ pid: opts.pid, count: opts.count ?? 1, condition: opts.condition ?? 100, ammoLoaded: 0, ammoType: -1 }],
        equippedArmor: null,
        equippedWeaponPrimary: null,
        equippedWeaponSecondary: null,
        equippedHelmet: null,
        currentWeight: 0,
    })

    return id
}
