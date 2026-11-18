import { describe, expect, it } from 'vitest';
import { ClockController, FIXED_STEP_SEC } from '../../src/core/ClockController';
import { PLAYER_KINEMATICS } from '../../src/data/playerKinematics.data';
import { PlayerEntity } from '../../src/entities/player/PlayerEntity';
import type { CollisionWorld } from '../../src/entities/player/PlayerPhysics';
import { ActionMap } from '../../src/input/ActionMap';
import { GamepadProvider } from '../../src/input/GamepadProvider';
import { KeyboardMouseProvider } from '../../src/input/KeyboardMouseProvider';
import { TouchVirtualPadProvider } from '../../src/input/TouchVirtualPadProvider';
import { buildViewportSnapshot } from '../../src/render/ViewportScaler';

function createTestRig(
  worldOverrides?: Partial<CollisionWorld>,
  spawnX = 0,
  spawnY = 0,
  hasClaws = true
): {
  readonly actionMap: ActionMap;
  readonly kbm: KeyboardMouseProvider;
  readonly player: PlayerEntity;
  stepTicks: (n: number) => void;
} {
  const vp = buildViewportSnapshot(1920, 1080, 1);
  const kbm = new KeyboardMouseProvider(null);
  const pad = new GamepadProvider(() => []);
  const touch = new TouchVirtualPadProvider(vp, null);
  const actionMap = new ActionMap(vp, { keyboardMouse: kbm, gamepad: pad, touchPad: touch });

  const world: CollisionWorld = {
    solidRects: worldOverrides?.solidRects ?? [{ x: -500, y: 0, w: 1000, h: 64 }],
    oneWayPlatforms: worldOverrides?.oneWayPlatforms ?? [],
    climbableWalls: worldOverrides?.climbableWalls ?? [],
  };

  const player = new PlayerEntity({
    spawnX,
    spawnY,
    world,
    input: actionMap,
    hasMagneticClawsRune: hasClaws,
  });

  const stepTicks = (n: number): void => {
    for (let i = 0; i < n; i++) {
      actionMap.sampleFixedTick();
      player.fixedUpdate(FIXED_STEP_SEC);
    }
  };

  // 首帧贴地稳定初始化
  stepTicks(1);
  return { actionMap, kbm, player, stepTicks };
}

