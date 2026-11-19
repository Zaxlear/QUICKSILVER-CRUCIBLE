/**
 * 《水银坩埚（QUICKSILVER CRUCIBLE）》四大生态群落视觉/光照/视差/氛围粒子配置、
 * 12 种普通怪物精确 AI 数值表与 4 大精英词缀纯静态配表（src/data/biomes.data.ts）。
 *
 * 严格遵循单向依赖铁律：零运行时依赖，100% 对齐 docs/03_WORLD_LORE_AND_ENEMIES.md §3 ~ §4。
 */

import type { LightPresetId } from './palette.data';
import type { BiomeId } from './runes.data';

export type { BiomeId };

export type EnemyArchetypeSlotTag =
  | 'MELEE_FODDER'
  | 'RANGED_HARASS'
  | 'SHIELD_TANK'
  | 'SUPPORT_CASTER'
  | 'FLANKER'
  | 'ELITE_GUARD';

export type EnemyId =
  | 'mob_01_slag_husk'
  | 'mob_02_frenzied_miner'
  | 'mob_03_alembic_thrower'
  | 'mob_04_acid_spitter'
  | 'mob_05_brass_sentinel'
  | 'mob_06_flail_executor'
  | 'mob_07_voltaic_weaver'
  | 'mob_08_clockwork_tick'
  | 'mob_09_ossuary_prelate'
  | 'mob_10_pendulum_assassin'
  | 'mob_11_mercury_stalker'
  | 'mob_12_astral_inquisitor';

export type EliteAffixId =
  | 'elite_rotating_laser'
  | 'elite_twin_clone'
  | 'elite_voltaic_cage'
  | 'elite_thorns_shell';

export type TelegraphKind = 'NONE' | 'YELLOW_PARRIABLE' | 'RED_UNPARRIABLE';

export type BiomeAtmosphereProfileId =
  | 'SLAG_EMBERS'
  | 'VITRIOL_ACID_RAIN'
  | 'OSSUARY_GOLD_SPARKS'
  | 'APEX_ANTIGRAV_MERCURY';

export const ALL_BIOME_IDS: readonly BiomeId[] = [
  'biome_01_slag_retort',
  'biome_02_vitriol_sewers',
  'biome_03_clockwork_ossuary',
  'biome_04_crucible_apex',
] as const;

export const ALL_ENEMY_IDS: readonly EnemyId[] = [
  'mob_01_slag_husk',
  'mob_02_frenzied_miner',
  'mob_03_alembic_thrower',
  'mob_04_acid_spitter',
  'mob_05_brass_sentinel',
  'mob_06_flail_executor',
  'mob_07_voltaic_weaver',
  'mob_08_clockwork_tick',
  'mob_09_ossuary_prelate',
  'mob_10_pendulum_assassin',
  'mob_11_mercury_stalker',
  'mob_12_astral_inquisitor',
] as const;

export const ALL_ELITE_AFFIX_IDS: readonly EliteAffixId[] = [
  'elite_rotating_laser',
  'elite_twin_clone',
  'elite_voltaic_cage',
  'elite_thorns_shell',
] as const;

export interface BiomeVisualAndRosterSpec {
  readonly biomeId: BiomeId;
  readonly romanTier: 'I' | 'II' | 'III' | 'IV';
  readonly nameZh: string;
  readonly nameEn: string;
  readonly subtitleZh: string;
  readonly tilesetKey: string;
  readonly parallaxPrefix: string;
  readonly parallaxScrollFactors: readonly [number, number, number, number, number];
  readonly backdropHex: string;
  readonly backdropNum: number;
  readonly ambientHex: string;
  readonly ambientNum: number;
  readonly primaryLightPreset: LightPresetId;
  readonly accentLightPreset: LightPresetId;
  readonly atmosphere: BiomeAtmosphereProfileId;
  readonly hpScale: number;
  readonly damageScale: number;
  readonly ichorPerKill: number;
  readonly nextPlayableBiomeId: BiomeId;
  readonly lorePreview: {
    readonly title: string;
    readonly body: string;
    readonly accentHex: string;
  };
  readonly archetypePools: Readonly<Record<EnemyArchetypeSlotTag, readonly EnemyId[]>>;
}

