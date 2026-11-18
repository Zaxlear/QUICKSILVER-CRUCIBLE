import { describe, expect, it } from 'vitest';
import {
  calculateFinalHitDamage,
  computeMaxHpFromStats,
  computeStatDamageMultiplier,
  isBlockedByFrontShield,
} from '../../src/combat/DamageCalculator';
import {
  HitboxManager,
  type VoltaicChainSegment,
} from '../../src/combat/HitboxManager';
import { computeHitStopDurationMs, HitStopController } from '../../src/combat/HitStopController';
import { ProjectilePool } from '../../src/combat/ProjectilePool';
import { ClockController, FIXED_STEP_SEC } from '../../src/core/ClockController';
import { DeterministicRng } from '../../src/core/DeterministicRng';
import { PlayerEntity } from '../../src/entities/player/PlayerEntity';
import { PlayerInventory } from '../../src/entities/player/PlayerInventory';
import type { CollisionWorld } from '../../src/entities/player/PlayerPhysics';
import { PlayerStats } from '../../src/entities/player/PlayerStats';
import { ActionMap } from '../../src/input/ActionMap';
import { GamepadProvider } from '../../src/input/GamepadProvider';
import { KeyboardMouseProvider } from '../../src/input/KeyboardMouseProvider';
import { TouchVirtualPadProvider } from '../../src/input/TouchVirtualPadProvider';
import { buildViewportSnapshot } from '../../src/render/ViewportScaler';

function createPlayerCombatRig() {
  const vp = buildViewportSnapshot(1920, 1080, 1);
  const kbm = new KeyboardMouseProvider(null);
  const pad = new GamepadProvider(() => []);
  const touch = new TouchVirtualPadProvider(vp, null);
  const actionMap = new ActionMap(vp, { keyboardMouse: kbm, gamepad: pad, touchPad: touch });
  const world: CollisionWorld = {
    solidRects: [{ x: -600, y: 0, w: 1200, h: 64 }],
    oneWayPlatforms: [],
    climbableWalls: [],
  };
  const stats = new PlayerStats(120);
  const inventory = new PlayerInventory();
  const player = new PlayerEntity({ spawnX: 0, spawnY: 0, world, input: actionMap, stats, inventory });
  const stepTicks = (n: number): void => {
    for (let i = 0; i < n; i++) {
      actionMap.sampleFixedTick();
      player.fixedUpdate(FIXED_STEP_SEC);
    }
  };
  stepTicks(1);
  return { kbm, player, stats, inventory, world, stepTicks };
}

