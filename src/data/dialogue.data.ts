/**
 * 《水银坩埚（QUICKSILVER CRUCIBLE）》全量叙事文本库、34 段 NPC 递进对话树、
 * 10 大环境叙事剧情房、真结局三枚原初质封印与双多阶段 Boss 精确数值配表（src/data/dialogue.data.ts）。
 *
 * 严格遵循单向依赖铁律：零运行时依赖，100% 逐字对齐 docs/03_WORLD_LORE_AND_ENEMIES.md §1 ~ §4。
 */

import type { BiomeId, RuneId } from './runes.data';
import type { WeaponId } from './weapons.data';

export type BossId = 'boss_01_furnace_warden' | 'boss_02_grand_alchemist';

export type NpcSpeakerId = 'corvus' | 'isolde' | 'vesper';

export type TrueEndingSealFlag =
  | 'flag_seal_conduit'
  | 'flag_seal_ram'
  | 'flag_seal_claws';

export type EndingOutcomeId =
  | 'NONE'
  | 'AWAITING_ALKAHEST_CHOICE'
  | 'END_FALSE_CALCIFICATION'
  | 'IN_PHASE_3_ALKAHEST'
  | 'END_TRUE_RETURN_PAIN';

export type PortraitSlotIndex = 0 | 1 | 2 | 3 | 4 | 5;

export type DialogueDisplayMode = 'FULL' | 'COMPACT_SUBTITLE';

export type CampaignStageTarget =
  | 'sanctum'
  | 'boss_01_furnace_warden'
  | 'boss_02_grand_alchemist';

export const ALL_TRUE_ENDING_SEALS: readonly TrueEndingSealFlag[] = [
  'flag_seal_conduit',
  'flag_seal_ram',
  'flag_seal_claws',
] as const;

export const TRUE_ENDING_SEAL_META: Readonly<
  Record<
    TrueEndingSealFlag,
    {
      readonly flagId: TrueEndingSealFlag;
      readonly nameZh: string;
      readonly shortZh: string;
      readonly sourceBiomeId: BiomeId;
      readonly requiredRune: RuneId;
      readonly accentHex: string;
    }
  >
> = {
  flag_seal_conduit: {
    flagId: 'flag_seal_conduit',
    nameZh: '第一真名封印：剥离手记（悲悯）',
    shortZh: '封印·悲悯',
    sourceBiomeId: 'biome_02_vitriol_sewers',
    requiredRune: 'rune_mercury_conduit',
    accentHex: '#38BDF8',
  },
  flag_seal_ram: {
    flagId: 'flag_seal_ram',
    nameZh: '第二真名封印：痛觉神经标本',
    shortZh: '封印·痛觉',
    sourceBiomeId: 'biome_03_clockwork_ossuary',
    requiredRune: 'rune_calcined_ram',
    accentHex: '#FF5E2B',
  },
  flag_seal_claws: {
    flagId: 'flag_seal_claws',
    nameZh: '第三真名封印：万能溶剂催化式',
    shortZh: '封印·溶剂',
    sourceBiomeId: 'biome_04_crucible_apex',
    requiredRune: 'rune_magnetic_claws',
    accentHex: '#FBBF24',
  },
} as const;

export interface PrologueBeatSpec {
  readonly id: 'pro_01' | 'pro_02' | 'pro_03';
  readonly stageDirectionZh: string;
  readonly bodyZh: string;
  readonly durationMs: number;
}

/** 开场序章唤醒演出文本（docs/03 §2.1，共 3 段） */
export const PROLOGUE_SEQUENCE: readonly PrologueBeatSpec[] = [
  {
    id: 'pro_01',
    stageDirectionZh: '黑场水银滴落声 · 毛细回流银管微光苏醒',
    bodyZh: '“灰烬归于炉底，蒸汽归于苍穹，唯独不纯的记忆……顺着铅管流回了沟渠。”',
    durationMs: 3600,
  },
  {
    id: 'pro_02',
    stageDirectionZh: '水银注入圣所碎裂白瓷躯壳 · 黄铜笼盔幽光亮起',
    bodyZh: '“第九次煅烧残余物，编号 Vessel-09。无舌，无名，无痛觉许可证。”',
    durationMs: 3600,
  },
  {
    id: 'pro_03',
    stageDirectionZh: '九号蒸馏体自锻炉石台撑起身 · 拾起锈蚀解剖刃',
    bodyZh: '“尖塔之巅的大熔炉仍在轰鸣。去攀爬吧，空心的容器——去问问那位高坐云端的造物主，他究竟把谁的良心丢进了废液池。”',
    durationMs: 4400,
  },
] as const;

export interface NpcGuardContext {
  readonly currentBiomeId: BiomeId | 'sanctum';
  readonly deathCount: number;
  readonly forgeUpgradeCount: number;
  readonly forgePlusPct: number;
  readonly forgeDoublePlusPct: number;
  readonly unlockedRunes: readonly RuneId[];
  readonly defeatedBoss1: boolean;
  readonly normalEndingCleared: boolean;
  readonly unlockedWeaponCount: number;
  readonly sealCount: number;
  readonly crucibleHeat: number;
  readonly holdingHeavyWeapon: boolean;
  readonly holdingClockworkRepeater: boolean;
  readonly isPlayerLowHp: boolean;
  readonly isPlayerCursed: boolean;
}

