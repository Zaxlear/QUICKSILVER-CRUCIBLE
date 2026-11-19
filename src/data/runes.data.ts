/**
 * 《水银坩埚（QUICKSILVER CRUCIBLE）》四大永久探索符文、永恒锻炉灵液升级树、
 * 四大群落 DAG 拓扑参数与五大环境周期机关纯数据配表（src/data/runes.data.ts）。
 *
 * 严格遵循单向依赖铁律：零运行时依赖，100% 对齐 docs/02_COMBAT_AND_ROGUELITE_SPEC.md。
 */

import type { LightPresetId } from './palette.data';

export type RuneId =
  | 'rune_vitriol_tendril'
  | 'rune_mercury_conduit'
  | 'rune_calcined_ram'
  | 'rune_magnetic_claws';

export type BiomeId =
  | 'biome_01_slag_retort'
  | 'biome_02_vitriol_sewers'
  | 'biome_03_clockwork_ossuary'
  | 'biome_04_crucible_apex';

export type TrapKind =
  | 'SPIKE_BED'
  | 'ACID_GEYSER'
  | 'PENDULUM_BLADE'
  | 'VOLTAIC_ARC_GATE'
  | 'FLAME_NOZZLE';

export interface ExplorationRuneSpec {
  readonly id: RuneId;
  readonly nameZh: string;
  readonly nameEn: string;
  readonly shortBadge: string;
  readonly dropSourceZh: string;
  readonly dropBiomeId: BiomeId | 'boss_01_furnace_warden';
  readonly mechanicDescZh: string;
  readonly flavorInscriptionZh: string;
  readonly accentHex: string;
  readonly accentNum: number;
  readonly lightPreset: LightPresetId;
  readonly sigilFrame: string;
  readonly minimapIconSlot: number;
}

export const ALL_RUNE_IDS: readonly RuneId[] = [
  'rune_vitriol_tendril',
  'rune_mercury_conduit',
  'rune_calcined_ram',
  'rune_magnetic_claws',
] as const;

/** 四大类银河恶魔城（Metroidvania）永久探索符文完整配表（docs/02 §3.6.1） */
export const EXPLORATION_RUNES: Readonly<Record<RuneId, ExplorationRuneSpec>> = {
  rune_vitriol_tendril: {
    id: 'rune_vitriol_tendril',
    nameZh: '矾蚀藤蔓符文',
    nameEn: 'Vitriol Tendril Rune',
    shortBadge: 'TENDRIL',
    dropSourceZh: '第一层「矿渣蒸馏厂」精英祭坛守卫',
    dropBiomeId: 'biome_01_slag_retort',
    mechanicDescZh:
      '站在地面绿色炼金排污格栅上按交互键，催生一条高 160~240 px 的钙化水银藤梯直通高台隐藏房。',
    flavorInscriptionZh: '“清洁工曾用火油焚烧排污渠里的钙化菌丝，直到菌丝学会了顺着骨髓向上攀爬。”',
    accentHex: '#3CE682',
    accentNum: 0x3ce682,
    lightPreset: 'VITRIOL_VAT_GREEN',
    sigilFrame: 'rune_sigil_0',
    minimapIconSlot: 8,
  },
  rune_mercury_conduit: {
    id: 'rune_mercury_conduit',
    nameZh: '水银导管符文',
    nameEn: 'Mercury Conduit Rune',
    shortBadge: 'CONDUIT',
    dropSourceZh: '第二层「矾酸暗渠」深处精英司铎',
    dropBiomeId: 'biome_02_vitriol_sewers',
    mechanicDescZh:
      '触摸密封的黄铜毛细棺椁时，主角瞬间液化为一道银白高压流光，沿墙内暗管瞬移至密室配对棺椁。',
    flavorInscriptionZh: '“唯有抛弃骨骼定型的活态汞，方能挤进两寸宽的回流铅管而不留下一滴残渣。”',
    accentHex: '#38BDF8',
    accentNum: 0x38bdf8,
    lightPreset: 'VOLTAIC_CYAN',
    sigilFrame: 'rune_sigil_1',
    minimapIconSlot: 9,
  },
  rune_calcined_ram: {
    id: 'rune_calcined_ram',
    nameZh: '煅烧震地符文',
    nameEn: 'Calcined Ram Rune',
    shortBadge: 'RAM',
    dropSourceZh: '首次击败 Boss 1：黄铜香炉典狱长·萨尔弗',
    dropBiomeId: 'boss_01_furnace_warden',
    mechanicDescZh:
      '空中【下 + 跳】震地下砸威力升阶为赤红熔铁冲击（伤害 +120%），可彻底轰碎印有赤红阵纹的裂纹矿渣地面。',
    flavorInscriptionZh: '“司炉长用胸膛里的千斤炭火证明：凡不能承受重锤之地板，皆不配承载炉灰。”',
    accentHex: '#FF5E2B',
    accentNum: 0xff5e2b,
    lightPreset: 'FURNACE_CRIMSON',
    sigilFrame: 'rune_sigil_2',
    minimapIconSlot: 10,
  },
  rune_magnetic_claws: {
    id: 'rune_magnetic_claws',
    nameZh: '磁铁攀爪符文',
    nameEn: 'Magnetic Claws Rune',
    shortBadge: 'CLAWS',
    dropSourceZh: '第三层「发条骸骨堂」钟楼精英处刑官',
    dropBiomeId: 'biome_03_clockwork_ossuary',
    mechanicDescZh:
      '双手与脚踝激活电磁吸附力场，可在一切垂直铁铸墙面上匀速滑行并无限次交替蹬墙反跳攀升。',
    flavorInscriptionZh: '“圣堂处刑官倒悬于钟楼穹顶静候异端，指尖擦过黄铜齿轨的火花便是丧钟前奏。”',
    accentHex: '#FBBF24',
    accentNum: 0xfbbf24,
    lightPreset: 'TORCH_AMBER',
    sigilFrame: 'rune_sigil_3',
    minimapIconSlot: 11,
  },
} as const;

