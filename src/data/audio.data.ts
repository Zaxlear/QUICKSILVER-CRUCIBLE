/**
 * 《水银坩埚（QUICKSILVER CRUCIBLE）》商业级双轨交互音乐、濒死低通滤波与 24 组多变体音效静态配表
 * （src/data/audio.data.ts — 纯数据与类型声明层，零运行时模块依赖）。
 *
 * 严格对齐 docs/04_ART_VFX_AUDIO_PIPELINE.md §4.1 ~ §4.3 与 .agents/rules/zero-placeholder-assets.md。
 */

export type BgmStemId =
  | 'bgm_sanctum_loop'
  | 'bgm_b01_explore'
  | 'bgm_b01_combat'
  | 'bgm_b02_explore'
  | 'bgm_b02_combat'
  | 'bgm_b03_explore'
  | 'bgm_b03_combat'
  | 'bgm_b04_explore'
  | 'bgm_b04_combat'
  | 'bgm_boss1_p1'
  | 'bgm_boss1_p2'
  | 'bgm_boss2_p1'
  | 'bgm_boss2_p2'
  | 'bgm_boss2_p3'
  | 'bgm_low_hp_pulse';

export type AudioProgramId =
  | 'sanctum'
  | 'biome_01_slag_retort'
  | 'biome_02_vitriol_sewers'
  | 'biome_03_clockwork_ossuary'
  | 'biome_04_crucible_apex'
  | 'boss_01_furnace_warden'
  | 'boss_02_grand_alchemist';

export type SfxGroupId =
  | 'sfx_step_stone'
  | 'sfx_step_metal'
  | 'sfx_jump_launch'
  | 'sfx_djump_mercury'
  | 'sfx_dodge_whoosh'
  | 'sfx_swing_light'
  | 'sfx_swing_heavy'
  | 'sfx_hit_flesh'
  | 'sfx_hit_clockwork'
  | 'sfx_crit_impact'
  | 'sfx_parry_clang'
  | 'sfx_breach_stun'
  | 'sfx_bow_release'
  | 'sfx_flask_shatter'
  | 'sfx_voltaic_zap'
  | 'sfx_status_freeze'
  | 'sfx_hemorrhage_pop'
  | 'sfx_enemy_warn_parry'
  | 'sfx_enemy_warn_red'
  | 'sfx_enemy_dissolve'
  | 'sfx_ichor_pickup'
  | 'sfx_scroll_upgrade'
  | 'sfx_flask_drink'
  | 'sfx_ui_confirm_cancel';

export type SfxCategory = 'locomotion' | 'combat' | 'status' | 'enemy' | 'ui';

export interface BgmStemSpec {
  readonly id: BgmStemId;
  readonly titleZh: string;
  readonly bpm: number;
  readonly beatsPerBar: 3 | 4 | 6;
  readonly loopBars: number;
  /** Howler 双编码加载顺序：['xxx.webm', 'xxx.m4a']（桌面端 Opus 优先，iOS Safari/PWA AAC 硬解） */
  readonly src: readonly [string, string];
}

export interface AudioProgramSpec {
  readonly id: AudioProgramId;
  readonly titleZh: string;
  readonly subtitleEn: string;
  readonly bpm: number;
  readonly timeSignature: '3/4' | '4/4' | '6/8';
  readonly mode: 'SINGLE_LOOP' | 'DUAL_ADAPTIVE' | 'BOSS_PHASED';
  readonly stems: readonly BgmStemId[];
}

export interface SfxGroupSpec {
  readonly id: SfxGroupId;
  readonly labelZh: string;
  readonly category: SfxCategory;
  readonly variants: number;
  readonly maxConcurrent: number;
  readonly baseVolume: number;
  readonly minRetriggerMs: number;
  readonly pitchJitterEnabled: boolean;
  readonly variantSources: readonly (readonly [string, string])[];
}

export interface AudioUserSettings {
  readonly masterVolume: number;
  readonly bgmVolume: number;
  readonly sfxVolume: number;
  readonly muted: boolean;
}