export interface NpcDialogueLineSpec {
  readonly id: string;
  readonly speakerId: NpcSpeakerId;
  readonly speakerNameZh: string;
  readonly speakerTitleZh: string;
  readonly portraitSlot: PortraitSlotIndex;
  readonly accentHex: string;
  readonly priority: number;
  readonly triggerSummaryZh: string;
  readonly bodyZh: string;
}

export const NPC_SPEAKER_META: Readonly<
  Record<
    NpcSpeakerId,
    {
      readonly nameZh: string;
      readonly titleZh: string;
      readonly portraitSlot: PortraitSlotIndex;
      readonly accentHex: string;
      readonly spritePrefix: string;
    }
  >
> = {
  corvus: {
    nameZh: '科尔维斯',
    titleZh: '蒸馏收藏官 · Archivist Corvus',
    portraitSlot: 1,
    accentHex: '#3CE682',
    spritePrefix: 'npc_corvus_idle',
  },
  isolde: {
    nameZh: '伊索尔德',
    titleZh: '断臂钟表匠 · Isolde the Unwound',
    portraitSlot: 2,
    accentHex: '#FF5E2B',
    spritePrefix: 'npc_isolde_idle',
  },
  vesper: {
    nameZh: '维斯帕',
    titleZh: '提灯告解修女 · Sister Vesper',
    portraitSlot: 3,
    accentHex: '#FBBF24',
    spritePrefix: 'npc_vesper_idle',
  },
} as const;

