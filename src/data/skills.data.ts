/**
 * 《水银坩埚（QUICKSILVER CRUCIBLE）》全部 6 种主动炼金技能与部署陷阱配表
 * （src/data/skills.data.ts）。
 *
 * 严格遵循单向依赖铁律：零运行时依赖，100% 对齐 docs/02_COMBAT_AND_ROGUELITE_SPEC.md §3.3。
 */

import type { SynergySemanticTag } from './affixes.data';
import type { ForgeGrade, QualityTier, StatColor } from './weapons.data';

export type SkillSlotId = 'skill_1' | 'skill_2';

export type SkillId =
  | 'skl_vitriol_flask'
  | 'skl_clockwork_saw_trap'
  | 'skl_tesla_coil_turret'
  | 'skl_cryo_mercury_nova'
  | 'skl_crimson_transfusion'
  | 'skl_aegis_tonics';

export type SkillArchetype =
  | 'THROWN_CATALYST'
  | 'FLOOR_TRAP'
  | 'DEPLOY_TURRET'
  | 'INSTANT_NOVA'
  | 'BERSERK_BUFF'
  | 'REFRACT_SHIELD';

export interface SkillDefinition {
  readonly id: SkillId;
  readonly nameZh: string;
  readonly nameEn: string;
  readonly colors: readonly StatColor[];
  readonly archetype: SkillArchetype;
  /** 对应 weapon_icons_sheet.png 内的 32x32 槽位索引（16 ~ 21） */
  readonly iconSlot: number;
  readonly worldFrame: string;
  readonly baseCooldownSec: number;
  /** 脱手前摇严格 <= 12 ticks (100ms) */
  readonly startupTicks: number;
  readonly baseDamage: number;
  readonly radiusPx: number;
  readonly durationSec: number;
  readonly mechanicSummaryZh: string;
  readonly synergySummaryZh: string;
  readonly providesTags: readonly SynergySemanticTag[];
}

export const ALL_SKILL_IDS: readonly SkillId[] = [
  'skl_vitriol_flask',
  'skl_clockwork_saw_trap',
  'skl_tesla_coil_turret',
  'skl_cryo_mercury_nova',
  'skl_crimson_transfusion',
  'skl_aegis_tonics',
] as const;

export const SKILL_CONSTANTS = {
  VITRIOL_FLASK_RADIUS_PX: 112,
  VITRIOL_FLASK_POOL_DURATION_SEC: 6.0,

  SAW_TRAP_MAX_ACTIVE: 2,
  SAW_TRAP_ROOT_SEC: 3.2,
  SAW_TRAP_BOSS_ROOT_SEC: 1.6,
  SAW_TRAP_BLEED_INTERVAL_SEC: 0.5,
  SAW_TRAP_LIFETIME_SEC: 20.0,

  TESLA_TURRET_MAX_HP: 320,
  TESLA_TURRET_DURATION_SEC: 18.0,
  TESLA_TURRET_RANGE_PX: 200,
  TESLA_TURRET_BASE_INTERVAL_SEC: 0.45,
  TESLA_TURRET_TETHER_MAX_DIST_PX: 140,
  TESLA_TURRET_TETHER_FIRE_RATE_BONUS: 0.6,
  TESLA_TURRET_TETHER_DPS: 65,

  CRYO_NOVA_RADIUS_PX: 128,
  CRYO_NOVA_FREEZE_SEC: 3.5,
  CRYO_NOVA_BRITTLE_BONUS_RATIO: 0.25,

  CRIMSON_TRANSFUSION_HP_SACRIFICE_RATIO: 0.08,
  CRIMSON_TRANSFUSION_BASE_SEC: 6.0,
  CRIMSON_TRANSFUSION_KILL_EXTEND_SEC: 1.0,
  CRIMSON_TRANSFUSION_MAX_SEC: 10.0,
  CRIMSON_TRANSFUSION_ATK_SPEED_BONUS: 0.35,
  CRIMSON_TRANSFUSION_MOVE_SPEED_BONUS: 0.25,
  CRIMSON_TRANSFUSION_SPLASH_BASE_DMG: 24,

  AEGIS_TONICS_FALLBACK_HEAL_RATIO: 0.08,
  AEGIS_TONICS_SHIELD_MAX_HP_RATIO: 0.35,
  AEGIS_TONICS_DURATION_SEC: 5.0,
  AEGIS_TONICS_BURST_RADIUS_PX: 110,
  AEGIS_TONICS_BURST_BASE_DMG: 90,
} as const;