export interface AudioTelemetrySnapshot {
  readonly contextState: 'running' | 'suspended' | 'interrupted' | 'closed' | 'unavailable';
  readonly iosUnlocked: boolean;
  readonly programId: AudioProgramId;
  readonly programTitleZh: string;
  readonly bpm: number;
  readonly timeSignature: '3/4' | '4/4' | '6/8';
  readonly activeBossPhase: 1 | 2 | 3;
  readonly aggroCount: number;
  readonly combatWeight: number;
  readonly exploreVolume: number;
  readonly combatVolume: number;
  readonly stemPhaseDriftMs: number;
  readonly isLowHpMuffled: boolean;
  readonly isPauseMenuMuffled: boolean;
  readonly lowHpPulseActive: boolean;
  readonly lowHpPulseVolume: number;
  readonly lowpassTargetHz: number;
  readonly lowpassCurrentHz: number;
  readonly activeSfxVoices: number;
  readonly lastTriggeredSfx: SfxGroupId | null;
  readonly lastSfxRate: number;
  readonly lastSfxVariant: number;
  /** 12 段归一化频谱柱 (0.0 ~ 1.0)，供暂停界面频谱分析仪与 Browser QA 低通衰减核验 */
  readonly spectrumBars: readonly number[];
  readonly lowBandEnergy: number;
  readonly highBandEnergy: number;
  readonly settings: AudioUserSettings;
}

export interface PauseAudioMenuPayload {
  readonly open: boolean;
  readonly activeSceneKey: string;
}

function stemUrls(id: BgmStemId): readonly [string, string] {
  return [`/assets/audio/stems/${id}.webm`, `/assets/audio/stems/${id}.m4a`] as const;
}

function sfxVariantUrls(id: SfxGroupId, count: number): readonly (readonly [string, string])[] {
  const list: Array<readonly [string, string]> = [];
  for (let i = 1; i <= count; i++) {
    list.push([`/assets/audio/sfx/${id}_v${i}.webm`, `/assets/audio/sfx/${id}_v${i}.m4a`] as const);
  }
  return list;
}

export const AUDIO_CONSTANTS = {
  STORAGE_KEY: 'qc_audio_settings_v1',
  EXPLORE_BASE_VOL: 0.85,
  EXPLORE_DUCKED_VOL: 0.35,
  COMBAT_IDLE_VOL: 0.0,
  COMBAT_ACTIVE_VOL: 0.90,
  BOSS_ACTIVE_VOL: 0.90,
  SANCTUM_BASE_VOL: 0.82,
  LOW_HP_PULSE_MAX_VOL: 0.62,

  AGGRO_FADE_IN_MS: 900,
  DEAGGRO_HOLD_MS: 2200,
  DEAGGRO_FADE_OUT_MS: 1500,
  BOSS_PHASE_CROSSFADE_MS: 950,
  PULSE_FADE_MS: 380,
  PHASE_RESYNC_CHECK_MS: 2000,
  MAX_ALLOWED_DRIFT_SEC: 0.024,

  LOWPASS_OPEN_HZ: 20000,
  LOWPASS_MUFFLED_HZ: 420,
  LOWPASS_Q: 1.4,
  LOWPASS_ENTER_RAMP_SEC: 0.25,
  LOWPASS_EXIT_RAMP_SEC: 0.16,
  LOW_HP_RATIO_THRESHOLD: 0.25,

  PITCH_MIN_RATE: 0.92,
  PITCH_MAX_RATE: 1.08,
  SPATIAL_PAN_SPAN_PX: 280,
  SPATIAL_PAN_CLAMP: 0.65,
} as const;

export const DEFAULT_AUDIO_SETTINGS: AudioUserSettings = {
  masterVolume: 0.88,
  bgmVolume: 0.85,
  sfxVolume: 0.92,
  muted: false,
};

export const DEFAULT_AUDIO_TELEMETRY: AudioTelemetrySnapshot = {
  contextState: 'suspended',
  iosUnlocked: false,
  programId: 'sanctum',
  programTitleZh: '永恒锻炉圣所 · 灰烬圆舞',
  bpm: 84,
  timeSignature: '3/4',
  activeBossPhase: 1,
  aggroCount: 0,
  combatWeight: 0,
  exploreVolume: 0.63,
  combatVolume: 0,
  stemPhaseDriftMs: 0,
  isLowHpMuffled: false,
  isPauseMenuMuffled: false,
  lowHpPulseActive: false,
  lowHpPulseVolume: 0,
  lowpassTargetHz: 20000,
  lowpassCurrentHz: 20000,
  activeSfxVoices: 0,
  lastTriggeredSfx: null,
  lastSfxRate: 1,
  lastSfxVariant: 0,
  spectrumBars: [0.42, 0.48, 0.45, 0.39, 0.34, 0.29, 0.25, 0.21, 0.18, 0.14, 0.11, 0.08],
  lowBandEnergy: 0.435,
  highBandEnergy: 0.164,
  settings: DEFAULT_AUDIO_SETTINGS,
};