/** 三位核心 NPC 全状态递进台词库（共 12 + 11 + 11 = 34 段完整成品台词，零删减，docs/03 §2.2） */
export const NPC_DIALOGUE_LINES: readonly NpcDialogueLineSpec[] = [
  // ================= NPC 1：蒸馏收藏官·科尔维斯（12 段） =================
  {
    id: 'corvus_01',
    speakerId: 'corvus',
    speakerNameZh: '蒸馏收藏官·科尔维斯',
    speakerTitleZh: '永恒锻炉圣所 · 灵液分馏台',
    portraitSlot: 1,
    accentHex: '#3CE682',
    priority: 10,
    triggerSummaryZh: '首次在圣所相遇',
    bodyZh: '“噢！别把水银甩在我刚擦干净的分馏瓶上，九号标本！看看你这副刚出窑的脆瓷骨架，走起路来像一袋快散架的怀表。把你在上面搜刮到的【灵液结晶】交给我——死人用不上知识，但我的坩埚需要燃料。”',
  },
  {
    id: 'corvus_02',
    speakerId: 'corvus',
    speakerNameZh: '蒸馏收藏官·科尔维斯',
    speakerTitleZh: '永恒锻炉圣所 · 灵液分馏台',
    portraitSlot: 1,
    accentHex: '#3CE682',
    priority: 30,
    triggerSummaryZh: '首次交付灵液解锁任意一项升级',
    bodyZh: '“嘶……多么醇厚的凝结记忆！尝起来有铁锈、恐慌，还有一点点底层监工劣质松子酒的酸味。拿着这把新家伙，下次死回来前争取多撑两条街。”',
  },
  {
    id: 'corvus_03',
    speakerId: 'corvus',
    speakerNameZh: '蒸馏收藏官·科尔维斯',
    speakerTitleZh: '永恒锻炉圣所 · 灵液分馏台',
    portraitSlot: 1,
    accentHex: '#3CE682',
    priority: 40,
    triggerSummaryZh: '玩家首次阵亡重生回到圣所',
    bodyZh: '“我听见排污管咕噜响，就知道你又被人敲碎了脑壳——虽然你本来也没有脑壳。别垂头丧气，只要水银核没蒸发，破碎不过是一次免费的酸洗除锈。”',
  },
  {
    id: 'corvus_04',
    speakerId: 'corvus',
    speakerNameZh: '蒸馏收藏官·科尔维斯',
    speakerTitleZh: '永恒锻炉圣所 · 灵液分馏台',
    portraitSlot: 1,
    accentHex: '#3CE682',
    priority: 45,
    triggerSummaryZh: '解锁 rune_vitriol_tendril（矾蚀藤蔓）后',
    bodyZh: '“你在手指里种下了矾蚀孢子？疯子行径，我喜欢。那些从排污格栅里疯长的钙化藤蔓原本是清洁工的噩梦，现在它们是你的私人云梯了。”',
  },
  {
    id: 'corvus_05',
    speakerId: 'corvus',
    speakerNameZh: '蒸馏收藏官·科尔维斯',
    speakerTitleZh: '永恒锻炉圣所 · 灵液分馏台',
    portraitSlot: 1,
    accentHex: '#3CE682',
    priority: 50,
    triggerSummaryZh: '解锁 rune_mercury_conduit（水银导管）后',
    bodyZh: '“液化穿梭毛细棺椁……你知道上一个尝试把自己压进两寸宽铜管的学徒怎么了吗？他在三个街区的水龙头里同时流了出来。好在你本来就是一团水银。”',
  },
  {
    id: 'corvus_06',
    speakerId: 'corvus',
    speakerNameZh: '蒸馏收藏官·科尔维斯',
    speakerTitleZh: '矾酸暗渠前哨 · 灵液休整室',
    portraitSlot: 1,
    accentHex: '#3CE682',
    priority: 52,
    triggerSummaryZh: '首次踏入第二层后休整室',
    bodyZh: '“闻到那股刺鼻的绿矾味了吗？前面就是黄铜香炉典狱长萨尔弗的领地。大煅烧前他是个虔诚的司炉长，现在他把活人塞进香炉当柴烧，只为了替尖塔维持恒温。”',
  },
  {
    id: 'corvus_07',
    speakerId: 'corvus',
    speakerNameZh: '蒸馏收藏官·科尔维斯',
    speakerTitleZh: '永恒锻炉圣所 · 灵液分馏台',
    portraitSlot: 1,
    accentHex: '#3CE682',
    priority: 65,
    triggerSummaryZh: '首次击败 Boss 1 萨尔弗后',
    bodyZh: '“萨尔弗倒下了？怪不得刚才整座地下管道的温度降了三度。他腹腔里那枚【煅烧震地符文】归你了——去把骸骨堂那些老古董的地板踩个稀巴烂吧。”',
  },
  {
    id: 'corvus_08',
    speakerId: 'corvus',
    speakerNameZh: '蒸馏收藏官·科尔维斯',
    speakerTitleZh: '永恒锻炉圣所 · 灵液分馏台',
    portraitSlot: 1,
    accentHex: '#3CE682',
    priority: 70,
    triggerSummaryZh: '解锁 rune_magnetic_claws（磁铁攀爪）后',
    bodyZh: '“电磁攀爪！这可是发条骸骨堂处刑官用来倒挂在钟楼顶上偷袭异端的违禁品。现在整座尖塔再也没有哪面高墙能拦住你了。”',
  },
  {
    id: 'corvus_09',
    speakerId: 'corvus',
    speakerNameZh: '蒸馏收藏官·科尔维斯',
    speakerTitleZh: '永恒锻炉圣所 · 灵液分馏台',
    portraitSlot: 1,
    accentHex: '#3CE682',
    priority: 75,
    triggerSummaryZh: '累计解锁 ≥ 8 把武器蓝图时',
    bodyZh: '“看看头顶这排悬吊玻璃瓶，简直像皇家军械库的解剖展柜。说真的，九号，你的战斗本能熟练得不像一团废液……倒像是某位剑术大师被强行抹掉署名后的肌肉记忆。”',
  },
  {
    id: 'corvus_10',
    speakerId: 'corvus',
    speakerNameZh: '蒸馏收藏官·科尔维斯',
    speakerTitleZh: '永恒锻炉圣所 · 灵液分馏台',
    portraitSlot: 1,
    accentHex: '#3CE682',
    priority: 85,
    triggerSummaryZh: '首次通关常规结局（开启 1 坩埚热阶）',
    bodyZh: '“你坐上了王座，然后呢？原初质差点把你的水银核烧成一块没有思想的白金疙瘩，我费了九牛二虎之力才把你从回流管里滤出来！想真正毁掉这口坩埚，光靠蛮力劈开帕拉塞尔苏斯是不够的。”',
  },
  {
    id: 'corvus_11',
    speakerId: 'corvus',
    speakerNameZh: '蒸馏收藏官·科尔维斯',
    speakerTitleZh: '永恒锻炉圣所 · 灵液分馏台',
    portraitSlot: 1,
    accentHex: '#3CE682',
    priority: 90,
    triggerSummaryZh: '收集到至少 1 枚真名封印时',
    bodyZh: '“慢着……压低声音！你从密室里带回来的那页羊皮纸，上面有至高炼金师亲笔签下的灵魂剥离式。老天，你不是实验室事故的副产物……你是他亲手切下来的‘痛觉’！”',
  },
  {
    id: 'corvus_12',
    speakerId: 'corvus',
    speakerNameZh: '蒸馏收藏官·科尔维斯',
    speakerTitleZh: '永恒锻炉圣所 · 万能溶剂共鸣',
    portraitSlot: 1,
    accentHex: '#38BDF8',
    priority: 100,
    triggerSummaryZh: '集齐全部 3 枚真名封印后',
    bodyZh: '“万能溶剂【阿尔卡赫斯特（Alkahest）】的配方齐了。科尔维斯一生只记录历史，从不押注赌徒——但今天，我把所有的灵液炉火都借给你。上去吧，把属于人类的眼泪和死亡，重新砸进那暴君的胸膛里！”',
  },

  // ================= NPC 2：断臂钟表匠·伊索尔德（11 段） =================
  {
    id: 'isolde_01',
    speakerId: 'isolde',
    speakerNameZh: '断臂钟表匠·伊索尔德',
    speakerTitleZh: '传奇大熔炉 · 淬火铁砧台',
    portraitSlot: 2,
    accentHex: '#FF5E2B',
    priority: 10,
    triggerSummaryZh: '首次进入大熔炉休整区',
    bodyZh: '“别盯着我的左肩膀看，小水银滴。这组黄铜擒纵轮每分钟跳六十下，比我以前那颗总爱替学徒求情的肉体心脏准时多了。把武器搁砧板上——要淬火还是重铸词条？”',
  },
  {
    id: 'isolde_02',
    speakerId: 'isolde',
    speakerNameZh: '断臂钟表匠·伊索尔德',
    speakerTitleZh: '传奇大熔炉 · 淬火铁砧台',
    portraitSlot: 2,
    accentHex: '#FF5E2B',
    priority: 45,
    triggerSummaryZh: '首次将大熔炉 + 级进度推过 50%',
    bodyZh: '“听见铁水咬进刀刃的嘶鸣了吗？帕拉塞尔苏斯以为只有血肉融合原初质才算升华，蠢货！真正的百炼精钢，从来不靠出卖灵魂来保持锋利。”',
  },
  {
    id: 'isolde_03',
    speakerId: 'isolde',
    speakerNameZh: '断臂钟表匠·伊索尔德',
    speakerTitleZh: '传奇大熔炉 · 淬火铁砧台',
    portraitSlot: 2,
    accentHex: '#FF5E2B',
    priority: 60,
    triggerSummaryZh: '大熔炉 + 级达成 100% 满额',
    bodyZh: '“成了！从今往后，只要是从尖塔箱子里翻出来的破铜烂铁，哪怕闭着眼摸，也带着我伊索尔德的炉温烙印。去给那些长满齿轮的杂碎放放血。”',
  },
  {
    id: 'isolde_04',
    speakerId: 'isolde',
    speakerNameZh: '断臂钟表匠·伊索尔德',
    speakerTitleZh: '传奇大熔炉 · 淬火铁砧台',
    portraitSlot: 2,
    accentHex: '#FF5E2B',
    priority: 35,
    triggerSummaryZh: '玩家手持重型武器（重刃/重锤/战戟）对话',
    bodyZh: '“哈，这才像话！那些花里胡哨的刺剑只配给贵族削苹果皮。记住我的话：面对举盾的黄铜卫兵，别跟他在那儿绣花，抡圆了直接连盾带骨头一块儿砸碎！”',
  },
  {
    id: 'isolde_05',
    speakerId: 'isolde',
    speakerNameZh: '断臂钟表匠·伊索尔德',
    speakerTitleZh: '传奇大熔炉 · 卢卡斯遗物',
    portraitSlot: 2,
    accentHex: '#FBBF24',
    priority: 55,
    triggerSummaryZh: '玩家手持发条连发重弩对话',
    bodyZh: '“这把连发重弩……是我小徒弟卢卡斯的出师作。大煅烧那天，执法队把他推进了骸骨堂的齿轮槽里。替我好好用它，每一根射出去的钢钉，都算他向尖塔讨回的工钱。”',
  },
  {
    id: 'isolde_06',
    speakerId: 'isolde',
    speakerNameZh: '断臂钟表匠·伊索尔德',
    speakerTitleZh: '传奇大熔炉 · 旧日往事',
    portraitSlot: 2,
    accentHex: '#FF5E2B',
    priority: 25,
    triggerSummaryZh: '谈及 Boss 1 典狱长萨尔弗',
    bodyZh: '“萨尔弗胸口那座大香炉，就是我二十年前亲手铆合的。那时候里面装的是安神迷迭香，用来缓解矿工的矽肺病……谁能想到有一天，他会把自己肋骨掰开，往里面填满活人烧剩的硫磺？”',
  },
  {
    id: 'isolde_07',
    speakerId: 'isolde',
    speakerNameZh: '断臂钟表匠·伊索尔德',
    speakerTitleZh: '星界熔炉前哨 · 磁暴边界',
    portraitSlot: 2,
    accentHex: '#FF5E2B',
    priority: 72,
    triggerSummaryZh: '首次抵达星界熔炉之巅前休整室',
    bodyZh: '“再往上就是星界熔炉了。风里全是沸腾水银的甜腥味。我这半边黄铜身子一靠近顶层就会被他的磁暴锁死，只能送你到这儿了，小家伙。”',
  },
  {
    id: 'isolde_08',
    speakerId: 'isolde',
    speakerNameZh: '断臂钟表匠·伊索尔德',
    speakerTitleZh: '传奇大熔炉 · 秘银精炼',
    portraitSlot: 2,
    accentHex: '#FF5E2B',
    priority: 78,
    triggerSummaryZh: '大熔炉 ++ 级达成 50% 以上',
    bodyZh: '“双倍精炼炉火已经吃透了秘银模具。你看我左手的齿轮是不是转得慢了些？每当你离塔顶近一步，套在我们这些半机械废人身上的发条诅咒就会松动一分。”',
  },
  {
    id: 'isolde_09',
    speakerId: 'isolde',
    speakerNameZh: '断臂钟表匠·伊索尔德',
    speakerTitleZh: '传奇大熔炉 · 残躯警示',
    portraitSlot: 2,
    accentHex: '#E11D48',
    priority: 82,
    triggerSummaryZh: '玩家处于残血（HP < 30%）进入铁匠铺',
    bodyZh: '“白瓷胸甲裂得跟蜘蛛网似的还能活着爬进来，你可真是个倔种。先去旁边把灵液瓶灌满再上路，我可不想刚打磨好的好刀白白便宜了暗渠里的老鼠。”',
  },
  {
    id: 'isolde_10',
    speakerId: 'isolde',
    speakerNameZh: '断臂钟表匠·伊索尔德',
    speakerTitleZh: '传奇大熔炉 · 高热阶备战',
    portraitSlot: 2,
    accentHex: '#FF5E2B',
    priority: 86,
    triggerSummaryZh: '开启 ≥ 2 坩埚热阶时',
    bodyZh: '“尖塔察觉到你的威胁了，空气里的矾酸浓度翻了一倍，连行尸走肉都长出了晶化硬壳。把词条洗出【紫火】或者【破冰】再来见他们，别省那点金币！”',
  },
  {
    id: 'isolde_11',
    speakerId: 'isolde',
    speakerNameZh: '断臂钟表匠·伊索尔德',
    speakerTitleZh: '传奇大熔炉 · 终局送别',
    portraitSlot: 2,
    accentHex: '#FBBF24',
    priority: 100,
    triggerSummaryZh: '真结局决战前最后一次锻造交互',
    bodyZh: '“我给你最后淬一次火，不收灵液。如果上面那个自称神明的老疯子真是你的另一半……替所有变成齿轮的工匠，狠狠敲响他的丧钟。”',
  },

  // ================= NPC 3：提灯告解修女·维斯帕（11 段） =================
  {
    id: 'vesper_01',
    speakerId: 'vesper',
    speakerNameZh: '提灯告解修女·维斯帕',
    speakerTitleZh: '矿渣蒸馏厂 · 铁栏暗龛',
    portraitSlot: 3,
    accentHex: '#FBBF24',
    priority: 20,
    triggerSummaryZh: '第一层矿渣蒸馏厂铁栏后初遇',
    bodyZh: '“嘘……轻点踩那些碎玻璃，无头的小朝圣者。我的眼睛在大煅烧第一道白光亮起时就瞎了，可我依然能‘看’见你——在一整座发臭的锈铁塔里，只有你的胸口泛着干净的月光。”',
  },
  {
    id: 'vesper_02',
    speakerId: 'vesper',
    speakerNameZh: '提灯告解修女·维斯帕',
    speakerTitleZh: '矿渣蒸馏厂 · 铁栏暗龛',
    portraitSlot: 3,
    accentHex: '#FBBF24',
    priority: 18,
    triggerSummaryZh: '第一层第二次偶遇',
    bodyZh: '“他们管这儿叫‘蒸馏厂’。多体面的词儿呀，把贫民窟的骨髓熬成点亮上城区路灯的灯油。如果你在前面看到背着烧瓶的工人，给他们个痛快吧，他们的意识早就被高温煮熟了。”',
  },
  {
    id: 'vesper_03',
    speakerId: 'vesper',
    speakerNameZh: '提灯告解修女·维斯帕',
    speakerTitleZh: '矾酸暗渠 · 拱桥避雨处',
    portraitSlot: 3,
    accentHex: '#3CE682',
    priority: 30,
    triggerSummaryZh: '第二层矾酸暗渠偶遇 #1',
    bodyZh: '“滴答、滴答……听见头顶漏下来的绿矾酸雨了吗？贵族们在塔顶喝着长生酒，却把腐烂的罪孽全排进了下水道。小心那些鼓胀的绿囊虫，离它们死掉的地方远一点。”',
  },
  {
    id: 'vesper_04',
    speakerId: 'vesper',
    speakerNameZh: '提灯告解修女·维斯帕',
    speakerTitleZh: '矾酸暗渠 · 毛细银管旁',
    portraitSlot: 3,
    accentHex: '#38BDF8',
    priority: 48,
    triggerSummaryZh: '第二层矾酸暗渠偶遇 #2（已获水银导管）',
    bodyZh: '“你能钻进毛细银管里了？真奇妙……就像眼泪倒流回眼眶一样。在这层最深处的密封铁棺后面，藏着至高炼金师年轻时的手稿，他那时候居然还会因为杀死一只白鼠而手抖呢。”',
  },
  {
    id: 'vesper_05',
    speakerId: 'vesper',
    speakerNameZh: '提灯告解修女·维斯帕',
    speakerTitleZh: '发条骸骨堂 · 告解长椅',
    portraitSlot: 3,
    accentHex: '#FBBF24',
    priority: 40,
    triggerSummaryZh: '第三层发条骸骨堂偶遇 #1',
    bodyZh: '“欢迎来到发条骸骨堂。听听这神圣的滴答声——主教们认为肉体会软弱、会背叛，只有把耻骨和肋骨换成黄铜齿轮，才能永不疲倦地赞美原初质。真是群连做梦都要卡着秒表的可怜虫。”',
  },
  {
    id: 'vesper_06',
    speakerId: 'vesper',
    speakerNameZh: '提灯告解修女·维斯帕',
    speakerTitleZh: '发条骸骨堂 · 告解长椅',
    portraitSlot: 3,
    accentHex: '#FBBF24',
    priority: 38,
    triggerSummaryZh: '第三层发条骸骨堂偶遇 #2',
    bodyZh: '“遇到披着红天鹅绒的骸骨司铎时，千万别对着套了水银光环的卫兵硬砍。先去摘掉诵经人的脑袋，乌龟壳自然就碎了。”',
  },
  {
    id: 'vesper_07',
    speakerId: 'vesper',
    speakerNameZh: '提灯告解修女·维斯帕',
    speakerTitleZh: '诅咒黑雾感知',
    portraitSlot: 3,
    accentHex: '#A855F7',
    priority: 88,
    triggerSummaryZh: '玩家携带诅咒状态（受诅咒宝箱未解咒）偶遇',
    bodyZh: '“哎呀，你身上缠着多么贪婪的黑雾……碰一下就会粉身碎骨的诅咒。为了多拿一卷羊皮纸把命悬在刀尖上，看来你比我想象中更像个真正的赌徒。”',
  },
  {
    id: 'vesper_08',
    speakerId: 'vesper',
    speakerNameZh: '提灯告解修女·维斯帕',
    speakerTitleZh: '星界熔炉之巅 · 浮空断廊',
    portraitSlot: 3,
    accentHex: '#E8EFF5',
    priority: 58,
    triggerSummaryZh: '第四层星界熔炉之巅偶遇 #1',
    bodyZh: '“好暖和的风……还是说，这是整座城市在发高烧？我的提灯快要亮不起来了，小水银滴。再往上走，连重力都会向那颗人造太阳低头。”',
  },
  {
    id: 'vesper_09',
    speakerId: 'vesper',
    speakerNameZh: '提灯告解修女·维斯帕',
    speakerTitleZh: '星界熔炉之巅 · 浮空断廊',
    portraitSlot: 3,
    accentHex: '#E8EFF5',
    priority: 55,
    triggerSummaryZh: '第四层星界熔炉之巅偶遇 #2',
    bodyZh: '“你知道为什么只有你能一次次顺着银管流回圣所，而其他八个实验体全都变成了黑灰吗？因为水银只认自己的源头。你越靠近王座，你的心跳是不是就越吵闹？”',
  },
  {
    id: 'vesper_10',
    speakerId: 'vesper',
    speakerNameZh: '提灯告解修女·维斯帕',
    speakerTitleZh: '二周目轮回走廊',
    portraitSlot: 3,
    accentHex: '#FBBF24',
    priority: 85,
    triggerSummaryZh: '常规结局通关后二周目偶遇',
    bodyZh: '“你昨天杀死了恶龙，然后坐在恶龙的金币堆上睡了一觉，对不对？别难过，没有解药的弑神，不过是换一副更结实的锁链罢了。去密室里找齐那三个被抹掉的名字吧。”',
  },
  {
    id: 'vesper_11',
    speakerId: 'vesper',
    speakerNameZh: '提灯告解修女·维斯帕',
    speakerTitleZh: '星界王座长廊 · 终局祝福',
    portraitSlot: 3,
    accentHex: '#38BDF8',
    priority: 100,
    triggerSummaryZh: '集齐 3 枚真名封印后在第四层最终走廊偶遇',
    bodyZh: '“提灯里的火苗终于安静了。去吧，阿兰比克——他留下了神性与永恒，却唯独把‘慈悲’丢给了你。现在让他见识见识，慈悲握起刀来究竟有多疼。”',
  },
] as const;