export interface AthanorForgeUpgradeSpec {
  readonly upgradeId:
    | 'upg_flask_tier'
    | 'upg_starting_recycle'
    | 'upg_gold_reserve'
    | 'upg_starter_tubes'
    | 'upg_shop_restock'
    | 'upg_legendary_forge_plus'
    | 'upg_legendary_forge_pp'
    | 'upg_legendary_forge_s';
  readonly nameZh: string;
  readonly ichorCostTiers: readonly number[];
  readonly minCrucibleHeat: 0 | 1 | 2 | 3 | 4 | 5;
  readonly effectSummaryZh: string;
}

/** 永恒锻炉圣所（Athanor Forge）灵液结晶（Ichor）永久升级总表（docs/02 §3.6.2） */
export const ATHANOR_FORGE_UPGRADES: readonly AthanorForgeUpgradeSpec[] = [
  {
    upgradeId: 'upg_flask_tier',
    nameZh: '贤者灵液瓶充能',
    ichorCostTiers: [35, 120, 300, 650],
    minCrucibleHeat: 0,
    effectSummaryZh: '局内可饮用回血药瓶上限由初始 1 口依次永久提升至 2 / 3 / 4 口（每口回复 60% MaxHP）。',
  },
  {
    upgradeId: 'upg_starting_recycle',
    nameZh: '炼金回收熔解术',
    ichorCostTiers: [40, 150],
    minCrucibleHeat: 0,
    effectSummaryZh: '可将地上不需要的无用武器/技能长按直接熔解为 45% / 75% 售卖等价金币。',
  },
  {
    upgradeId: 'upg_gold_reserve',
    nameZh: '秘银金库袋',
    ichorCostTiers: [50, 140, 280, 500],
    minCrucibleHeat: 0,
    effectSummaryZh: '阵亡重开新局时，最多保留上一局剩余金币的 800 / 2,000 / 4,000 / 7,500 G。',
  },
  {
    upgradeId: 'upg_starter_tubes',
    nameZh: '圣所多管悬吊槽',
    ichorCostTiers: [350],
    minCrucibleHeat: 0,
    effectSummaryZh: '出生起点降下 4 组透明玻璃蒸馏管（每管含 1 近战 + 1 远程/盾 + 1 技能）供开局四选一。',
  },
  {
    upgradeId: 'upg_shop_restock',
    nameZh: '商会目录分类与刷新',
    ichorCostTiers: [180, 320],
    minCrucibleHeat: 0,
    effectSummaryZh: '商店进门前可指定只刷赤化/黄化/白化专属装备，且每家商店支持最多 3 次付费刷新货架。',
  },
  {
    upgradeId: 'upg_legendary_forge_plus',
    nameZh: '大熔炉：+ 级淬火池',
    ichorCostTiers: [80, 160, 240, 320, 400, 480, 560, 640, 720, 800],
    minCrucibleHeat: 0,
    effectSummaryZh: '全局掉落与商店武器初始品质有 0% -> 100% 概率直接升阶为 + 级（等效等级 +2 且多 1 条词条）。',
  },
  {
    upgradeId: 'upg_legendary_forge_pp',
    nameZh: '大熔炉：++ 级精炼池',
    ichorCostTiers: [180, 360, 540, 720, 900, 1080, 1260, 1440, 1620, 1800],
    minCrucibleHeat: 1,
    effectSummaryZh: '全局装备有 0% -> 100% 概率升阶为 ++ 级（等效等级 +4、附带 +1 卷轴属性且多 2 条词条）。',
  },
  {
    upgradeId: 'upg_legendary_forge_s',
    nameZh: '大熔炉：S 级贤者之石',
    ichorCostTiers: [360, 720, 1080, 1440, 1800, 2160, 2520, 2880, 3240, 3600],
    minCrucibleHeat: 3,
    effectSummaryZh: '全局装备有 0% -> 100% 概率升阶为最高 S 级（等效等级 +6、+2 卷轴属性且必带稀有 ★ 词条）。',
  },
] as const;

