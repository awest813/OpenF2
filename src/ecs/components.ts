/**
 * Entity Component System (ECS) — core types.
 *
 * Design goals:
 *  - Composable: behaviour is assembled from components, not class inheritance
 *  - Typed: TypeScript discriminated unions for zero-cost component retrieval
 *  - Backward-compatible: existing Obj/Critter/Player classes are layered on top
 *    as facades that delegate to their entity's components
 *
 * Terminology (mirrors OpenMW's approach):
 *  - Entity  = a numeric ID with a bag of components
 *  - Component = a plain-data struct identified by a const string type tag
 *  - System  = a GameModule that queries components and mutates them
 */

// ---------------------------------------------------------------------------
// Component type registry — add new component type tags here
// ---------------------------------------------------------------------------

export type ComponentType =
    | 'position'
    | 'animation'
    | 'stats'
    | 'skills'
    | 'inventory'
    | 'script'
    | 'combat'
    | 'dialogue'
    | 'pathfinding'
    | 'render'
    | 'audio'
    | 'player'

// ---------------------------------------------------------------------------
// Component interfaces
// ---------------------------------------------------------------------------

export interface BaseComponent {
    readonly componentType: ComponentType
}

/** Hex-grid position and current elevation. */
export interface PositionComponent extends BaseComponent {
    readonly componentType: 'position'
    x: number
    y: number
    elevation: number
    /** Facing direction 0-5 (hex cardinal directions). */
    facing: number
}

/** Current animation state and frame data. */
export interface AnimationComponent extends BaseComponent {
    readonly componentType: 'animation'
    currentAnim: string
    frame: number
    frameCount: number
    frameDuration: number  // ms per frame
    lastFrameTime: number  // timestamp
    looping: boolean
    queued: AnimationRequest[]
}

export interface AnimationRequest {
    animName: string
    looping: boolean
    onComplete?: () => void
}

/** SPECIAL stats + all derived stats. */
export interface StatsComponent extends BaseComponent {
    readonly componentType: 'stats'

    // Primary SPECIAL
    strength: number
    perception: number
    endurance: number
    charisma: number
    intelligence: number
    agility: number
    luck: number

    // Modifiers applied on top of base (from traits, perks, drugs, armor)
    strengthMod: number
    perceptionMod: number
    enduranceMod: number
    charismaMod: number
    intelligenceMod: number
    agilityMod: number
    luckMod: number

    // Derived (recomputed whenever primaries change)
    maxHp: number
    currentHp: number
    maxAP: number
    armorClass: number
    carryWeight: number    // lbs
    meleeDamage: number
    damageResistance: number  // Normal DR %
    poisonResistance: number  // %
    radiationResistance: number  // %
    sequence: number
    healingRate: number
    criticalChance: number  // %

    // Leveling
    level: number
    xp: number
    xpToNextLevel: number

    // Damage thresholds and resistances by type (index by DamageTypeIndex)
    dt: DamageStats
    dr: DamageStats
}

/** Per-damage-type DT or DR values. */
export interface DamageStats {
    normal: number
    fire: number
    plasma: number
    laser: number
    explosive: number
    electrical: number
    emp: number
}

export function zeroDamageStats(): DamageStats {
    return { normal: 0, fire: 0, plasma: 0, laser: 0, explosive: 0, electrical: 0, emp: 0 }
}

/** All 18 skills as numeric values (0-300%). */
export interface SkillsComponent extends BaseComponent {
    readonly componentType: 'skills'

    // Combat skills
    smallGuns: number
    bigGuns: number
    energyWeapons: number
    unarmed: number
    meleeWeapons: number
    throwing: number

    // Active skills
    firstAid: number
    doctor: number
    sneak: number
    lockpick: number
    steal: number
    traps: number

    // Passive / knowledge skills
    science: number
    repair: number
    speech: number
    barter: number
    gambling: number
    outdoorsman: number

    /** Which skills are tagged (receive +20% base, ×2 cost to raise). */
    tagged: Set<keyof Omit<SkillsComponent, 'componentType' | 'tagged'>>