export interface LoreRoomEntrySpec {
  readonly id: string;
  readonly biomeId: BiomeId;
  readonly titleZh: string;
  readonly decorDescZh: string;
  readonly bodyZh: string;
  readonly accentHex: string;
  readonly requiredRune: RuneId | null;
  readonly grantsSealFlag: TrueEndingSealFlag | null;
  readonly firstReadIchorReward: 15;
}

/** 10 个环境叙事剧情房（Lore Rooms）交互调查全表（docs/03 §2.3，零删减） */
export const LORE_ROOMS_CATALOG: Readonly<Record<string, LoreRoomEntrySpec>> = {
  lore_01_quarantine_notice: {
    id: 'lore_01_quarantine_notice',
    biomeId: 'biome_01_slag_retort',
    titleZh: '【染血的司炉工排班板】',
    decorDescZh: '钉死铁板的矿工宿舍，墙面残留焦黑手印与一盏摇曳橙色油灯',
    bodyZh: '“《第七十三号防疫令》：凡咳嗽咳出银色金属颗粒者，一律视作盗窃公家水银矿产论处，扣除当月口粮并调入三号高温曲颈瓶车间内侧清渣。无需发放防毒面罩。”',
    accentHex: '#FF5E2B',
    requiredRune: null,
    grantsSealFlag: null,
    firstReadIchorReward: 15,
  },
  lore_02_discarded_vessels: {
    id: 'lore_02_discarded_vessels',
    biomeId: 'biome_01_slag_retort',
    titleZh: '【八号实验体废弃记录】',
    decorDescZh: '堆满八具碎裂白瓷人偶残骸的废料井，编号 01 至 08 清晰可见',
    bodyZh: '“Vessel-01 至 08 均在注入原初质三分钟内发生剧烈排异自燃。唯独昨夜从至高大人私人手术室送来的 09 号银色废液，在白瓷胸腔内呈现出诡异的平静——它甚至试图伸手替研究员擦去额头的汗水。建议立即销毁。”',
    accentHex: '#38BDF8',
    requiredRune: null,
    grantsSealFlag: null,
    firstReadIchorReward: 15,
  },
  lore_03_sluice_petition: {
    id: 'lore_03_sluice_petition',
    biomeId: 'biome_02_vitriol_sewers',
    titleZh: '【下水道巡检员的绝笔信】',
    decorDescZh: '半淹没在绿色荧光酸水中的市政阀门站，桌上放着密封防水铜筒',
    bodyZh: '“致市政厅：上层贵族每天倾倒的‘返老还童药渣’正在溶解百年铜管！昨天老托马斯掉进了三号蓄水池，他没有淹死——他在爬上来的时候，和池壁上的黄铜水表长在了一起，现在还在冲我们眨眼！”',
    accentHex: '#3CE682',
    requiredRune: null,
    grantsSealFlag: null,
    firstReadIchorReward: 15,
  },
  lore_04_seal_conduit_lab: {
    id: 'lore_04_seal_conduit_lab',
    biomeId: 'biome_02_vitriol_sewers',
    titleZh: '【第一真名封印：剥离手记】',
    decorDescZh: '只有通过毛细银管才能潜入的隐秘地下解剖室，中央立着碎裂的 9 号曲颈瓶',
    bodyZh: '“大煅烧前夜，帕拉塞尔苏斯亲笔：每当想到明日启动熔炉将有十万底层市民化作矿渣，我的右手便颤抖得无法画完星阵。软弱是升华之癌。今夜我将以秘银柳叶刀剖开自我魂魄，将名为‘悲悯’的杂质封入九号瓶沉入暗渠。明日之后，世间唯余纯粹真理。”',
    accentHex: '#38BDF8',
    requiredRune: 'rune_mercury_conduit',
    grantsSealFlag: 'flag_seal_conduit',
    firstReadIchorReward: 15,
  },
  lore_05_sulfur_chapel: {
    id: 'lore_05_sulfur_chapel',
    biomeId: 'biome_02_vitriol_sewers',
    titleZh: '【萨尔弗的熏香配方簿】',
    decorDescZh: '摆满空香炉与儿童木鞋的小型祷告室，墙上挂着司炉长昔日勋章',
    bodyZh: '“五月十二日：小玛尔塔的肺病又重了，迷迭香不够，我偷偷兑入了两滴稀释水银蒸汽，她终于睡了个好觉。六月四日：大家都长出了好漂亮的黄铜鳞片，只要把大家都放进我的大香炉里保暖，就再也没人会喊冷了。”',
    accentHex: '#FBBF24',
    requiredRune: null,
    grantsSealFlag: null,
    firstReadIchorReward: 15,
  },
  lore_06_clockwork_vow: {
    id: 'lore_06_clockwork_vow',
    biomeId: 'biome_03_clockwork_ossuary',
    titleZh: '【机械苦修士入会誓词】',
    decorDescZh: '数十具跪姿骸骨整齐排列在巨大齿轮前，脊椎全部替换为发条弹簧',
    bodyZh: '“血肉腐败，唯齿轮永恒；心跳无序，唯擒纵精准。吾自愿献出脆弱之脏腑，换取发条圣堂一万两千转之虔诚。若吾发条松弛，愿同修以扳手拧断吾颈。”',
    accentHex: '#38BDF8',
    requiredRune: null,
    grantsSealFlag: null,
    firstReadIchorReward: 15,
  },
  lore_07_seal_ram_crypt: {
    id: 'lore_07_seal_ram_crypt',
    biomeId: 'biome_03_clockwork_ossuary',
    titleZh: '【第二真名封印：痛觉标本】',
    decorDescZh: '轰碎祭坛红色阵纹地板后坠入的冰冷停尸密室，冰柜内封存着银色神经束',
    bodyZh: '“封存于液氮水银中的一束剥离中枢神经。标签写道：‘没有痛觉，躯体在被真理之火焚毁时便不会逃跑。谨将此束愚蠢的本能永镇地底，愿新人类不知疼痛为何物。’ 当你触碰玻璃罐时，水银核传来一阵久违的针刺感。”',
    accentHex: '#FF5E2B',
    requiredRune: 'rune_calcined_ram',
    grantsSealFlag: 'flag_seal_ram',
    firstReadIchorReward: 15,
  },
  lore_08_lucas_workbench: {
    id: 'lore_08_lucas_workbench',
    biomeId: 'biome_03_clockwork_ossuary',
    titleZh: '【学徒卢卡斯的草稿背面】',
    decorDescZh: '散落着连发重弩图纸与半截断裂铁匠围裙的钟楼夹层工作台',
    bodyZh: '“告诉伊索尔德师父，我把重弩的止退簧改好了，后坐力再也不会震伤她的断臂。执法队的靴子声已经到楼梯口了——别替我报仇，师父，只要别让我的手艺变成他们的刑具。”',
    accentHex: '#FBBF24',
    requiredRune: null,
    grantsSealFlag: null,
    firstReadIchorReward: 15,
  },
  lore_09_noble_banquet: {
    id: 'lore_09_noble_banquet',
    biomeId: 'biome_04_crucible_apex',
    titleZh: '【凝固的庆功宴祝酒词】',
    decorDescZh: '悬浮在云海之上的奢华露台餐厅，宾客全部凝固成姿态优雅的纯白石膏黄金雕像',
    bodyZh: '“高脚杯里盛着沸腾的白色水银。主宾席上的公爵夫人依然保持着举杯微笑的姿势，只是她的嘴唇已与纯金酒杯彻底熔焊为一体。餐巾上绣着：‘敬永恒不朽的第一夜。’”',
    accentHex: '#E11D48',
    requiredRune: null,
    grantsSealFlag: null,
    firstReadIchorReward: 15,
  },
  lore_10_seal_claws_astrolabe: {
    id: 'lore_10_seal_claws_astrolabe',
    biomeId: 'biome_04_crucible_apex',
    titleZh: '【第三真名封印：万能溶剂阿尔卡赫斯特】',
    decorDescZh: '沿近乎垂直的折断星盘外壁一路蹬墙攀至云端极顶的秘密观星台',
    bodyZh: '“被帕拉塞尔苏斯用铁链锁在最高处的禁忌逆向方程——‘凡由水银凝结之不朽，唯以原主被弃之慈悲为引，方可逆向溶解一切钙化王权。’ 你的水银核与星盘凹槽严丝合缝地共鸣起来。”',
    accentHex: '#FBBF24',
    requiredRune: 'rune_magnetic_claws',
    grantsSealFlag: 'flag_seal_claws',
    firstReadIchorReward: 15,
  },
} as const;