/** 四大生态群落完整视听、5 层视差与原生怪物生态映射总表（docs/03 §3.1 ~ §3.4） */
export const BIOME_CATALOG: Readonly<Record<BiomeId, BiomeVisualAndRosterSpec>> = {
  biome_01_slag_retort: {
    biomeId: 'biome_01_slag_retort',
    romanTier: 'I',
    nameZh: '矿渣蒸馏厂',
    nameEn: 'The Slag Retorts',
    subtitleZh: '地下炼金矿渣监牢 · 煤气琥珀铸铁',
    tilesetKey: 'biome01_slag_tileset',
    parallaxPrefix: 'biome01_parallax_L',
    parallaxScrollFactors: [0.05, 0.15, 0.35, 0.65, 1.18],
    backdropHex: '#14161F',
    backdropNum: 0x14161f,
    ambientHex: '#2A2D3D',
    ambientNum: 0x2a2d3d,
    primaryLightPreset: 'TORCH_AMBER',
    accentLightPreset: 'VITRIOL_VAT_GREEN',
    atmosphere: 'SLAG_EMBERS',
    hpScale: 1.0,
    damageScale: 1.0,
    ichorPerKill: 8,
    nextPlayableBiomeId: 'biome_02_vitriol_sewers',
    lorePreview: {
      title: '【染血的司炉工排班板】',
      body: '《第七十三号防疫令》：凡咳嗽咳出银色金属颗粒者，一律视作盗窃公家水银矿产论处，调入三号高温曲颈瓶车间清渣。',
      accentHex: '#FF5E2B',
    },
    archetypePools: {
      MELEE_FODDER: ['mob_01_slag_husk', 'mob_02_frenzied_miner'],
      FLANKER: ['mob_02_frenzied_miner', 'mob_01_slag_husk'],
      RANGED_HARASS: ['mob_03_alembic_thrower'],
      SUPPORT_CASTER: ['mob_03_alembic_thrower'],
      SHIELD_TANK: ['mob_05_brass_sentinel'],
      ELITE_GUARD: ['mob_05_brass_sentinel', 'mob_02_frenzied_miner'],
    },
  },
  biome_02_vitriol_sewers: {
    biomeId: 'biome_02_vitriol_sewers',
    romanTier: 'II',
    nameZh: '矾酸暗渠',
    nameEn: 'The Vitriol Aqueducts',
    subtitleZh: '铜绿排污哥特拱渠 · 荧光矾酸毒雾',
    tilesetKey: 'biome02_vitriol_tileset',
    parallaxPrefix: 'biome02_parallax_L',
    parallaxScrollFactors: [0.05, 0.18, 0.38, 0.68, 1.15],
    backdropHex: '#0D191B',
    backdropNum: 0x0d191b,
    ambientHex: '#1E3533',
    ambientNum: 0x1e3533,
    primaryLightPreset: 'VITRIOL_VAT_GREEN',
    accentLightPreset: 'TORCH_AMBER',
    atmosphere: 'VITRIOL_ACID_RAIN',
    hpScale: 1.32,
    damageScale: 1.22,
    ichorPerKill: 12,
    nextPlayableBiomeId: 'biome_03_clockwork_ossuary',
    lorePreview: {
      title: '【下水道巡检员的绝笔信】',
      body: '致市政厅：上层贵族倾倒的“返老还童药渣”正在溶解百年铜管！老托马斯掉进了三号蓄水池，爬上来时和池壁上的黄铜水表长在了一起！',
      accentHex: '#3CE682',
    },
    archetypePools: {
      MELEE_FODDER: ['mob_02_frenzied_miner', 'mob_08_clockwork_tick'],
      FLANKER: ['mob_08_clockwork_tick', 'mob_02_frenzied_miner'],
      RANGED_HARASS: ['mob_04_acid_spitter', 'mob_03_alembic_thrower'],
      SUPPORT_CASTER: ['mob_04_acid_spitter', 'mob_03_alembic_thrower'],
      SHIELD_TANK: ['mob_06_flail_executor', 'mob_05_brass_sentinel'],
      ELITE_GUARD: ['mob_06_flail_executor', 'mob_04_acid_spitter'],
    },
  },
  biome_03_clockwork_ossuary: {
    biomeId: 'biome_03_clockwork_ossuary',
    romanTier: 'III',
    nameZh: '发条骸骨堂',
    nameEn: 'The Clockwork Ossuary',
    subtitleZh: '机械哥特大圣堂 · 镀金齿轮与电弧风暴',
    tilesetKey: 'biome03_ossuary_tileset',
    parallaxPrefix: 'biome03_parallax_L',
    parallaxScrollFactors: [0.04, 0.16, 0.36, 0.66, 1.2],
    backdropHex: '#111324',
    backdropNum: 0x111324,
    ambientHex: '#25294A',
    ambientNum: 0x25294a,
    primaryLightPreset: 'VOLTAIC_CYAN',
    accentLightPreset: 'TORCH_AMBER',
    atmosphere: 'OSSUARY_GOLD_SPARKS',
    hpScale: 1.72,
    damageScale: 1.48,
    ichorPerKill: 16,
    nextPlayableBiomeId: 'biome_04_crucible_apex',
    lorePreview: {
      title: '【机械苦修士入会誓词】',
      body: '血肉腐败，唯齿轮永恒；心跳无序，唯擒纵精准。吾自愿献出脆弱之脏腑，换取发条圣堂一万两千转之虔诚。',
      accentHex: '#38BDF8',
    },
    archetypePools: {
      MELEE_FODDER: ['mob_08_clockwork_tick', 'mob_05_brass_sentinel'],
      FLANKER: ['mob_10_pendulum_assassin', 'mob_08_clockwork_tick'],
      RANGED_HARASS: ['mob_07_voltaic_weaver'],
      SUPPORT_CASTER: ['mob_09_ossuary_prelate', 'mob_07_voltaic_weaver'],
      SHIELD_TANK: ['mob_06_flail_executor', 'mob_05_brass_sentinel'],
      ELITE_GUARD: ['mob_06_flail_executor', 'mob_10_pendulum_assassin'],
    },
  },
  biome_04_crucible_apex: {
    biomeId: 'biome_04_crucible_apex',
    romanTier: 'IV',
    nameZh: '星界熔炉之巅',
    nameEn: 'The Astral Athanor',
    subtitleZh: '衔尾蛇黑曜石浮空极顶 · 逆流水银与赤日星环',
    tilesetKey: 'biome04_apex_tileset',
    parallaxPrefix: 'biome04_parallax_L',
    parallaxScrollFactors: [0.02, 0.12, 0.32, 0.64, 1.22],
    backdropHex: '#180F24',
    backdropNum: 0x180f24,
    ambientHex: '#32204A',
    ambientNum: 0x32204a,
    primaryLightPreset: 'MERCURY_SILVER',
    accentLightPreset: 'FURNACE_CRIMSON',
    atmosphere: 'APEX_ANTIGRAV_MERCURY',
    hpScale: 2.15,
    damageScale: 1.78,
    ichorPerKill: 22,
    nextPlayableBiomeId: 'biome_01_slag_retort',
    lorePreview: {
      title: '【凝固的庆功宴祝酒词】',
      body: '高脚杯里盛着沸腾的白色水银。主宾席上的公爵夫人依然保持着举杯微笑的姿势，只是她的嘴唇已与纯金酒杯彻底熔焊为一体。',
      accentHex: '#E11D48',
    },
    archetypePools: {
      MELEE_FODDER: ['mob_11_mercury_stalker'],
      FLANKER: ['mob_11_mercury_stalker', 'mob_10_pendulum_assassin'],
      RANGED_HARASS: ['mob_12_astral_inquisitor'],
      SUPPORT_CASTER: ['mob_09_ossuary_prelate'],
      SHIELD_TANK: ['mob_12_astral_inquisitor'],
      ELITE_GUARD: ['mob_12_astral_inquisitor', 'mob_11_mercury_stalker'],
    },
  },
} as const;