    /** Points available to spend at character creation or level-up. */
    availablePoints: number
}

/** Inventory: a list of item stack entries. */
export interface InventoryComponent extends BaseComponent {
    readonly componentType: 'inventory'
    items: ItemStack[]
    equippedArmor: number | null     // PID of equipped armor (or null)
    equippedWeaponPrimary: number | null   // PID
    equippedWeaponSecondary: number | null // PID
    equippedHelmet: number | null    // PID
    currentWeight: number   // lbs, recomputed on change
}

export interface ItemStack {
    pid: number        // Prototype ID
    count: number
    condition: number  // 0-100; -1 = not applicable
    /** Ammo currently loaded (for weapons). */
    ammoLoaded: number
    ammoType: number   // Ammo PID, or -1
}

/** Script attachment — maps script procedures to their loaded state. */
export interface ScriptComponent extends BaseComponent {
    readonly componentType: 'script'
    scriptName: string | null
    /** Whether the script's `map_enter_p_proc` has run for this entity. */
    initialized: boolean
    /** Script-local variables (lvars). */
    lvars: number[]
}

/** Combat state for a participant. */
export interface CombatComponent extends BaseComponent {
    readonly componentType: 'combat'
    combatAP: number
    moveAP: number
    teamNumber: number
    isAggressive: boolean
    retaliatesWhenAttacked: boolean
    aggressionRange: number  // hex radius for auto-engage
    targetEntityId: number | null
    dead: boolean
    knockedOut: boolean
    knockedDown: boolean
    /** Crippled body parts (bit flags matching Fallout body-part constants). */
    crippledParts: number
}

/** Dialogue attachment for NPCs. */
export interface DialogueComponent extends BaseComponent {
    readonly componentType: 'dialogue'
    /** Current dialogue node ID (from .MSG / script). */
    currentNode: string | null
    /** Whether this entity has the talk_p_proc hooked. */
    hasTalkProc: boolean
}

/** A* pathfinding state. */
export interface PathfindingComponent extends BaseComponent {
    readonly componentType: 'pathfinding'
    path: Array<{ x: number; y: number }>
    pathIndex: number
    isMoving: boolean
    destination: { x: number; y: number } | null
    moveSpeed: number  // hexes per second
}

/** Render info — art key and draw order. */
export interface RenderComponent extends BaseComponent {
    readonly componentType: 'render'
    artKey: string  // e.g. 'critters/hmjmpsna'
    visible: boolean
    zOffset: number
    outlineColor: string | null  // null = no outline
}

/** Positional audio source. */
export interface AudioComponent extends BaseComponent {
    readonly componentType: 'audio'
    ambientSoundId: string | null
    volume: number  // 0.0–1.0
    radius: number  // hex radius for volume falloff
}

/** Marker component: present only on the player entity. */
export interface PlayerComponent extends BaseComponent {
    readonly componentType: 'player'
    name: string
    /** Number of unused perk slots. */
    perksAvailable: number
    acquiredPerks: number[]  // perk IDs
    acquiredTraits: number[] // trait IDs (chosen at character creation, immutable)
}

// ---------------------------------------------------------------------------
// Union of all concrete component types
// ---------------------------------------------------------------------------

export type AnyComponent =
    | PositionComponent
    | AnimationComponent
    | StatsComponent
    | SkillsComponent
    | InventoryComponent
    | ScriptComponent
    | CombatComponent
    | DialogueComponent
    | PathfindingComponent
    | RenderComponent
    | AudioComponent
    | PlayerComponent

// Map from ComponentType string to its concrete interface
export interface ComponentMap {
    position: PositionComponent
    animation: AnimationComponent
    stats: StatsComponent
    skills: SkillsComponent
    inventory: InventoryComponent
    script: ScriptComponent
    combat: CombatComponent
    dialogue: DialogueComponent
    pathfinding: PathfindingComponent
    render: RenderComponent
    audio: AudioComponent
    player: PlayerComponent
}