/** 12 把武器暗黑风味铭文（docs/03 §1.4.3） */
export const WEAPON_FLAVOR_INSCRIPTIONS: Readonly<Record<WeaponId, string>> = {
  wpn_rust_scalpel: '“尖塔医学院的第一课：先切开病人的声带，再切开病灶。”',
  wpn_quicksilver_rapier: '“剑脊中空灌满活态汞，挥刺时重心永远比你的杀意快半寸。”',
  wpn_cinnabar_twinblades: '“朱砂本是剧毒之血，双刀交错之声恰似矿工临终的喘息。”',
  wpn_athanor_cleaver: '“它原本是用来斩断冷却失控的黄铜蒸汽管的，后来发现斩断叛乱者同样顺手。”',
  wpn_crucible_maul: '“锤头里封存着一炉尚未凝固的铁水，砸在冰雕上时听起来像极了庆典礼炮。”',
  wpn_pendulum_halberd: '“从大圣堂报丧钟上拆下的摆锤，每一击都在替亡者校准吉时。”',
  wpn_alembic_bow: '“弓弦由硬化羊肠与钨丝绞合，离目标越远，玻璃箭簇旋转积蓄的离心力越致命。”',
  wpn_clockwork_repeater: '“扣动一次扳机，发条盒便替你省去三次忏悔的工夫。”',
  wpn_vitriol_thrower: '“千万别摇晃——好吧，既然你是扔向别人，请使劲摇晃。”',
  wpn_voltaic_arc_staff: '“引天顶雷暴入凡铁，凡流淌液体之处，皆为刑场。”',
  wpn_slag_buckler: '“最卑贱的炉底废渣，却挡住了贵族老爷们最锋利的刺剑。”',
  wpn_mirror_aegis: '“凝视盾面之人，终将被自己的杀意原封不动地射穿眉心。”',
} as const;