export interface EnemySpeciesSpec {
  readonly id: EnemyId;
  readonly nameZh: string;
  readonly nameEn: string;
  readonly biomes: readonly BiomeId[];
  readonly baseHp: number;
  readonly basePoise: number;
  readonly losRadiusPx: number;
  readonly hearingRadiusPx: number;
  readonly colliderWidthPx: number;
  readonly colliderHeightPx: number;
  readonly overheadOffsetY: number;
  readonly isMetallicClockwork: boolean;
  readonly ignoresWallLos: boolean;
  readonly patrolSpeedPxS: number;
  readonly chaseSpeedPxS: number;
  readonly primaryWindupMs: number;
  readonly primaryDamage: number;
  readonly secondaryWindupMs: number;
  readonly secondaryDamage: number;
  readonly blueprintDropId: string;
}

/** 12 种普通/精英怪物精确帧数据与感知参数全表（100% 对齐 docs/03 §4.1） */
export const ENEMY_CATALOG: Readonly<Record<EnemyId, EnemySpeciesSpec>> = {
  mob_01_slag_husk: {
    id: 'mob_01_slag_husk',
    nameZh: '矿渣行尸',
    nameEn: 'Slag Husk',
    biomes: ['biome_01_slag_retort'],
    baseHp: 85,
    basePoise: 1.0,
    losRadiusPx: 180,
    hearingRadiusPx: 90,
    colliderWidthPx: 22,
    colliderHeightPx: 40,
    overheadOffsetY: 54,
    isMetallicClockwork: false,
    ignoresWallLos: false,
    patrolSpeedPxS: 55,
    chaseSpeedPxS: 115,
    primaryWindupMs: 420,
    primaryDamage: 24,
    secondaryWindupMs: 0,
    secondaryDamage: 0,
    blueprintDropId: 'mut_open_wounds',
  },
  mob_02_frenzied_miner: {
    id: 'mob_02_frenzied_miner',
    nameZh: '狂暴煅烧矿工',
    nameEn: 'Frenzied Miner',
    biomes: ['biome_01_slag_retort', 'biome_02_vitriol_sewers'],
    baseHp: 150,
    basePoise: 2.2,
    losRadiusPx: 220,
    hearingRadiusPx: 120,
    colliderWidthPx: 24,
    colliderHeightPx: 42,
    overheadOffsetY: 56,
    isMetallicClockwork: false,
    ignoresWallLos: false,
    patrolSpeedPxS: 68,
    chaseSpeedPxS: 132,
    primaryWindupMs: 350,
    primaryDamage: 26,
    secondaryWindupMs: 180,
    secondaryDamage: 30,
    blueprintDropId: 'wpn_crucible_maul',
  },
  mob_03_alembic_thrower: {
    id: 'mob_03_alembic_thrower',
    nameZh: '烧瓶投掷工',
    nameEn: 'Alembic Thrower',
    biomes: ['biome_01_slag_retort', 'biome_02_vitriol_sewers'],
    baseHp: 75,
    basePoise: 0.8,
    losRadiusPx: 260,
    hearingRadiusPx: 100,
    colliderWidthPx: 20,
    colliderHeightPx: 40,
    overheadOffsetY: 54,
    isMetallicClockwork: false,
    ignoresWallLos: false,
    patrolSpeedPxS: 62,
    chaseSpeedPxS: 124,
    primaryWindupMs: 520,
    primaryDamage: 25,
    secondaryWindupMs: 0,
    secondaryDamage: 0,
    blueprintDropId: 'wpn_vitriol_thrower',
  },
  mob_04_acid_spitter: {
    id: 'mob_04_acid_spitter',
    nameZh: '矾酸囊肿虫',
    nameEn: 'Acid Spitter',
    biomes: ['biome_02_vitriol_sewers'],
    baseHp: 130,
    basePoise: 1.6,
    losRadiusPx: 200,
    hearingRadiusPx: 140,
    colliderWidthPx: 34,
    colliderHeightPx: 30,
    overheadOffsetY: 46,
    isMetallicClockwork: false,
    ignoresWallLos: false,
    patrolSpeedPxS: 36,
    chaseSpeedPxS: 52,
    primaryWindupMs: 480,
    primaryDamage: 22,
    secondaryWindupMs: 650,
    secondaryDamage: 38,
    blueprintDropId: 'skl_crimson_transfusion',
  },
  mob_05_brass_sentinel: {
    id: 'mob_05_brass_sentinel',
    nameZh: '黄铜持盾卫兵',
    nameEn: 'Brass Sentinel',
    biomes: ['biome_01_slag_retort', 'biome_02_vitriol_sewers', 'biome_03_clockwork_ossuary'],
    baseHp: 210,
    basePoise: 4.5,
    losRadiusPx: 190,
    hearingRadiusPx: 110,
    colliderWidthPx: 30,
    colliderHeightPx: 52,
    overheadOffsetY: 68,
    isMetallicClockwork: true,
    ignoresWallLos: false,
    patrolSpeedPxS: 46,
    chaseSpeedPxS: 64,
    primaryWindupMs: 550,
    primaryDamage: 34,
    secondaryWindupMs: 0,
    secondaryDamage: 0,
    blueprintDropId: 'mut_mercury_ward',
  },
  mob_06_flail_executor: {
    id: 'mob_06_flail_executor',
    nameZh: '链锤处刑官',
    nameEn: 'Flail Executor',
    biomes: ['biome_02_vitriol_sewers', 'biome_03_clockwork_ossuary'],
    baseHp: 290,
    basePoise: 3.8,
    losRadiusPx: 240,
    hearingRadiusPx: 130,
    colliderWidthPx: 34,
    colliderHeightPx: 66,
    overheadOffsetY: 82,
    isMetallicClockwork: true,
    ignoresWallLos: false,
    patrolSpeedPxS: 48,
    chaseSpeedPxS: 78,
    primaryWindupMs: 500,
    primaryDamage: 36,
    secondaryWindupMs: 750,
    secondaryDamage: 44,
    blueprintDropId: 'wpn_pendulum_halberd',
  },
  mob_07_voltaic_weaver: {
    id: 'mob_07_voltaic_weaver',
    nameZh: '电弧织网者',
    nameEn: 'Voltaic Weaver',
    biomes: ['biome_03_clockwork_ossuary'],
    baseHp: 125,
    basePoise: 1.2,
    losRadiusPx: 280,
    hearingRadiusPx: 180,
    colliderWidthPx: 28,
    colliderHeightPx: 34,
    overheadOffsetY: 54,
    isMetallicClockwork: true,
    ignoresWallLos: true,
    patrolSpeedPxS: 72,
    chaseSpeedPxS: 125,
    primaryWindupMs: 620,
    primaryDamage: 32,
    secondaryWindupMs: 0,
    secondaryDamage: 0,
    blueprintDropId: 'wpn_voltaic_arc_staff',
  },
  mob_08_clockwork_tick: {
    id: 'mob_08_clockwork_tick',
    nameZh: '发条自爆蛛',
    nameEn: 'Clockwork Tick',
    biomes: ['biome_02_vitriol_sewers', 'biome_03_clockwork_ossuary'],
    baseHp: 55,
    basePoise: 0.5,
    losRadiusPx: 250,
    hearingRadiusPx: 200,
    colliderWidthPx: 22,
    colliderHeightPx: 22,
    overheadOffsetY: 36,
    isMetallicClockwork: true,
    ignoresWallLos: false,
    patrolSpeedPxS: 0,
    chaseSpeedPxS: 240,
    primaryWindupMs: 450,
    primaryDamage: 46,
    secondaryWindupMs: 0,
    secondaryDamage: 0,
    blueprintDropId: 'wpn_clockwork_repeater',
  },
  mob_09_ossuary_prelate: {
    id: 'mob_09_ossuary_prelate',
    nameZh: '骸骨堂司铎',
    nameEn: 'Ossuary Prelate',
    biomes: ['biome_03_clockwork_ossuary', 'biome_04_crucible_apex'],
    baseHp: 165,
    basePoise: 1.5,
    losRadiusPx: 320,
    hearingRadiusPx: 240,
    colliderWidthPx: 24,
    colliderHeightPx: 56,
    overheadOffsetY: 66,
    isMetallicClockwork: true,
    ignoresWallLos: true,
    patrolSpeedPxS: 50,
    chaseSpeedPxS: 88,
    primaryWindupMs: 460,
    primaryDamage: 22,
    secondaryWindupMs: 0,
    secondaryDamage: 0,
    blueprintDropId: 'skl_aegis_tonics',
  },
  mob_10_pendulum_assassin: {
    id: 'mob_10_pendulum_assassin',
    nameZh: '钟摆影刺客',
    nameEn: 'Pendulum Assassin',
    biomes: ['biome_03_clockwork_ossuary', 'biome_04_crucible_apex'],
    baseHp: 180,
    basePoise: 1.8,
    losRadiusPx: 300,
    hearingRadiusPx: 300,
    colliderWidthPx: 22,
    colliderHeightPx: 42,
    overheadOffsetY: 56,
    isMetallicClockwork: true,
    ignoresWallLos: true,
    patrolSpeedPxS: 75,
    chaseSpeedPxS: 175,
    primaryWindupMs: 360,
    primaryDamage: 30,
    secondaryWindupMs: 160,
    secondaryDamage: 28,
    blueprintDropId: 'wpn_cinnabar_twinblades',
  },
  mob_11_mercury_stalker: {
    id: 'mob_11_mercury_stalker',
    nameZh: '水银拟态猎手',
    nameEn: 'Mercury Stalker',
    biomes: ['biome_04_crucible_apex'],
    baseHp: 260,
    basePoise: 2.6,
    losRadiusPx: 270,
    hearingRadiusPx: 180,
    colliderWidthPx: 36,
    colliderHeightPx: 30,
    overheadOffsetY: 48,
    isMetallicClockwork: true,
    ignoresWallLos: false,
    patrolSpeedPxS: 60,
    chaseSpeedPxS: 190,
    primaryWindupMs: 380,
    primaryDamage: 34,
    secondaryWindupMs: 500,
    secondaryDamage: 40,
    blueprintDropId: 'wpn_quicksilver_rapier',
  },
  mob_12_astral_inquisitor: {
    id: 'mob_12_astral_inquisitor',
    nameZh: '星界审判官',
    nameEn: 'Astral Inquisitor',
    biomes: ['biome_04_crucible_apex'],
    baseHp: 380,
    basePoise: 4.0,
    losRadiusPx: 340,
    hearingRadiusPx: 260,
    colliderWidthPx: 30,
    colliderHeightPx: 66,
    overheadOffsetY: 82,
    isMetallicClockwork: true,
    ignoresWallLos: true,
    patrolSpeedPxS: 68,
    chaseSpeedPxS: 112,
    primaryWindupMs: 440,
    primaryDamage: 28,
    secondaryWindupMs: 680,
    secondaryDamage: 38,
    blueprintDropId: 'wpn_mirror_aegis',
  },
} as const;