export const ALL_BGM_STEM_IDS: readonly BgmStemId[] = [
  'bgm_sanctum_loop',
  'bgm_b01_explore',
  'bgm_b01_combat',
  'bgm_b02_explore',
  'bgm_b02_combat',
  'bgm_b03_explore',
  'bgm_b03_combat',
  'bgm_b04_explore',
  'bgm_b04_combat',
  'bgm_boss1_p1',
  'bgm_boss1_p2',
  'bgm_boss2_p1',
  'bgm_boss2_p2',
  'bgm_boss2_p3',
  'bgm_low_hp_pulse',
] as const;

export const BGM_STEM_CATALOG: Readonly<Record<BgmStemId, BgmStemSpec>> = {
  bgm_sanctum_loop: { id: 'bgm_sanctum_loop', titleZh: '永恒锻炉圣所 · 灰烬圆舞', bpm: 84, beatsPerBar: 3, loopBars: 8, src: stemUrls('bgm_sanctum_loop') },
  bgm_b01_explore: { id: 'bgm_b01_explore', titleZh: '矿渣蒸馏厂 · 探索轨', bpm: 136, beatsPerBar: 4, loopBars: 8, src: stemUrls('bgm_b01_explore') },
  bgm_b01_combat: { id: 'bgm_b01_combat', titleZh: '矿渣蒸馏厂 · 战斗轨', bpm: 136, beatsPerBar: 4, loopBars: 8, src: stemUrls('bgm_b01_combat') },
  bgm_b02_explore: { id: 'bgm_b02_explore', titleZh: '矾酸暗渠 · 探索轨', bpm: 142, beatsPerBar: 4, loopBars: 8, src: stemUrls('bgm_b02_explore') },
  bgm_b02_combat: { id: 'bgm_b02_combat', titleZh: '矾酸暗渠 · 战斗轨', bpm: 142, beatsPerBar: 4, loopBars: 8, src: stemUrls('bgm_b02_combat') },
  bgm_b03_explore: { id: 'bgm_b03_explore', titleZh: '发条骸骨堂 · 探索轨', bpm: 150, beatsPerBar: 6, loopBars: 8, src: stemUrls('bgm_b03_explore') },
  bgm_b03_combat: { id: 'bgm_b03_combat', titleZh: '发条骸骨堂 · 战斗轨', bpm: 150, beatsPerBar: 6, loopBars: 8, src: stemUrls('bgm_b03_combat') },
  bgm_b04_explore: { id: 'bgm_b04_explore', titleZh: '星界熔炉之巅 · 探索轨', bpm: 156, beatsPerBar: 4, loopBars: 8, src: stemUrls('bgm_b04_explore') },
  bgm_b04_combat: { id: 'bgm_b04_combat', titleZh: '星界熔炉之巅 · 战斗轨', bpm: 156, beatsPerBar: 4, loopBars: 8, src: stemUrls('bgm_b04_combat') },
  bgm_boss1_p1: { id: 'bgm_boss1_p1', titleZh: '典狱长萨尔弗 · P1 司炉重锤', bpm: 138, beatsPerBar: 4, loopBars: 8, src: stemUrls('bgm_boss1_p1') },
  bgm_boss1_p2: { id: 'bgm_boss1_p2', titleZh: '典狱长萨尔弗 · P2 焚化狂暴', bpm: 138, beatsPerBar: 4, loopBars: 8, src: stemUrls('bgm_boss1_p2') },
  bgm_boss2_p1: { id: 'bgm_boss2_p1', titleZh: '帕拉塞尔苏斯 · P1 四象威仪', bpm: 160, beatsPerBar: 4, loopBars: 8, src: stemUrls('bgm_boss2_p1') },
  bgm_boss2_p2: { id: 'bgm_boss2_p2', titleZh: '帕拉塞尔苏斯 · P2 衔尾蛇神躯', bpm: 160, beatsPerBar: 4, loopBars: 8, src: stemUrls('bgm_boss2_p2') },
  bgm_boss2_p3: { id: 'bgm_boss2_p3', titleZh: '帕拉塞尔苏斯 · P3 星界大溶解', bpm: 160, beatsPerBar: 4, loopBars: 8, src: stemUrls('bgm_boss2_p3') },
  bgm_low_hp_pulse: { id: 'bgm_low_hp_pulse', titleZh: '水银核濒死脉搏 (68 BPM)', bpm: 68, beatsPerBar: 4, loopBars: 4, src: stemUrls('bgm_low_hp_pulse') },
};