/** 双多阶段 Boss 精确数值与帧时间轴参数（docs/03 §4.2 ~ §4.3） */
export const BOSS_COMBAT_SPECS = {
  SULFUR: {
    id: 'boss_01_furnace_warden' as const,
    nameZh: '黄铜香炉典狱长·萨尔弗',
    nameEn: 'ARCH-WARDEN SULFUR',
    arenaTitleZh: '大煅烧三号刑炉室',
    baseHp: 3400,
    phase2Ratio: 0.55,
    transitionRoarMs: 1800,
    arenaWidthTiles: 44, // 704 px
    arenaHeightTiles: 30,
    m1Stage1WindupMs: 520,
    m1Stage1ActiveMs: 67,
    m1Stage1RecoverMs: 250,
    m1Stage2WindupMs: 450,
    m1Stage2ActiveMs: 83,
    m1Stage2RecoverMs: 600,
    m2HookWindupMs: 580,
    m2HookActiveMs: 100,
    m2HookRecoverMs: 520,
    m2HookRangePx: 280,
    m3SmokeWindupMs: 650,
    m3SmokeActiveMs: 400,
    m3SmokeRecoverMs: 450,
    m3SmokeRadiusPx: 120,
    m4LeapMs: 400,
    m4SlamWindupMs: 350,
    m4SlamActiveMs: 83,
    m4SlamRecoverMs: 700,
    m5GrateWarnMs: 900,
    m5GrateEruptMs: 1400,
    m6WhirlWindupMs: 700,
    m6WhirlSpinMs: 1600,
    m6WhirlPantMs: 1200,
    m6ParryStunMs: 2200,
  },
  PARACELSUS: {
    id: 'boss_02_grand_alchemist' as const,
    nameZh: '钙化至高炼金师·帕拉塞尔苏斯',
    nameEn: 'PARACELSUS PRIME',
    p3NameZh: '剥离之主·帕拉塞尔苏斯（星界大溶解）',
    p3NameEn: 'PARACELSUS UNBOUND · THE GREAT ALKAHEST',
    arenaTitleZh: '衔尾蛇星界坩埚王座',
    baseHpP1P2: 8200,
    p1PrismShieldHp: 600,
    phase2Ratio: 0.6,
    baseHpP3: 3800,
    transitionMs: 1600,
    arenaWidthTiles: 52, // 832 px
    arenaHeightTiles: 30,
    a1ChargeMs: 480,
    a1VolleyIntervalMs: 160,
    a2Slash1WindupMs: 460,
    a2Slash2WindupMs: 420,
    a2DelayedRedMs: 680,
    a3LaserAimMs: 850,
    a3LaserSweepMs: 1500,
    a4BlackholePullMs: 2200,
    a4PullSpeedPxS: 110,
    a4BlastRadiusPx: 160,
    a5MatrixWarnMs: 1000,
    a5MatrixBurnMs: 3000,
    a6MirrorThrustWindupMs: 320,
    a6MirrorThrustStepMs: 140,
    a7BladeWaveIntervalMs: 550,
    a8DesperationRatio: 0.15,
    a8CalcinationChargeMs: 2400,
  },
} as const;

export interface DialogueBannerSnapshot {
  readonly id: string;
  readonly sourceKind: 'PROLOGUE' | 'NPC' | 'LORE' | 'ENDING';
  readonly speakerNameZh: string;
  readonly speakerTitleZh: string;
  readonly bodyZh: string;
  readonly portraitSlot: PortraitSlotIndex;
  readonly accentHex: string;
  readonly mode: DialogueDisplayMode;
  readonly badgeChipZh: string | null;
  readonly canAdvance: boolean;
}

export interface BossHudSnapshot {
  readonly bossId: BossId;
  readonly nameZh: string;
  readonly nameEn: string;
  readonly arenaTitleZh: string;
  readonly phase: 1 | 2 | 3;
  readonly hp: number;
  readonly maxHp: number;
  readonly prismShieldHp: number;
  readonly maxPrismShieldHp: number;
  readonly phaseNotchRatio: number | null;
  readonly statusBadge: string;
  readonly isTransitioning: boolean;
  readonly activeMoveLabelZh: string;
  readonly endingState: EndingOutcomeId;
  readonly collectedSeals: readonly TrueEndingSealFlag[];
  readonly gratePhase?: string;
  readonly quicksilverSeaActive?: boolean;
}