describe('Milestone 3 — PlayerPhysics & 10-State Node FSM Deterministic Gates', () => {
  it('enforces Coyote Time: ledge walk-off jumps within 11 ticks as Ground Jump, and converts to DoubleJump at tick 13', () => {
    // 平台右边缘位于 x = 0，角色初始位于 x = -8（右脚边缘 -1），向右跑出悬崖
    const ledgeWorld: Partial<CollisionWorld> = {
      solidRects: [{ x: -400, y: 0, w: 400, h: 64 }],
    };

    // Case A: 走出平台边缘后第 11 个滞空 tick 按跳跃 -> 触发一段跳（不消耗二段跳）
    {
      const { kbm, player, stepTicks } = createTestRig(ledgeWorld, -8, 0);
      kbm.injectKey('KeyD', true);
      while (player.physics.isGrounded) {
        stepTicks(1);
      }
      // 此时刚踏空进入第 1 个滞空 tick；再推进 10 ticks 到达第 11 个滞空 tick 内按跳
      stepTicks(10);
      expect(player.physics.isGrounded).toBe(false);
      expect(player.physics.coyoteTicks).toBeGreaterThan(0);

      kbm.injectKey('Space', true);
      stepTicks(1); // 第 11~12 滞空窗口内起跳

      expect(player.state).toBe('Jump');
      expect(player.physics.vy).toBeLessThan(-350);
      expect(player.physics.airJumpsRemaining).toBe(1); // 二段跳次数完好保留！
    }

    // Case B: 走出平台边缘后等待至第 13 个滞空 tick 按跳跃 -> 土狼过期，转为 DoubleJumpState
    {
      const { kbm, player, stepTicks } = createTestRig(ledgeWorld, -8, 0);
      kbm.injectKey('KeyD', true);
      while (player.physics.isGrounded) {
        stepTicks(1);
      }
      // 已完成第 1 个滞空 tick，再推进 11 个滞空 tick（共 12 个滞空 ticks 耗尽土狼窗口）
      stepTicks(11);
      expect(player.physics.coyoteTicks).toBe(0);

      // 在第 13 个滞空 tick 按下跳跃
      kbm.injectKey('Space', true);
      stepTicks(1);

      expect(player.state).toBe('DoubleJump');
      expect(player.physics.airJumpsRemaining).toBe(0);
    }
  });

  it('enforces Jump Input Buffer: pressing Jump 13 ticks before landing auto-jumps on landing tick 1', () => {
    const { kbm, player, stepTicks } = createTestRig(undefined, 0, -40);
    // 耗尽空中二段跳，测试纯落地预输入缓冲
    player.physics.airJumpsRemaining = 0;

    // 先测算从当前位置自然坠地所需的精确帧数
    const probe = createTestRig(undefined, 0, -40);
    probe.player.physics.airJumpsRemaining = 0;
    let ticksToLand = 0;
    while (!probe.player.physics.isGrounded && ticksToLand < 200) {
      probe.stepTicks(1);
      ticksToLand += 1;
    }
    expect(ticksToLand).toBeGreaterThan(16);

    // 推进至距离触地恰好还剩 13 ticks 时按下跳跃键
    stepTicks(ticksToLand - 13);
    expect(player.physics.isGrounded).toBe(false);

    kbm.injectKey('Space', true);
    stepTicks(1);
    kbm.injectKey('Space', false);

    // 推进剩余 12 ticks 抵达触地第 1 tick：应当立即消费缓冲自动起跳！
    stepTicks(12);
    expect(player.state).toBe('Jump');
    expect(player.physics.vy).toBeLessThan(-350);
  });

  it('produces identical variable jump curves across 60Hz & 120Hz ClockController ticks', () => {
    // 1. 短按截断小跳 vs 满按大跳高度对比
    const shortHop = createTestRig();
    shortHop.kbm.injectKey('Space', true);
    shortHop.stepTicks(3);
    shortHop.kbm.injectKey('Space', false);
    let minShortY = 0;
    for (let i = 0; i < 60; i++) {
      shortHop.stepTicks(1);
      minShortY = Math.min(minShortY, shortHop.player.physics.y);
    }

    const fullJump120 = createTestRig();
    const fullJump60 = createTestRig();
    const clock120 = new ClockController();
    const clock60 = new ClockController();

    fullJump120.kbm.injectKey('Space', true);
    fullJump60.kbm.injectKey('Space', true);

    let minFull120Y = 0;
    let minFull60Y = 0;

    // 运行 0.5 秒（120Hz 60 帧 vs 60Hz 30 帧）
    for (let f = 0; f < 60; f++) {
      clock120.tick(
        1000 / 120,
        (dt) => {
          fullJump120.actionMap.sampleFixedTick();
          fullJump120.player.fixedUpdate(dt);
          minFull120Y = Math.min(minFull120Y, fullJump120.player.physics.y);
        },
        () => {}
      );
    }
    for (let f = 0; f < 30; f++) {
      clock60.tick(
        1000 / 60,
        (dt) => {
          fullJump60.actionMap.sampleFixedTick();
          fullJump60.player.fixedUpdate(dt);
          minFull60Y = Math.min(minFull60Y, fullJump60.player.physics.y);
        },
        () => {}
      );
    }

    const shortHeight = -minShortY;
    const fullHeight120 = -minFull120Y;
    const fullHeight60 = -minFull60Y;

    expect(shortHeight).toBeGreaterThan(16);
    expect(shortHeight).toBeLessThan(34);
    expect(fullHeight120).toBeGreaterThan(56); // 跨越 >= 3.5 格 (56px) 包络
    expect(fullHeight60).toBeCloseTo(fullHeight120, 9); // 60Hz 与 120Hz 误差 0.00px
  });

  it('enforces DodgeRollState i-Frames on ticks 1..32, vulnerable on tick 33, jump-cancel on tick 34, and exact 96px full roll', () => {
    // 1. 验证第 1..32 ticks 无敌、第 33 tick 结束无敌且不可取消、第 34 tick 可跳跃取消
    {
      const { kbm, player, stepTicks } = createTestRig();
      kbm.injectKey('ShiftLeft', true);
      stepTicks(1); // Tick 1 of DodgeRoll
      kbm.injectKey('ShiftLeft', false);

      expect(player.state).toBe('DodgeRoll');
      expect(player.isInvulnerable).toBe(true);
      expect(player.receiveIncomingHit(40, 1, false)).toBe('evaded');
      expect(player.ctx.hp).toBe(120);

      for (let tick = 2; tick <= 32; tick++) {
        stepTicks(1);
        expect(player.state).toBe('DodgeRoll');
        expect(player.isInvulnerable).toBe(true);
      }

      // Tick 33：无敌帧结束，且尚不可提前取消
      stepTicks(1);
      expect(player.state).toBe('DodgeRoll');
      expect(player.isInvulnerable).toBe(false);

      // Tick 34：按下跳跃立即提前打断翻滚进入 JumpState！
      kbm.injectKey('Space', true);
      stepTicks(1);
      expect(player.state).toBe('Jump');
      expect(player.physics.vy).toBeLessThan(-350);
    }

    // 2. 验证完整 42 ticks 不取消平地翻滚精确位移 96.0 px
    {
      const { kbm, player, stepTicks } = createTestRig(undefined, 0, 0);
      const startX = player.physics.x;
      kbm.injectKey('ShiftLeft', true);
      stepTicks(1);
      kbm.injectKey('ShiftLeft', false);

      stepTicks(PLAYER_KINEMATICS.DODGE_TOTAL_TICKS - 1);
      expect(player.state).toBe('Idle');
      expect(player.physics.x - startX).toBeCloseTo(96.0, 5);
    }
  });

  it('supports one-way platform upward pass-through, standing, and Down+Jump drop-through', () => {
    const { kbm, player, stepTicks } = createTestRig(
      {
        solidRects: [{ x: -300, y: 48, w: 600, h: 32 }],
        oneWayPlatforms: [{ x: -100, y: 0, w: 200 }],
      },
      0,
      48
    );

    // 从地面 y=48 起跳向上穿过 y=0 单向格栅并稳稳落在格栅顶面
    kbm.injectKey('Space', true);
    stepTicks(45);
    kbm.injectKey('Space', false);
    stepTicks(35);

    expect(player.physics.isGrounded).toBe(true);
    expect(player.physics.isOnOneWay).toBe(true);
    expect(player.physics.y).toBe(0);

    // 按住下蹲 S + Space 穿透单向格栅落回主地面 y=48
    kbm.injectKey('KeyS', true);
    kbm.injectKey('Space', true);
    stepTicks(1);
    kbm.injectKey('Space', false);
    kbm.injectKey('KeyS', false);

    expect(player.physics.isGrounded).toBe(false);
    expect(player.physics.y).toBeGreaterThan(0);

    stepTicks(45);
    expect(player.physics.isGrounded).toBe(true);
    expect(player.physics.y).toBe(48);
  });

  it('supports WallSlideState velocity clamp (<=92 px/s), wall-jump launch, and 12-tick reattach lock', () => {
    const { kbm, player, stepTicks } = createTestRig(
      {
        solidRects: [
          { x: -300, y: 120, w: 600, h: 32 },
          { x: 40, y: -200, w: 32, h: 320 },
        ],
        climbableWalls: [{ x: 40, topY: -200, bottomY: 120, normalX: -1 }],
      },
      26,
      -40,
      true
    );

    // 空中向右推杆贴靠 x=40 可攀爬右墙
    kbm.injectKey('KeyD', true);
    stepTicks(20);

    expect(player.state).toBe('WallSlide');
    expect(player.physics.vy).toBeLessThanOrEqual(PLAYER_KINEMATICS.WALL_SLIDE_MAX_VY + 1e-5);

    // 按下跳跃触发蹬墙反跳 (-250, -355) 并激活 12 ticks 防吸回锁
    kbm.injectKey('Space', true);
    stepTicks(1);

    expect(player.state).toBe('Jump');
    expect(player.physics.vx).toBeLessThan(-200);
    expect(player.physics.vy).toBeLessThan(-330);
    expect(player.physics.wallJumpLockTicks).toBeGreaterThan(0);
  });

  it('enforces Cancel Hierarchy on AttackCombo, Parry Golden Window 0ms reset, Hurt, and Dead', () => {
    const { kbm, player, stepTicks } = createTestRig();

    // 1. 发动一段挥砍：Tick 1..11 期间不可被翻滚取消，Tick 12 进入取消窗后立即翻滚打断
    kbm.injectKey('KeyJ', true);
    stepTicks(1);
    kbm.injectKey('KeyJ', false);
    expect(player.state).toBe('AttackCombo');

    // 第 8 tick 处于攻击判定盒激活期，按下翻滚应先缓冲而不打断前摇/判定帧
    stepTicks(7); // stageTick = 8
    expect(player.ctx.isAttackHitboxActive).toBe(true);
    kbm.injectKey('ShiftLeft', true);
    stepTicks(1); // stageTick = 9 (< cancelStartTick 12)
    kbm.injectKey('ShiftLeft', false);
    expect(player.state).toBe('AttackCombo');

    // 推进至 stageTick = 12：自动消费翻滚缓冲瞬时打断后摇进入 DodgeRoll！
    stepTicks(3);
    expect(player.state).toBe('DodgeRoll');

    // 等待翻滚与冷却结束回到 Idle
    stepTicks(60);
    expect(player.state).toBe('Idle');

    // 2. 发动招架 ParryState：Tick 1..2 为前摇，Tick 3..20 为黄金招架窗，成功弹反清零 CD
    kbm.injectKey('KeyK', true);
    stepTicks(1); // Tick 1
    kbm.injectKey('KeyK', false);
    expect(player.state).toBe('Parry');
    expect(player.ctx.isParryWindowActive).toBe(false);

    stepTicks(3); // Tick 4 (处于 3..20 黄金招架窗内)
    expect(player.ctx.isParryWindowActive).toBe(true);
    expect(player.receiveIncomingHit(50, 1, true)).toBe('parried');
    expect(player.ctx.parryCooldownTicks).toBe(0); // 0ms 冷却重置！

    stepTicks(30);
    expect(player.state).toBe('Idle');

    // 3. 普通受击进入 HurtState，击退抛物线落地后归回 Idle，致命受击进入不可逆终态 DeadState
    expect(player.receiveIncomingHit(35, 1, true)).toBe('hurt');
    expect(player.state).toBe('Hurt');
    stepTicks(38);
    expect(player.state).toBe('Idle');
    // 等待受击保护帧消退
    stepTicks(15);

    expect(player.receiveIncomingHit(500, -1, false)).toBe('dead');
    expect(player.state).toBe('Dead');
    kbm.injectKey('Space', true);
    kbm.injectKey('ShiftLeft', true);
    stepTicks(10);
    expect(player.state).toBe('Dead'); // DeadState 屏蔽一切常规输入转移
  });
});