export interface BiomeDagConfig {
  readonly biomeId: BiomeId;
  readonly nameZh: string;
  readonly depth: 1 | 2 | 3 | 4;
  readonly mainSpineCount: number;
  readonly branchCount: number;
  readonly guaranteedMainScrolls: number;
  readonly guaranteedDualScrolls: number;
  readonly altarDropRune: RuneId | null;
  readonly secretBranchRune: RuneId;
  readonly nextDestinationId: string;
}

/** 四大生态群落 DAG 拓扑生成参数总表（docs/02 §2.2） */
export const BIOME_DAG_CONFIGS: Readonly<Record<BiomeId, BiomeDagConfig>> = {
  biome_01_slag_retort: {
    biomeId: 'biome_01_slag_retort',
    nameZh: '矿渣蒸馏厂',
    depth: 1,
    mainSpineCount: 6,
    branchCount: 3,
    guaranteedMainScrolls: 2,
    guaranteedDualScrolls: 1,
    altarDropRune: 'rune_vitriol_tendril',
    secretBranchRune: 'rune_vitriol_tendril',
    nextDestinationId: 'biome_02_vitriol_sewers',
  },
  biome_02_vitriol_sewers: {
    biomeId: 'biome_02_vitriol_sewers',
    nameZh: '矾酸暗渠',
    depth: 2,
    mainSpineCount: 7,
    branchCount: 4,
    guaranteedMainScrolls: 3,
    guaranteedDualScrolls: 2,
    altarDropRune: 'rune_mercury_conduit',
    secretBranchRune: 'rune_vitriol_tendril',
    nextDestinationId: 'boss_01_furnace_warden',
  },
  biome_03_clockwork_ossuary: {
    biomeId: 'biome_03_clockwork_ossuary',
    nameZh: '发条骸骨堂',
    depth: 3,
    mainSpineCount: 8,
    branchCount: 4,
    guaranteedMainScrolls: 4,
    guaranteedDualScrolls: 2,
    altarDropRune: 'rune_magnetic_claws',
    secretBranchRune: 'rune_calcined_ram',
    nextDestinationId: 'biome_04_crucible_apex',
  },
  biome_04_crucible_apex: {
    biomeId: 'biome_04_crucible_apex',
    nameZh: '星界熔炉之巅',
    depth: 4,
    mainSpineCount: 8,
    branchCount: 4,
    guaranteedMainScrolls: 4,
    guaranteedDualScrolls: 2,
    altarDropRune: null,
    secretBranchRune: 'rune_magnetic_claws',
    nextDestinationId: 'boss_02_grand_alchemist',
  },
} as const;

export interface TrapBehaviorSpec {
  readonly kind: TrapKind;
  readonly nameZh: string;
  readonly defaultCycleMs: number;
  readonly warningDurationMs: number;
  readonly activeDurationMs: number;
  readonly playerMaxHpRatioDamage: number;
  readonly enemyFlatDamage: number;
  readonly reachPx: number;
  readonly lightPreset: LightPresetId;
}