export const ELITE_SCALING = {
  SCALE_MULTIPLIER: 1.25,
  HP_MULTIPLIER: 3.2,
  POISE_MULTIPLIER: 2.5,
  PURSUIT_TELEPORT_CD_MS: 7000,
  TWIN_CLONE_HP_RATIO: 0.45,
  ROTATING_LASER_RADIUS_PX: 96,
  ROTATING_LASER_RAD_PER_SEC: 1.35,
  VOLTAIC_CAGE_HALF_SPAN_PX: 160,
  THORNS_REAR_REFLECT_RATIO: 0.2,
} as const;

export interface EliteAffixSpec {
  readonly id: EliteAffixId;
  readonly badgeZh: string;
  readonly descZh: string;
  readonly accentHex: string;
}

export const ELITE_AFFIX_CATALOG: Readonly<Record<EliteAffixId, EliteAffixSpec>> = {
  elite_rotating_laser: {
    id: 'elite_rotating_laser',
    badgeZh: '旋火',
    descZh: '以自身为中心持续缓慢旋转一条 96px 炼金火线。',
    accentHex: '#FF5E2B',
  },
  elite_twin_clone: {
    id: 'elite_twin_clone',
    badgeZh: '双生',
    descZh: '入战召唤一只 45% 血量的半透明水银镜像协同夹击。',
    accentHex: '#38BDF8',
  },
  elite_voltaic_cage: {
    id: 'elite_voltaic_cage',
    badgeZh: '雷笼',
    descZh: '在玩家两侧 160px 竖起限制逃跑的高压感电柱。',
    accentHex: '#A855F7',
  },
  elite_thorns_shell: {
    id: 'elite_thorns_shell',
    badgeZh: '棘壳',
    descZh: '背部生长紫晶，未破盾时承受背刺将反弹 20% 伤害。',
    accentHex: '#E11D48',
  },
} as const;