export const AUDIO_PROGRAM_CATALOG: Readonly<Record<AudioProgramId, AudioProgramSpec>> = {
  sanctum: {
    id: 'sanctum',
    titleZh: '永恒锻炉圣所 · 灰烬圆舞',
    subtitleEn: 'Athanor Sanctum Chamber Waltz',
    bpm: 84,
    timeSignature: '3/4',
    mode: 'SINGLE_LOOP',
    stems: ['bgm_sanctum_loop'],
  },
  biome_01_slag_retort: {
    id: 'biome_01_slag_retort',
    titleZh: 'I. 矿渣蒸馏厂 · 双轨混音',
    subtitleEn: 'The Slag Retorts (Explore + Combat)',
    bpm: 136,
    timeSignature: '4/4',
    mode: 'DUAL_ADAPTIVE',
    stems: ['bgm_b01_explore', 'bgm_b01_combat'],
  },
  biome_02_vitriol_sewers: {
    id: 'biome_02_vitriol_sewers',
    titleZh: 'II. 矾酸暗渠 · 双轨混音',
    subtitleEn: 'The Vitriol Aqueducts (Explore + Combat)',
    bpm: 142,
    timeSignature: '4/4',
    mode: 'DUAL_ADAPTIVE',
    stems: ['bgm_b02_explore', 'bgm_b02_combat'],
  },
  biome_03_clockwork_ossuary: {
    id: 'biome_03_clockwork_ossuary',
    titleZh: 'III. 发条骸骨堂 · 双轨混音',
    subtitleEn: 'The Clockwork Ossuary (Explore + Combat)',
    bpm: 150,
    timeSignature: '6/8',
    mode: 'DUAL_ADAPTIVE',
    stems: ['bgm_b03_explore', 'bgm_b03_combat'],
  },
  biome_04_crucible_apex: {
    id: 'biome_04_crucible_apex',
    titleZh: 'IV. 星界熔炉之巅 · 双轨混音',
    subtitleEn: 'The Astral Athanor (Explore + Combat)',
    bpm: 156,
    timeSignature: '4/4',
    mode: 'DUAL_ADAPTIVE',
    stems: ['bgm_b04_explore', 'bgm_b04_combat'],
  },
  boss_01_furnace_warden: {
    id: 'boss_01_furnace_warden',
    titleZh: 'Boss 1 · 典狱长萨尔弗',
    subtitleEn: 'Arch-Warden Sulfur (P1 / P2)',
    bpm: 138,
    timeSignature: '4/4',
    mode: 'BOSS_PHASED',
    stems: ['bgm_boss1_p1', 'bgm_boss1_p2'],
  },
  boss_02_grand_alchemist: {
    id: 'boss_02_grand_alchemist',
    titleZh: 'Boss 2 · 至高炼金师帕拉塞尔苏斯',
    subtitleEn: 'Paracelsus Prime (P1 / P2 / P3 Alkahest)',
    bpm: 160,
    timeSignature: '4/4',
    mode: 'BOSS_PHASED',
    stems: ['bgm_boss2_p1', 'bgm_boss2_p2', 'bgm_boss2_p3'],
  },
};

export const ALL_SFX_GROUP_IDS: readonly SfxGroupId[] = [
  'sfx_step_stone',
  'sfx_step_metal',
  'sfx_jump_launch',
  'sfx_djump_mercury',
  'sfx_dodge_whoosh',
  'sfx_swing_light',
  'sfx_swing_heavy',
  'sfx_hit_flesh',
  'sfx_hit_clockwork',
  'sfx_crit_impact',
  'sfx_parry_clang',
  'sfx_breach_stun',
  'sfx_bow_release',
  'sfx_flask_shatter',
  'sfx_voltaic_zap',
  'sfx_status_freeze',
  'sfx_hemorrhage_pop',
  'sfx_enemy_warn_parry',
  'sfx_enemy_warn_red',
  'sfx_enemy_dissolve',
  'sfx_ichor_pickup',
  'sfx_scroll_upgrade',
  'sfx_flask_drink',
  'sfx_ui_confirm_cancel',
] as const;

