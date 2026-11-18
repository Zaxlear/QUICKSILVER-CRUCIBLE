import { describe, expect, it } from 'vitest';
import { ActiveSkillRuntime } from '../../src/combat/ActiveSkillRuntime';
import { AffixSynergyEngine } from '../../src/combat/AffixSynergyEngine';
import type { CombatTargetView } from '../../src/combat/CombatTypes';
import { calculateFinalHitDamage } from '../../src/combat/DamageCalculator';
import { MutationProcessor } from '../../src/combat/MutationProcessor';
import { ProjectilePool } from '../../src/combat/ProjectilePool';
import { StatusEffectMachine } from '../../src/combat/StatusEffectMachine';
import {
  computeHemorrhageBurstDamage,
  computeThermalShockBurstDamage,
  computeVitriolDetonationDamage,
} from '../../src/combat/StatusReactionMath';
import { FIXED_STEP_SEC } from '../../src/core/ClockController';
import { DeterministicRng } from '../../src/core/DeterministicRng';
import { TypedEventBus } from '../../src/core/EventBus';
import { AFFIX_CATALOG } from '../../src/data/affixes.data';
import { ALL_MUTATION_IDS, MUTATION_MATH } from '../../src/data/mutations.data';
import { ALL_SKILL_IDS } from '../../src/data/skills.data';
import { ALL_WEAPON_IDS } from '../../src/data/weapons.data';
import { PlayerInventory } from '../../src/entities/player/PlayerInventory';

function makeTarget(id: string, x: number, inConductiveHazard = false): CombatTargetView {
  return {
    id,
    x,
    y: 0,
    width: 24,
    height: 40,
    facing: -1,
    isAlive: true,
    hasFrontShield: false,
    isStunned: false,
    inConductiveHazard,
  };
}