/** 全部 6 种主动炼金技能与部署陷阱完整配表（docs/02 §3.3 #01 ~ #06） */
export const SKILL_CATALOG: Readonly<Record<SkillId, SkillDefinition>> = {
  skl_vitriol_flask: {
    id: 'skl_vitriol_flask',
    nameZh: '黑火油雾罐',
    nameEn: 'Black-Fire Oil Flask',
    colors: ['rubedo', 'citrinitas'],
    archetype: 'THROWN_CATALYST',
    iconSlot: 16,
    worldFrame: 'skl_vitriol_flask',
    baseCooldownSec: 10.0,
    startupTicks: 8,
    baseDamage: 42,
    radiusPx: SKILL_CONSTANTS.VITRIOL_FLASK_RADIUS_PX,
    durationSec: SKILL_CONSTANTS.VITRIOL_FLASK_POOL_DURATION_SEC,
    mechanicSummaryZh:
      '向前抛掷高压炼金罐，爆开 112px 黑油雾造成 42 基础伤，施加 Oiled (8s) 并中心引燃 2 层燃烧，瞬间化为双倍伤炼金紫火！',
    synergySummaryZh: '引爆携带 ≥3 层矾毒的目标额外触发 104px「矾毒爆燃」二次爆炸。',
    providesTags: ['oil', 'fire', 'violet_napalm'],
  },
  skl_clockwork_saw_trap: {
    id: 'skl_clockwork_saw_trap',
    nameZh: '发条锯刃捕兽夹',
    nameEn: 'Clockwork Saw Trap',
    colors: ['citrinitas', 'albedo'],
    archetype: 'FLOOR_TRAP',
    iconSlot: 17,
    worldFrame: 'saw_trap_armed_0',
    baseCooldownSec: 12.0,
    startupTicks: 7,
    baseDamage: 35,
    radiusPx: 36,
    durationSec: SKILL_CONSTANTS.SAW_TRAP_LIFETIME_SEC,
    mechanicSummaryZh:
      '抛设齿轮捕兽夹（最多存续 2 枚），踩中夹合造成 35 伤并强制【定身 3.2s】（Boss 1.6s），每 0.5s 叠 1 层流血。',
    synergySummaryZh: '完美激活坩埚重锤、发条连发重弩定身必暴及 +70% 定身增伤词条。',
    providesTags: ['stun_root', 'bleed'],
  },
  skl_tesla_coil_turret: {
    id: 'skl_tesla_coil_turret',
    nameZh: '黄铜特斯拉哨塔',
    nameEn: 'Brass Tesla Coil Turret',
    colors: ['citrinitas'],
    archetype: 'DEPLOY_TURRET',
    iconSlot: 18,
    worldFrame: 'tesla_turret_idle_0',
    baseCooldownSec: 14.0,
    startupTicks: 9,
    baseDamage: 26,
    radiusPx: SKILL_CONSTANTS.TESLA_TURRET_RANGE_PX,
    durationSec: SKILL_CONSTANTS.TESLA_TURRET_DURATION_SEC,
    mechanicSummaryZh:
      '部署 320 HP 发条电塔（持续 18s），每 0.45s 电击 200px 敌人；玩家距塔 ≤140px 时拉出高压蓝色电弧绊线（65 电伤/s）且射速 +60%！',
    synergySummaryZh: '激活「哨塔以太共鸣」变异与全部感电暴击/超导词条。',
    providesTags: ['shock'],
  },
  skl_cryo_mercury_nova: {
    id: 'skl_cryo_mercury_nova',
    nameZh: '液氮水银霜环',
    nameEn: 'Cryo-Mercury Frost Nova',
    colors: ['albedo', 'citrinitas'],
    archetype: 'INSTANT_NOVA',
    iconSlot: 19,
    worldFrame: 'cryo_nova_ring_0',
    baseCooldownSec: 16.0,
    startupTicks: 8, // 66.7ms 极速瞬发
    baseDamage: 45,
    radiusPx: SKILL_CONSTANTS.CRYO_NOVA_RADIUS_PX,
    durationSec: SKILL_CONSTANTS.CRYO_NOVA_FREEZE_SEC,
    mechanicSummaryZh:
      '67ms 极速瞬发扩散 128px 极寒水银环，造成 45 伤害并将命中敌人全部【冰冻 3.5s】，熄灭自身负面燃烧。',
    synergySummaryZh: '破冰首击额外附加 +25% 脆性易伤（叠加 +40% 碎冰乘区），重锤清屏绝配。',
    providesTags: ['freeze', 'stun_root'],
  },
  skl_crimson_transfusion: {
    id: 'skl_crimson_transfusion',
    nameZh: '赤化沸血狂潮',
    nameEn: 'Rubedo Blood Transfusion',
    colors: ['rubedo'],
    archetype: 'BERSERK_BUFF',
    iconSlot: 20,
    worldFrame: 'crimson_mist_0',
    baseCooldownSec: 18.0,
    startupTicks: 6,
    baseDamage: SKILL_CONSTANTS.CRIMSON_TRANSFUSION_SPLASH_BASE_DMG,
    radiusPx: 54,
    durationSec: SKILL_CONSTANTS.CRIMSON_TRANSFUSION_BASE_SEC,
    mechanicSummaryZh:
      '将当前生命 8% 转为可 100% 吸回的橙血槽，6.0s 内攻速 +35%、移速 +25%、每次命中溅射 24 范围血雾伤（击杀延 1s，上限 10s）。',
    synergySummaryZh: '高频快刀/双刃瞬间吸满橙血并轰出密集血雾 AOE。',
    providesTags: ['bleed'],
  },
  skl_aegis_tonics: {
    id: 'skl_aegis_tonics',
    nameZh: '哲学家水银护瓮',
    nameEn: "Philosopher's Mercury Urn",
    colors: ['albedo'],
    archetype: 'REFRACT_SHIELD',
    iconSlot: 21,
    worldFrame: 'aegis_urn_dome_0',
    baseCooldownSec: 22.0,
    startupTicks: 8,
    baseDamage: SKILL_CONSTANTS.AEGIS_TONICS_BURST_BASE_DMG,
    radiusPx: SKILL_CONSTANTS.AEGIS_TONICS_BURST_RADIUS_PX,
    durationSec: SKILL_CONSTANTS.AEGIS_TONICS_DURATION_SEC,
    mechanicSummaryZh:
      '立即吸回 100% 橙血（无橙血则治疗 8% MaxHP），展开 5.0s 厚度 35% MaxHP 折射力场免硬直；碎盾或二段引爆震飞 110px 造成 90 白化伤。',
    synergySummaryZh: '护盾厚度随白化等级额外成长，激活 ShieldRefract 波纹力场。',
    providesTags: ['stun_root'],
  },
} as const;

export interface RolledSkillInstance {
  readonly instanceId: string;
  readonly skillId: SkillId;
  readonly level: QualityTier;
  readonly forgeGrade: ForgeGrade;
  readonly affixIds: readonly string[];
  cooldownRemainingSec: number;
}

export interface CombatHudSkillSlotSummary {
  readonly slot: SkillSlotId;
  readonly skillId: SkillId;
  readonly nameZh: string;
  readonly iconSlot: number;
  readonly qualityBadge: string;
  readonly colorHex: string;
  readonly cooldownLeftSec: number;
  readonly baseCooldownSec: number;
  readonly isReady: boolean;
}