/** 五大环境机关精确时间轴与数值表（docs/03 §3.1 ~ §3.4） */
export const TRAP_BEHAVIOR_SPECS: Readonly<Record<TrapKind, TrapBehaviorSpec>> = {
  SPIKE_BED: {
    kind: 'SPIKE_BED',
    nameZh: '矿渣锯齿尖刺池',
    defaultCycleMs: 1000,
    warningDurationMs: 0,
    activeDurationMs: 1000,
    playerMaxHpRatioDamage: 0.2,
    enemyFlatDamage: 180,
    reachPx: 14,
    lightPreset: 'FURNACE_CRIMSON',
  },
  ACID_GEYSER: {
    kind: 'ACID_GEYSER',
    nameZh: '间歇矾酸毒泉',
    defaultCycleMs: 3200,
    warningDurationMs: 700,
    activeDurationMs: 850,
    playerMaxHpRatioDamage: 0.15,
    enemyFlatDamage: 160,
    reachPx: 112,
    lightPreset: 'VITRIOL_VAT_GREEN',
  },
  FLAME_NOZZLE: {
    kind: 'FLAME_NOZZLE',
    nameZh: '高压蒸汽烈焰喷口',
    defaultCycleMs: 3000,
    warningDurationMs: 600,
    activeDurationMs: 800,
    playerMaxHpRatioDamage: 0.18,
    enemyFlatDamage: 240,
    reachPx: 80,
    lightPreset: 'FURNACE_CRIMSON',
  },
  PENDULUM_BLADE: {
    kind: 'PENDULUM_BLADE',
    nameZh: '圣堂斩首钟摆',
    defaultCycleMs: 2800,
    warningDurationMs: 0,
    activeDurationMs: 2800,
    playerMaxHpRatioDamage: 0.22,
    enemyFlatDamage: 320,
    reachPx: 64,
    lightPreset: 'TORCH_AMBER',
  },
  VOLTAIC_ARC_GATE: {
    kind: 'VOLTAIC_ARC_GATE',
    nameZh: '星界高压电弧闸门',
    defaultCycleMs: 2400,
    warningDurationMs: 500,
    activeDurationMs: 750,
    playerMaxHpRatioDamage: 0.16,
    enemyFlatDamage: 210,
    reachPx: 64,
    lightPreset: 'VOLTAIC_CYAN',
  },
} as const;

/** 确定性子随机流派生通道哈希（.agents/rules/level-topology-and-determinism.md §2.1） */
export const RNG_CHANNEL_HASH = {
  BIOME_TOPOLOGY: 0x42494f4d,
  LOOT_AND_AFFIX: 0x4c4f4f54,
  ENEMY_SPAWN: 0x454e4d59,
  GOLD_AND_BLUEPRINT: 0x474f4c44,
} as const;

export interface MinimapNodeSnapshot {
  readonly nodeId: string;
  readonly role: string;
  readonly worldTileX: number;
  readonly worldTileY: number;
  readonly widthTiles: number;
  readonly heightTiles: number;
  readonly isMainSpine: boolean;
  readonly visited: boolean;
  readonly hasTeleporter: boolean;
  readonly teleporterActive: boolean;
}

export interface MinimapBridgeSnapshot {
  readonly bridgeId: string;
  readonly fromNodeId: string;
  readonly toNodeId: string;
  readonly worldTileX: number;
  readonly worldTileY: number;
  readonly widthTiles: number;
  readonly heightTiles: number;
  readonly requiredRune: RuneId | null;
}

export interface WorldBannerNotice {
  readonly title: string;
  readonly body: string;
  readonly accentHex: string;
}

export interface MinimapSnapshotPayload {
  readonly biomeId: BiomeId;
  readonly biomeNameZh: string;
  readonly runSeed: number;
  readonly currentRoomId: string;
  readonly expanded: boolean;
  readonly isWarping: boolean;
  readonly unlockedRunes: readonly RuneId[];
  readonly nodes: readonly MinimapNodeSnapshot[];
  readonly bridges: readonly MinimapBridgeSnapshot[];
  readonly banner: WorldBannerNotice | null;
  readonly interactPrompt: string | null;
  readonly collectedSeals?: readonly string[];
  readonly crucibleHeat?: number;
}