describe('Milestone 6 — 6 Elemental Reactions, 20 Affixes, 12/12 Weapons, 6 Skills & 12 Mutations', () => {
  it('verifies roster completeness: 12 weapons, 6 active skills, 12 mutations, and 20 affixes', () => {
    expect(ALL_WEAPON_IDS).toHaveLength(12);
    expect(ALL_SKILL_IDS).toHaveLength(6);
    expect(ALL_MUTATION_IDS).toHaveLength(12);
    expect(AFFIX_CATALOG).toHaveLength(20);
  });

  it('verifies all 6 Cross-Element Chemical Reactions with exact multipliers & radii', () => {
    const bus = new TypedEventBus();
    const reactions: string[] = [];
    bus.on('status:reaction_triggered', (ev) => reactions.push(ev.reactionId));

    const sm = new StatusEffectMachine(bus);
    const t0 = makeTarget('mob_0', 100);
    const tNear = makeTarget('mob_near', 250); // dist = 150px (> 96px base, <= 192px surge!)
    const tFar = makeTarget('mob_far', 320);   // dist = 220px (> 192px)

    // 1. 油 + 火 -> Violet Napalm（双倍伤紫火，持续时间刷新至 6.0s）
    sm.apply('mob_0', 'ignited', 2, 1.0);
    const normalBurnRes = sm.stepFixed(0.34, [t0]);
    const normalBurnTick = normalBurnRes.damageEvents[0]!.amount;
    expect(normalBurnTick).toBe(16); // 8 * 2 stacks * 1.0

    sm.apply('mob_0', 'oiled', 1, 1.0);
    expect(sm.isVioletNapalm('mob_0')).toBe(true);
    expect(sm.getRecord('mob_0')!.slots.ignited.remainingSec).toBeCloseTo(6.0, 1);
    const violetBurnRes = sm.stepFixed(0.34, [t0]);
    expect(violetBurnRes.damageEvents[0]!.amount).toBe(normalBurnTick * 2); // 精确 2.0× 双倍伤！
    expect(reactions).toContain('VIOLET_NAPALM');

    // 1-B. 油 + 冰 -> 延长冰冻 +1.5s
    sm.clearTarget('mob_0');
    sm.apply('mob_0', 'oiled', 1, 1.0);
    sm.apply('mob_0', 'frozen', 1, 1.0);
    expect(sm.getRecord('mob_0')!.slots.frozen.remainingSec).toBeCloseTo(3.2 + 1.5, 2);

    // 2. 火 + 冰 -> Thermal Shock（解除冰冻并瞬间爆发 180% 蒸汽震波伤害）
    sm.clearTarget('mob_0');
    sm.apply('mob_0', 'frozen', 1, 1.0);
    const expectedThermal = computeThermalShockBurstDamage(sm.getRecord('mob_0')!, 2, 1.0);
    sm.apply('mob_0', 'ignited', 2, 1.0);
    expect(sm.has('mob_0', 'frozen')).toBe(false);
    const thermalStep = sm.stepFixed(FIXED_STEP_SEC, [t0]);
    expect(thermalStep.damageEvents.some((e) => e.reactionId === 'THERMAL_SHOCK' && e.amount === expectedThermal)).toBe(true);

    // 3. 5 层流血 -> Hemorrhage Burst（叠满第 5 层瞬间清空层数，引爆 135% 剩余总流血伤）
    sm.clearTarget('mob_0');
    sm.apply('mob_0', 'bleeding', 4, 1.0);
    expect(sm.getStacks('mob_0', 'bleeding')).toBe(4);
    const simRec = structuredClone(sm.getRecord('mob_0')!);
    simRec.slots.bleeding.stacks = 5;
    const expectedHemo = computeHemorrhageBurstDamage(simRec);
    sm.apply('mob_0', 'bleeding', 1, 1.0);
    expect(sm.getStacks('mob_0', 'bleeding')).toBe(0);
    const hemoStep = sm.stepFixed(FIXED_STEP_SEC, [t0]);
    expect(hemoStep.damageEvents.some((e) => e.reactionId === 'HEMORRHAGE_BURST' && e.amount === expectedHemo)).toBe(true);

    // 4. 重击破冰 -> Brittle Shatter（破冰一击获得额外 +40% 独立碎冰乘区，破冰后残留 3.0s 寒霜减速）
    sm.clearTarget('mob_0');
    sm.apply('mob_0', 'frozen', 1, 1.0);
    const shatterMod = sm.consumeDirectHitModifiers('mob_0', 100, -20);
    expect(shatterMod.shatteredIce).toBe(true);
    expect(shatterMod.brittleMultiplier).toBeCloseTo(1.4, 5);
    expect(sm.has('mob_0', 'frozen')).toBe(false);
    expect(sm.getRecord('mob_0')!.brittleResidualSlowSec).toBeCloseTo(3.0, 2);

    // 5. 潮湿/油/毒 + 电 -> Electrolytic Surge（传导半径翻倍 96px -> 192px 且电击跳伤必定暴击！）
    sm.clearTarget('mob_0');
    sm.apply('mob_0', 'electrified', 2, 1.0);
    // 无导电时：距离 150px (>96px) 的 mob_near 不会被传导命中
    const dryShock = sm.stepFixed(0.51, [t0, tNear, tFar]);
    expect(dryShock.shockArcs).toHaveLength(0);
    expect(dryShock.damageEvents[0]!.isCrit).toBe(false);

    // 附加 Oiled（或处于酸水池）：激活电解超导，传导半径翻倍至 192px 命中 150px 的 mob_near 且必暴！
    sm.apply('mob_0', 'oiled', 1, 1.0);
    const surgeShock = sm.stepFixed(0.51, [t0, tNear, tFar]);
    expect(surgeShock.shockArcs).toHaveLength(1);
    expect(surgeShock.shockArcs[0]!.isSurgeCrit).toBe(true);
    expect(surgeShock.damageEvents.every((e) => e.isCrit)).toBe(true);

    // 6. 毒(>=3层) + 紫火 -> Vitriol Detonation（消耗毒层触发 104px 剧毒烈焰爆炸）+ 满 8 层毒蚀 +24% 易伤
    sm.clearTarget('mob_0');
    sm.apply('mob_0', 'poisoned', 8, 1.0);
    expect(sm.consumeDirectHitModifiers('mob_0', 100, -20).poisonVulnerabilityMultiplier).toBeCloseTo(1.24, 5);

    const expectedDet = computeVitriolDetonationDamage(8, 1.5);
    sm.apply('mob_0', 'oiled', 1, 1.5);
    sm.apply('mob_0', 'ignited', 1, 1.5); // 挂油点火生成紫火，立即引爆 8 层矾毒！
    expect(sm.getStacks('mob_0', 'poisoned')).toBe(0);
    const detStep = sm.stepFixed(FIXED_STEP_SEC, [t0]);
    const detEv = detStep.damageEvents.find((e) => e.reactionId === 'VITRIOL_DETONATION');
    expect(detEv).toBeDefined();
    expect(detEv!.amount).toBe(expectedDet);
    expect(detEv!.aoeRadiusPx).toBe(104);
  });

  it('verifies all 20 Affixes: conditional additive pool, Glass Crucible 2x product, and event-bus triggers', () => {
    const bus = new TypedEventBus();
    const sm = new StatusEffectMachine(bus);
    const targets = [makeTarget('t_main', 100), makeTarget('t_ally', 170)];

    let healedRatio = 0;
    let breachBoltDmg = 0;
    const spawnedZones: string[] = [];
    let aoeBlastDmg = 0;

    const engine = new AffixSynergyEngine(
      sm,
      {
        getTargets: () => targets,
        onHealPlayerRatio: (r) => { healedRatio += r; },
        onAstralBreachLightning: (_id, _x, _y, dmg) => { breachBoltDmg += dmg; },
        onSpawnHazardZone: (kind) => { spawnedZones.push(kind); },
        onAreaDirectDamage: (_x, _y, _rad, dmg) => { aoeBlastDmg += dmg; },
      },
      bus
    );
    engine.mount();

    // 验证 #01~#07 条件增伤与 #19 双倍伤乘区：
    sm.apply('t_main', 'bleeding', 1);
    expect(engine.computeHitAffixMultiplier(['afx_dmg_on_bleed'], 't_main')).toBeCloseTo(1.6, 4);
    sm.apply('t_main', 'poisoned', 1);
    expect(engine.computeHitAffixMultiplier(['afx_dmg_on_poison'], 't_main')).toBeCloseTo(1.8, 4);
    sm.apply('t_main', 'ignited', 1);
    expect(engine.computeHitAffixMultiplier(['afx_dmg_on_burn'], 't_main')).toBeCloseTo(1.4, 4);
    sm.apply('t_main', 'oiled', 1); // -> Violet Napalm
    expect(engine.computeHitAffixMultiplier(['afx_dmg_on_oil_burn'], 't_main')).toBeCloseTo(2.0, 4);

    sm.clearTarget('t_main');
    sm.apply('t_main', 'frozen', 1);
    expect(engine.computeHitAffixMultiplier(['afx_dmg_on_frozen'], 't_main')).toBeCloseTo(2.75, 4);
    sm.apply('t_main', 'electrified', 1);
    expect(engine.computeHitAffixMultiplier(['afx_dmg_on_shock'], 't_main')).toBeCloseTo(1.5, 4);
    expect(engine.computeHitAffixMultiplier(['afx_dmg_on_stun_root'], 't_main', true)).toBeCloseTo(1.7, 4);

    // 复合加算池 + #19 afx_glass_crucible 独立 2.0× 乘区：(1 + 0.50 + 0.70) * 2.0 = 4.40×
    expect(
      engine.computeHitAffixMultiplier(
        ['afx_dmg_on_shock', 'afx_dmg_on_stun_root', 'afx_glass_crucible'],
        't_main',
        true
      )
    ).toBeCloseTo(4.4, 4);

    // 验证 #18 + #19 承受伤害惩罚：1 + 1.0 + 1.0 = 3.0×（单件为 2.0×）
    expect(AffixSynergyEngine.computeIncomingDamagePenaltyMultiplier(['afx_glass_crucible'])).toBe(2.0);
    expect(AffixSynergyEngine.computeIncomingDamagePenaltyMultiplier(['afx_leech_elite_hit'])).toBe(2.0);

    // 验证 #08 涂油 + #09 暴击点火 + #18 暴击吸血 + #20 破盾星界落雷
    sm.clearTarget('t_main');
    bus.emit('combat:hit_landed', {
      attackerId: 'player_vessel_09',
      targetId: 't_main',
      damage: 100,
      isCrit: true,
      worldX: 100,
      worldY: -20,
      affixIds: ['afx_coat_blade_oil', 'afx_ignite_on_crit', 'afx_leech_elite_hit', 'afx_breach_shockwave'],
      attackerStatScale: 1.0,
      baseWeaponDamage: 100,
      triggeredBreachStun: true,
    });
    expect(sm.isVioletNapalm('t_main')).toBe(true); // #08 + #09 自动完成挂油点火合成紫火！
    expect(healedRatio).toBeCloseTo(0.01, 5); // #18 暴击回血 1%
    expect(breachBoltDmg).toBe(85); // #20 破盾降下 85% 基础伤落雷
    expect(sm.has('t_main', 'electrified')).toBe(true);

    // 验证 #10 击杀传染（112px 传染流血/矾毒）与 #12 击杀寒霜新星（80px 冰冻 2.0s）
    sm.apply('t_main', 'bleeding', 3);
    sm.apply('t_main', 'poisoned', 2);
    bus.emit('combat:enemy_killed', {
      enemyId: 't_main',
      archetypeId: 'SLAG_HUSK',
      worldX: 100,
      worldY: -20,
      killerAffixIds: ['afx_bleed_spread_kill', 'afx_freeze_blast_kill'],
    });
    expect(sm.getStacks('t_ally', 'bleeding')).toBe(3); // 70px <= 112px 传染成功
    expect(sm.getStacks('t_ally', 'poisoned')).toBe(2);
    expect(sm.has('t_ally', 'frozen')).toBe(true); // 70px <= 80px 冰冻成功

    // 验证 #13 翻滚感电、#14 翻滚紫火径、#16 盾反毒雾、#11 技能毒云与 #17 炮台自爆
    sm.clearTarget('t_ally');
    bus.emit('combat:dodge_evaded', {
      entityId: 'player_vessel_09',
      worldX: 165,
      worldY: 0,
      activeAffixIds: ['afx_shock_on_dodge', 'afx_oil_fire_trail'],
    });
    expect(sm.getStacks('t_ally', 'electrified')).toBe(2);
    expect(spawnedZones).toContain('VIOLET_NAPALM_TRAIL');

    bus.emit('combat:parry_succeeded', {
      defenderId: 'player_vessel_09',
      sourceId: 't_ally',
      worldX: 160,
      worldY: -18,
      shieldAffixIds: ['afx_shield_parry_poison'],
    });
    expect(sm.getStacks('t_ally', 'poisoned')).toBe(4);

    bus.emit('combat:skill_deployed', {
      skillId: 'skl_tesla_coil_turret',
      worldX: 150,
      worldY: 0,
      affixIds: ['afx_toxic_cloud_hit'],
      statScale: 1.0,
    });
    expect(spawnedZones).toContain('TOXIC_MIST_CLOUD');

    aoeBlastDmg = 0;
    bus.emit('combat:skill_expired', {
      skillId: 'skl_tesla_coil_turret',
      worldX: 150,
      worldY: -16,
      affixIds: ['afx_grenade_voltaic_net'],
      statScale: 1.0,
      baseDamage: 50,
    });
    expect(aoeBlastDmg).toBe(60); // 120% * 50

    // 验证 #15 穿透首目标与 S 级保底稀有 ★ 词条互斥抽签
    const inv = new PlayerInventory();
    const rng = new DeterministicRng(2026);
    for (let i = 0; i < 25; i++) {
      const sWpn = inv.rollWeaponInstance(rng, 'wpn_crucible_maul', 'IV', 'S');
      expect(sWpn.affixIds.length).toBeGreaterThanOrEqual(3);
      const hasStar = sWpn.affixIds.some((id) => AFFIX_CATALOG.find((a) => a.id === id)?.rarity === 'RARE');
      expect(hasStar).toBe(true);
    }

    engine.unmount();
  });

  it('verifies all 6 new Milestone 6 weapons including Mirror Aegis 3 homing prism beams', () => {
    const baseStats = { rubedo: 1, citrinitas: 1, albedo: 1 } as const;
    const baseCrit = {
      attackerX: 0,
      targetX: 40,
      targetFacing: -1 as const,
      rapierCritWindowMs: 0,
      comboIndex: 0,
      cleaverRhythmPrimed: false,
      distancePx: 40,
      targetStuckArrows: 0,
      inConductiveHazard: false,
      chainBounceIndex: 0,
    };

    // #03 辰砂双刃：第 3 段 (comboIndex=2) 1.65× 小暴击，第 5 段 (comboIndex=4) 2.40× 大暴击
    const twinS1 = calculateFinalHitDamage({
      weaponId: 'wpn_cinnabar_twinblades', stageIndex: 0, level: 'I', forgeGrade: 'BASE',
      bonusStatColor: null, affixIds: [], playerStats: baseStats,
      critInput: { ...baseCrit, rule: 'COMBO_STAGE_3_AND_5', comboIndex: 0 },
    });
    const twinS3 = calculateFinalHitDamage({
      weaponId: 'wpn_cinnabar_twinblades', stageIndex: 2, level: 'I', forgeGrade: 'BASE',
      bonusStatColor: null, affixIds: [], playerStats: baseStats,
      critInput: { ...baseCrit, rule: 'COMBO_STAGE_3_AND_5', comboIndex: 2 },
    });
    const twinS5 = calculateFinalHitDamage({
      weaponId: 'wpn_cinnabar_twinblades', stageIndex: 4, level: 'I', forgeGrade: 'BASE',
      bonusStatColor: null, affixIds: [], playerStats: baseStats,
      critInput: { ...baseCrit, rule: 'COMBO_STAGE_3_AND_5', comboIndex: 4 },
    });
    expect(twinS1.isCrit).toBe(false);
    expect(twinS3.isCrit).toBe(true);
    expect(twinS3.critMultiplierApplied).toBeCloseTo(1.65, 4);
    expect(twinS5.isCrit).toBe(true);
    expect(twinS5.critMultiplierApplied).toBeCloseTo(2.4, 4);

    // #05 坩埚震地重锤：命中冰冻/眩晕/定身必暴 2.50×
    const maulCrit = calculateFinalHitDamage({
      weaponId: 'wpn_crucible_maul', stageIndex: 2, level: 'I', forgeGrade: 'BASE',
      bonusStatColor: null, affixIds: [], playerStats: baseStats,
      targetStatuses: { isBleeding: false, isPoisoned: false, isIgnited: false, isVioletNapalm: false, isFrozen: true, isElectrified: false, isStunnedOrRooted: false },
      critInput: { ...baseCrit, rule: 'CRUSH_FROZEN_STUN_ROOT' },
    });
    expect(maulCrit.isCrit).toBe(true);
    expect(maulCrit.finalDamage).toBe(Math.round(160 * 2.5));

    // #06 骸骨钟摆战戟：内圈 (45px) 普攻 vs 外圈甜区 (88px in [64,112]) 2.15× 必暴
    const halberdInner = calculateFinalHitDamage({
      weaponId: 'wpn_pendulum_halberd', stageIndex: 0, level: 'I', forgeGrade: 'BASE',
      bonusStatColor: null, affixIds: [], playerStats: baseStats,
      critInput: { ...baseCrit, rule: 'HALBERD_SWEETSPOT_64_112PX', distancePx: 45 },
    });
    const halberdSweet = calculateFinalHitDamage({
      weaponId: 'wpn_pendulum_halberd', stageIndex: 0, level: 'I', forgeGrade: 'BASE',
      bonusStatColor: null, affixIds: [], playerStats: baseStats,
      critInput: { ...baseCrit, rule: 'HALBERD_SWEETSPOT_64_112PX', distancePx: 88 },
    });
    expect(halberdInner.isCrit).toBe(false);
    expect(halberdSweet.isCrit).toBe(true);
    expect(halberdSweet.finalDamage).toBe(Math.round(58 * 2.15));

    // #08 发条连发重弩（感电/定身 1.85×）& #09 矾酸投掷瓶（油/火 1.95×）
    const repCrit = calculateFinalHitDamage({
      weaponId: 'wpn_clockwork_repeater', stageIndex: 0, level: 'I', forgeGrade: 'BASE',
      bonusStatColor: null, affixIds: [], playerStats: baseStats,
      targetStatuses: { isBleeding: false, isPoisoned: false, isIgnited: false, isVioletNapalm: false, isFrozen: false, isElectrified: true, isStunnedOrRooted: false },
      critInput: { ...baseCrit, rule: 'ELECTRIFIED_OR_ROOTED' },
    });
    const vitCrit = calculateFinalHitDamage({
      weaponId: 'wpn_vitriol_thrower', stageIndex: 0, level: 'I', forgeGrade: 'BASE',
      bonusStatColor: null, affixIds: [], playerStats: baseStats,
      targetStatuses: { isBleeding: false, isPoisoned: false, isIgnited: true, isVioletNapalm: false, isFrozen: false, isElectrified: false, isStunnedOrRooted: false },
      critInput: { ...baseCrit, rule: 'CATALYST_OILED_OR_IGNITED' },
    });
    expect(repCrit.isCrit).toBe(true);
    expect(vitCrit.isCrit).toBe(true);

    // #12 水银镜面圣盾：黄金招架敌方远程酸弹 -> 折射分裂为 3 道自动追踪水银光束全部命中敌人！
    const projPool = new ProjectilePool();
    const enemyTarget = makeTarget('mob_thrower', 140);
    projPool.spawnEnemyFlaskBolt('mob_thrower', 18, -16, -220, 0, 24, 0);

    let prismSpawned = false;
    const hitPrismCount = { count: 0 };
    for (let tick = 0; tick < 60; tick++) {
      const imps = projPool.stepFixed(
        FIXED_STEP_SEC,
        [],
        [enemyTarget],
        {
          x: 0,
          y: 0,
          width: 14,
          height: 30,
          isParryWindowActive: tick < 8,
          facing: 1,
          equippedShieldId: 'wpn_mirror_aegis',
        },
        (_wx, _wy, _src, isPrism) => {
          prismSpawned = isPrism;
        }
      );
      for (const imp of imps) {
        if (imp.kind === 'PRISM_BEAM') hitPrismCount.count += 1;
      }
    }
    expect(prismSpawned).toBe(true);
    expect(hitPrismCount.count).toBe(3); // 3 道追踪光束全部精准追上并命中目标！
  });

  it('verifies Tesla Turret <=140px tether link, Saw Trap root, and 12 Mutations scaling & Emergency Carapace 1HP save', () => {
    const bus = new TypedEventBus();
    const sm = new StatusEffectMachine(bus);
    const rt = new ActiveSkillRuntime(sm, bus);
    const mut = new MutationProcessor(sm);

    const enemyOnLine = makeTarget('mob_mid', 70);
    rt.deployTeslaTurret(120, 0, 1.0, []);
    // 角色位于 x=0，距哨塔 120px (<= 140px)：激活蓝色高压电弧绊线并对中间 x=70 的敌人造成电击伤！
    const stepNear = rt.stepFixed(0.26, 0, 0, [enemyOnLine]);
    expect(rt.turret.tetherLinkedToPlayer).toBe(true);
    expect(stepNear.hits.some((h) => h.targetId === 'mob_mid')).toBe(true);

    // 角色拉远至 x=-100（距离 220px > 140px）：电弧绊线断开
    rt.stepFixed(0.05, -100, 0, [enemyOnLine]);
    expect(rt.turret.tetherLinkedToPlayer).toBe(false);

    // 捕兽夹：最多存续 2 枚，踩中强制施加 Rooted 3.2s
    rt.deploySawTrap(50, 0, 1.0, []);
    rt.deploySawTrap(70, 0, 1.0, []);
    rt.deploySawTrap(90, 0, 1.0, []);
    expect(rt.sawTraps.activeCount).toBe(2);
    rt.stepFixed(0.05, 0, 0, [enemyOnLine]);
    expect(sm.isRooted('mob_mid')).toBe(true);

    // 变异测试：#04 大煅烧处决 (<16% HP + 燃烧)、#06 超频齿轮暴击减 CD、#12 水银应急凝壳锁 1HP
    sm.apply('mob_mid', 'ignited', 1);
    expect(
      mut.checkScorchExecution(['mut_scorch_execution'], 'mob_mid', 15, 100, false, 70, -20, [enemyOnLine])
    ).toBe(true);

    const hitMut = mut.onWeaponHitLanded({
      activeIds: ['mut_tactical_reload', 'mut_open_wounds'],
      stats: { rubedo: 5, citrinitas: 6, albedo: 4 },
      maxHp: 200,
      targetId: 'mob_mid',
      worldX: 70,
      worldY: -20,
      isMelee: true,
      isCrit: true,
    });
    expect(hitMut.skillCooldownReducedSec).toBeCloseTo(MUTATION_MATH.tacticalReloadCdSec(6), 4);
    expect(sm.has('mob_mid', 'bleeding')).toBe(true);

    // #12 应急凝壳：受击前 60/200 (>25%) 遭致死重击 -> 首次成功锁血保护，冷却期第二次不触发，饮药后恢复
    expect(mut.tryTriggerEmergencyCarapace(['mut_emergency_carapace'], 60, 200, 0)).toBe(true);
    expect(mut.carapaceReady).toBe(false);
    expect(mut.tryTriggerEmergencyCarapace(['mut_emergency_carapace'], 60, 200, 0)).toBe(false);
    mut.resolveFlaskOrFoodModifier(['mut_emergency_carapace'], false);
    expect(mut.carapaceReady).toBe(true);
  });
});