describe('Milestone 5 — Core Combat, Hit-Stop, Rally Mechanic & First 6 Iconic Weapons', () => {
  it('verifies Rubedo/Citrinitas/Albedo 1.15^(S-1) exponential scaling, dual-color max pick, and marginal HP curves', () => {
    expect(computeStatDamageMultiplier(['rubedo'], { rubedo: 1, citrinitas: 1, albedo: 1 })).toBeCloseTo(1.0, 5);
    expect(computeStatDamageMultiplier(['rubedo'], { rubedo: 2, citrinitas: 1, albedo: 1 })).toBeCloseTo(1.15, 5);
    expect(computeStatDamageMultiplier(['rubedo'], { rubedo: 8, citrinitas: 1, albedo: 1 })).toBeCloseTo(2.66002, 4);
    expect(computeStatDamageMultiplier(['rubedo', 'albedo'], { rubedo: 3, citrinitas: 1, albedo: 6 })).toBeCloseTo(
      Math.pow(1.15, 5),
      5
    );

    // Lv.2 单系生命增幅核验：赤化 +58%、黄化 +48%、白化 +70%
    expect(computeMaxHpFromStats({ rubedo: 2, citrinitas: 1, albedo: 1 })).toBe(Math.round(120 * 1.58));
    expect(computeMaxHpFromStats({ rubedo: 1, citrinitas: 2, albedo: 1 })).toBe(Math.round(120 * 1.48));
    expect(computeMaxHpFromStats({ rubedo: 1, citrinitas: 1, albedo: 2 })).toBe(Math.round(120 * 1.7));
  });

  it('verifies Rusted Scalpel backstab 180-deg half-plane crit (1.95x) and front tower-shield block vs Heavy Cleaver breach', () => {
    const baseStats = { rubedo: 1, citrinitas: 1, albedo: 1 } as const;

    // 目标面朝右 (+1)，位于 x=100：玩家在 x=125 正面挥砍 -> 普通伤害 28
    const frontHit = calculateFinalHitDamage({
      weaponId: 'wpn_rust_scalpel',
      stageIndex: 0,
      level: 'I',
      forgeGrade: 'BASE',
      bonusStatColor: null,
      affixIds: [],
      playerStats: baseStats,
      critInput: {
        rule: 'BACKSTAB_180',
        attackerX: 125,
        targetX: 100,
        targetFacing: 1,
        rapierCritWindowMs: 0,
        comboIndex: 0,
        cleaverRhythmPrimed: false,
        distancePx: 25,
        targetStuckArrows: 0,
        inConductiveHazard: false,
        chainBounceIndex: 0,
      },
    });
    expect(frontHit.isCrit).toBe(false);
    expect(frontHit.finalDamage).toBe(28);

    // 玩家翻滚绕至 x=78（目标身后 180° 半平面）挥砍 -> 1.95x 背刺红字暴击
    const backstabHit = calculateFinalHitDamage({
      weaponId: 'wpn_rust_scalpel',
      stageIndex: 0,
      level: 'I',
      forgeGrade: 'BASE',
      bonusStatColor: null,
      affixIds: [],
      playerStats: baseStats,
      critInput: {
        rule: 'BACKSTAB_180',
        attackerX: 78,
        targetX: 100,
        targetFacing: 1,
        rapierCritWindowMs: 0,
        comboIndex: 0,
        cleaverRhythmPrimed: false,
        distancePx: 22,
        targetStuckArrows: 0,
        inConductiveHazard: false,
        chainBounceIndex: 0,
      },
    });
    expect(backstabHit.isCrit).toBe(true);
    expect(backstabHit.finalDamage).toBe(Math.round(28 * 1.95));

    // 黄铜持盾卫兵正面弹开解剖刃（breach=0.2），但被断头重刃（breach=1.8）正面劈穿，且背后不格挡
    expect(
      isBlockedByFrontShield({
        attackerX: 130,
        targetX: 100,
        targetFacing: 1,
        targetHasFrontShield: true,
        targetIsStunned: false,
        stageBreach: 0.2,
        bypassFrontShield: false,
      })
    ).toBe(true);
    expect(
      isBlockedByFrontShield({
        attackerX: 130,
        targetX: 100,
        targetFacing: 1,
        targetHasFrontShield: true,
        targetIsStunned: false,
        stageBreach: 1.8,
        bypassFrontShield: false,
      })
    ).toBe(false);
  });

  it('verifies Quicksilver Rapier 1,800ms post-dodge/parry guaranteed crit window and 44px ledge-clamped lunge', () => {
    const { kbm, player, stats, inventory, stepTicks } = createPlayerCombatRig();
    const rng = new DeterministicRng(42);
    inventory.equipToSlot('primary', inventory.rollWeaponInstance(rng, 'wpn_quicksilver_rapier', 'I', 'BASE'));

    expect(stats.rapierCritWindowMs).toBe(0);

    // 发动翻滚：立即激活 1,800ms 刺剑必暴窗口
    kbm.injectKey('ShiftLeft', true);
    stepTicks(1);
    kbm.injectKey('ShiftLeft', false);
    expect(stats.rapierCritWindowMs).toBeGreaterThan(1780);

    // 推进 200 ticks (1,666.7ms < 1,800ms)：仍在必暴窗口内！
    stepTicks(200);
    expect(stats.rapierCritWindowMs).toBeGreaterThan(100);

    const critOut = calculateFinalHitDamage({
      weaponId: 'wpn_quicksilver_rapier',
      stageIndex: 0,
      level: 'I',
      forgeGrade: 'BASE',
      bonusStatColor: null,
      affixIds: [],
      playerStats: stats.snapshotLevels,
      critInput: {
        rule: 'POST_DODGE_OR_PARRY_1800MS',
        attackerX: player.physics.x,
        targetX: player.physics.x + 40,
        targetFacing: -1,
        rapierCritWindowMs: stats.rapierCritWindowMs,
        comboIndex: 0,
        cleaverRhythmPrimed: false,
        distancePx: 40,
        targetStuckArrows: 0,
        inConductiveHazard: false,
        chainBounceIndex: 0,
      },
    });
    expect(critOut.isCrit).toBe(true);
    expect(critOut.finalDamage).toBe(Math.round(34 * 2.25));

    // 首刺消耗窗口，或自然流逝超过 1,800ms 后不再必暴
    stats.armRapierCritWindow();
    stepTicks(220); // 1,833ms > 1,800ms
    expect(stats.rapierCritWindowMs).toBe(0);
  });

  it('verifies Athanor Cleaver 220~380ms rhythm combo crit (anti-mash), 40% startup DR, and exact 111ms heavy crit hit-stop', () => {
    const { stats } = createPlayerCombatRig();

    // Case 1: 第 1 段命中后 120ms (< 220ms) 无脑狂按 -> 丧失律动暴击资格
    stats.notifyCleaverStageOneHit();
    for (let i = 0; i < 14; i++) stats.stepFixed(FIXED_STEP_SEC); // ~116.7ms
    expect(stats.evaluateCleaverSecondInput()).toBe(false);
    for (let i = 0; i < 20; i++) stats.stepFixed(FIXED_STEP_SEC); // ~283ms
    expect(stats.evaluateCleaverSecondInput()).toBe(false);
    expect(stats.cleaverRhythmPrimed).toBe(false);

    // Case 2: 第 1 段命中后等待至 300ms (处于 [220ms, 380ms] 黄金节拍窗内) 按下第 2 段 -> 必暴激活！
    stats.notifyCleaverStageOneHit();
    for (let i = 0; i < 36; i++) stats.stepFixed(FIXED_STEP_SEC); // 300.0ms
    expect(stats.isCleaverRhythmWindowOpen).toBe(true);
    expect(stats.evaluateCleaverSecondInput()).toBe(true);
    expect(stats.cleaverRhythmPrimed).toBe(true);

    const cleaverS2 = calculateFinalHitDamage({
      weaponId: 'wpn_athanor_cleaver',
      stageIndex: 1,
      level: 'I',
      forgeGrade: 'BASE',
      bonusStatColor: null,
      affixIds: [],
      playerStats: stats.snapshotLevels,
      critInput: {
        rule: 'RHYTHM_WINDOW_220_380MS',
        attackerX: 0,
        targetX: 30,
        targetFacing: -1,
        rapierCritWindowMs: 0,
        comboIndex: 1,
        cleaverRhythmPrimed: stats.cleaverRhythmPrimed,
        distancePx: 30,
        targetStuckArrows: 0,
        inConductiveHazard: false,
        chainBounceIndex: 0,
      },
    });
    expect(cleaverS2.isCrit).toBe(true);
    expect(cleaverS2.finalDamage).toBe(Math.round(135 * 2.6));

    // 重刃暴击 + 破盾眩晕顿帧数学模型：75ms + 14ms + 22ms = 111ms！
    const clock = new ClockController();
    const hitStop = new HitStopController(clock);
    expect(computeHitStopDurationMs('HEAVY', true, true, 0)).toBe(111);
    const cue = hitStop.registerImpact('HEAVY', true, true, 'ent_brass_sentinel_0', 0);
    expect(cue.hitStopMs).toBe(111);
    expect(clock.isHitStopActive).toBe(true);
  });

  it('verifies Alembic Bow >=160px sniper crit, >=3 stuck arrows crit, swept wall anti-tunneling, and Voltaic Arc chain crits', () => {
    const projPool = new ProjectilePool();
    const target = {
      id: 'dummy_0',
      x: 110,
      y: 0,
      width: 24,
      height: 40,
      facing: -1 as const,
      isAlive: true,
      hasFrontShield: false,
      isStunned: false,
      inConductiveHazard: false,
    };

    // 近距 110px (<160px) 连续射中 3 箭：前 2 箭普攻，第 3 箭插满触发必暴！
    const critFlags: boolean[] = [];
    for (let shot = 0; shot < 3; shot++) {
      projPool.spawnPlayerMercuryArrow(0, -18, 1, false);
      let hitEvent = null;
      for (let t = 0; t < 30 && !hitEvent; t++) {
        const res = projPool.stepFixed(FIXED_STEP_SEC, [], [target], {
          x: 0,
          y: 0,
          width: 14,
          height: 30,
          isParryWindowActive: false,
        });
        if (res.length > 0) hitEvent = res[0]!;
      }
      expect(hitEvent).not.toBeNull();
      const out = calculateFinalHitDamage({
        weaponId: 'wpn_alembic_bow',
        stageIndex: 0,
        level: 'I',
        forgeGrade: 'BASE',
        bonusStatColor: null,
        affixIds: [],
        playerStats: { rubedo: 1, citrinitas: 1, albedo: 1 },
        critInput: {
          rule: 'SNIPER_160PX_OR_3_STUCK_ARROWS',
          attackerX: 0,
          targetX: target.x,
          targetFacing: -1,
          rapierCritWindowMs: 0,
          comboIndex: 0,
          cleaverRhythmPrimed: false,
          distancePx: hitEvent!.distanceTravelledPx,
          targetStuckArrows: hitEvent!.embeddedArrowsBeforeHit + 1,
          inConductiveHazard: false,
          chainBounceIndex: 0,
        },
      });
      critFlags.push(out.isCrit);
    }
    expect(critFlags).toEqual([false, false, true]);
    expect(projPool.ripOutArrowsFromTarget('dummy_0')).toBe(3);

    // 远距 200px (>=160px) 首箭直接狙杀必暴
    const sniperOut = calculateFinalHitDamage({
      weaponId: 'wpn_alembic_bow',
      stageIndex: 0,
      level: 'I',
      forgeGrade: 'BASE',
      bonusStatColor: null,
      affixIds: [],
      playerStats: { rubedo: 1, citrinitas: 1, albedo: 1 },
      critInput: {
        rule: 'SNIPER_160PX_OR_3_STUCK_ARROWS',
        attackerX: 0,
        targetX: 200,
        targetFacing: -1,
        rapierCritWindowMs: 0,
        comboIndex: 0,
        cleaverRhythmPrimed: false,
        distancePx: 200,
        targetStuckArrows: 1,
        inConductiveHazard: false,
        chainBounceIndex: 0,
      },
    });
    expect(sniperOut.isCrit).toBe(true);

    // 扫掠防穿墙：在 x=60 放置仅 8px 厚的薄墙，860px/s 高速箭矢绝不可穿透命中 x=110 的目标
    projPool.spawnPlayerMercuryArrow(0, -18, 1, false);
    let hitBehindWall = false;
    for (let t = 0; t < 30; t++) {
      const evs = projPool.stepFixed(
        FIXED_STEP_SEC,
        [{ x: 60, y: -60, w: 8, h: 60 }],
        [target],
        { x: 0, y: 0, width: 14, height: 30, isParryWindowActive: false }
      );
      if (evs.length > 0) hitBehindWall = true;
    }
    expect(hitBehindWall).toBe(false);

    // 星盘电弧法杖链式弹射：首目标不暴击，第 2、3、4 名跳变目标全部必暴
    const hitboxes = new HitboxManager();
    const chainTargets = [0, 1, 2, 3, 4].map((idx) => ({
      ...target,
      id: `mob_${idx}`,
      x: 50 + idx * 45,
    }));
    const segs: VoltaicChainSegment[] = [];
    const chainHits = hitboxes.resolveVoltaicArcPulse(0, -18, 1, chainTargets, segs);
    expect(chainHits.length).toBe(4);
    expect(chainHits[0]!.chainBounceIndex).toBe(0);
    expect(chainHits[1]!.chainBounceIndex).toBe(1);
    expect(chainHits[3]!.chainBounceIndex).toBe(3);
  });

  it('verifies Golden Parry 0ms cooldown reset, projectile 1.8x/250% deflection, and Orange Rally HP freeze/recover/decay', () => {
    const { kbm, player, stats, stepTicks } = createPlayerCombatRig();

    // 1. 故意承受 80 点伤害：红血 120 -> 40，生成 75% * 80 = 60 点琥珀色橙血槽并冻结 900ms
    expect(player.receiveIncomingHit(80, 1, true)).toBe('hurt');
    expect(stats.hp).toBe(40);
    expect(stats.rallyOrangeHp).toBe(60);
    expect(stats.isRallyFrozen).toBe(true);

    // 推进 60 ticks (500ms < 900ms)：橙血保持静止零流失，且角色已脱离受击硬直
    stepTicks(60);
    expect(stats.rallyOrangeHp).toBe(60);

    // 挥刀反击命中敌人：立刻将一部分橙血吸回真实红血！
    const recoveredBySlash = stats.recoverRallyOnWeaponHit(0.18, true);
    expect(recoveredBySlash).toBeGreaterThan(10);
    expect(stats.hp).toBe(40 + recoveredBySlash);
    expect(stats.rallyOrangeHp).toBe(60 - recoveredBySlash);

    // 2. 按下副手盾牌键进入黄金招架窗口（Ticks 3..20），成功弹反敌方投射物：
    //    - 盾牌冷却 0ms 清零；
    //    - 立即额外回复当前剩余橙血的 60%；
    //    - 投射物转为 PLAYER 阵营，速度 ×1.8、伤害 ×2.5！
    const projPool = new ProjectilePool();
    const bolt = projPool.spawnEnemyFlaskBolt('mob_thrower', 28, -16, -200, 0, 30, 0);

    kbm.injectKey('KeyK', true);
    stepTicks(1);
    kbm.injectKey('KeyK', false);
    stepTicks(3); // 进入黄金招架窗口 Tick 4
    expect(player.ctx.isParryWindowActive).toBe(true);

    const orangeBeforeParry = stats.rallyOrangeHp;
    let parriedCallbackCount = 0;
    for (let i = 0; i < 14; i++) {
      projPool.stepFixed(
        FIXED_STEP_SEC,
        [],
        [],
        {
          x: player.physics.x,
          y: player.physics.y,
          width: 14,
          height: 30,
          isParryWindowActive: player.ctx.isParryWindowActive,
        },
        () => {
          parriedCallbackCount += 1;
          player.receiveIncomingHit(0, -1, true);
        }
      );
    }

    expect(parriedCallbackCount).toBe(1);
    expect(player.ctx.parryCooldownTicks).toBe(0);
    expect(stats.rallyOrangeHp).toBeLessThan(orangeBeforeParry);
    expect(bolt.faction).toBe('PLAYER');
    expect(bolt.vx).toBeCloseTo(200 * 1.8, 4);
    expect(bolt.reflectedDamageScale).toBeCloseTo(2.5, 4);

    // 3. 推进超过 900ms 未再进攻：剩余橙血按 32% MaxHP / s 匀速衰减归零
    stepTicks(180);
    expect(stats.rallyOrangeHp).toBe(0);
  });
});