function defineSfx(
  id: SfxGroupId,
  labelZh: string,
  category: SfxCategory,
  variants: number,
  maxConcurrent: number,
  baseVolume: number,
  minRetriggerMs = 18
): SfxGroupSpec {
  return {
    id,
    labelZh,
    category,
    variants,
    maxConcurrent,
    baseVolume,
    minRetriggerMs,
    pitchJitterEnabled: true,
    variantSources: sfxVariantUrls(id, variants),
  };
}

export const SFX_POOL_CATALOG: Readonly<Record<SfxGroupId, SfxGroupSpec>> = {
  sfx_step_stone: defineSfx('sfx_step_stone', '潮湿石砖脚步', 'locomotion', 4, 2, 0.44, 55),
  sfx_step_metal: defineSfx('sfx_step_metal', '铸铁格栅脚步', 'locomotion', 4, 2, 0.46, 55),
  sfx_jump_launch: defineSfx('sfx_jump_launch', '炼金皮衣腾跃', 'locomotion', 3, 2, 0.62, 35),
  sfx_djump_mercury: defineSfx('sfx_djump_mercury', '二段跳水银喷射', 'locomotion', 3, 2, 0.72, 35),
  sfx_dodge_whoosh: defineSfx('sfx_dodge_whoosh', '水银瞬步翻滚', 'locomotion', 3, 2, 0.68, 40),
  sfx_swing_light: defineSfx('sfx_swing_light', '轻兵利刃破风', 'combat', 4, 3, 0.64, 22),
  sfx_swing_heavy: defineSfx('sfx_swing_heavy', '重兵巨刃劈空', 'combat', 3, 2, 0.78, 35),
  sfx_hit_flesh: defineSfx('sfx_hit_flesh', '血肉撕裂命中', 'combat', 4, 4, 0.80, 14),
  sfx_hit_clockwork: defineSfx('sfx_hit_clockwork', '发条黄铜火花命中', 'combat', 4, 4, 0.80, 14),
  sfx_crit_impact: defineSfx('sfx_crit_impact', '暴击重创碎晶钟鸣', 'combat', 3, 3, 0.94, 20),
  sfx_parry_clang: defineSfx('sfx_parry_clang', '黄金盾反高碳钢鸣', 'combat', 3, 2, 0.98, 25),
  sfx_breach_stun: defineSfx('sfx_breach_stun', '韧性击破发条崩解', 'combat', 2, 2, 0.84, 35),
  sfx_bow_release: defineSfx('sfx_bow_release', '钨丝弓弦机括击发', 'combat', 3, 3, 0.70, 22),
  sfx_flask_shatter: defineSfx('sfx_flask_shatter', '蒸馏烧瓶碎裂酸蚀', 'combat', 3, 3, 0.82, 25),
  sfx_voltaic_zap: defineSfx('sfx_voltaic_zap', '特斯拉高压电弧爆裂', 'status', 4, 3, 0.72, 24),
  sfx_status_freeze: defineSfx('sfx_status_freeze', '液氮极寒结冰脆响', 'status', 2, 2, 0.80, 35),
  sfx_hemorrhage_pop: defineSfx('sfx_hemorrhage_pop', '五层大动脉崩裂血爆', 'status', 2, 2, 0.90, 35),
  sfx_enemy_warn_parry: defineSfx('sfx_enemy_warn_parry', '敌方黄框可招架音叉预警', 'enemy', 2, 3, 0.78, 40),
  sfx_enemy_warn_red: defineSfx('sfx_enemy_warn_red', '敌方红框破防低音号预警', 'enemy', 2, 2, 0.84, 50),
  sfx_enemy_dissolve: defineSfx('sfx_enemy_dissolve', '躯壳余烬化灰溶解', 'enemy', 3, 4, 0.74, 20),
  sfx_ichor_pickup: defineSfx('sfx_ichor_pickup', '活态灵液吸收泛音', 'ui', 4, 5, 0.68, 16),
  sfx_scroll_upgrade: defineSfx('sfx_scroll_upgrade', '三系炼金卷轴升阶号角', 'ui', 1, 1, 0.92, 120),
  sfx_flask_drink: defineSfx('sfx_flask_drink', '拔塞痛饮贤者灵液瓶', 'ui', 2, 1, 0.86, 120),
  sfx_ui_confirm_cancel: defineSfx('sfx_ui_confirm_cancel', '黄铜怀表擒纵确认键', 'ui', 3, 2, 0.58, 22),
};
