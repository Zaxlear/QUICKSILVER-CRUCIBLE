import { describe, expect, it } from 'vitest';
import { MOBILE_HOME_SAFE_BOTTOM_PX, MOBILE_LANDSCAPE_SAFE_X_PX } from '../../src/core/Constants';
import { TOUCH_PAD_METRICS } from '../../src/data/playerKinematics.data';
import { ActionMap } from '../../src/input/ActionMap';
import { GamepadProvider, type GamepadLike } from '../../src/input/GamepadProvider';
import { KeyboardMouseProvider } from '../../src/input/KeyboardMouseProvider';
import { TouchVirtualPadProvider } from '../../src/input/TouchVirtualPadProvider';
import { buildViewportSnapshot } from '../../src/render/ViewportScaler';

describe('Milestone 3 — Multi-Device ActionMap, Sub-Frame Latch & Ergonomic Touch Pad', () => {
  it('hot-swaps seamlessly across KeyboardMouse, Gamepad (0.18 deadzone), and Touch', () => {
    const desktopVp = buildViewportSnapshot(1920, 1080, 1);
    let padState: GamepadLike | null = null;

    const kbm = new KeyboardMouseProvider(null);
    const pad = new GamepadProvider(() => [padState]);
    const touch = new TouchVirtualPadProvider(desktopVp, null);
    const actionMap = new ActionMap(desktopVp, {
      keyboardMouse: kbm,
      gamepad: pad,
      touchPad: touch,
    });

    expect(actionMap.activeDevice).toBe('KEYBOARD_MOUSE');

    // 1. 手柄微弱漂移 (< 0.18 死区) 不抢夺设备控制权
    padState = {
      connected: true,
      index: 0,
      axes: [0.11, -0.09, 0, 0],
      buttons: Array.from({ length: 16 }, () => ({ pressed: false, value: 0 })),
    };
    actionMap.sampleFixedTick();
    expect(actionMap.activeDevice).toBe('KEYBOARD_MOUSE');
    expect(actionMap.moveX).toBe(0);

    // 2. 手柄推杆越过死区并按下 A 键 -> 瞬时热切换为 GAMEPAD
    const buttons = Array.from({ length: 16 }, (_, idx) => ({
      pressed: idx === 0,
      value: idx === 0 ? 1 : 0,
    }));
    padState = {
      connected: true,
      index: 0,
      axes: [0.85, 0, 0, 0],
      buttons,
    };
    actionMap.sampleFixedTick();
    expect(actionMap.activeDevice).toBe('GAMEPAD');
    expect(actionMap.wasJustPressed('jump')).toBe(true);
    expect(actionMap.moveX).toBeGreaterThan(0.75);

    // 3. 手柄回中后触控左半屏落指 -> 瞬时热切换为 TOUCH
    padState = null;
    touch.injectPointer('down', 1, 180, 260);
    touch.injectPointer('move', 1, 225, 260);
    actionMap.sampleFixedTick();
    expect(actionMap.activeDevice).toBe('TOUCH');
    expect(actionMap.moveX).toBeGreaterThan(0.8);

    // 4. 释放触控并按下重绑定后的键盘按键 -> 瞬时切回 KEYBOARD_MOUSE
    touch.injectPointer('up', 1, 225, 260);
    kbm.rebindKey('dodge', ['KeyZ']);
    kbm.injectKey('KeyZ', true);
    actionMap.sampleFixedTick();
    expect(actionMap.activeDevice).toBe('KEYBOARD_MOUSE');
    expect(actionMap.wasJustPressed('dodge')).toBe(true);
  });

  it('preserves ultra-fast sub-frame key taps (<8ms press+release before tick) via edge latch', () => {
    const vp = buildViewportSnapshot(1920, 1080, 1);
    const kbm = new KeyboardMouseProvider(null);
    const actionMap = new ActionMap(vp, {
      keyboardMouse: kbm,
      gamepad: new GamepadProvider(() => []),
      touchPad: new TouchVirtualPadProvider(vp, null),
    });

    // 在同一个采样周期前连续触发按下和松开
    kbm.injectKey('Space', true);
    kbm.injectKey('Space', false);

    actionMap.sampleFixedTick();
    expect(actionMap.wasJustPressed('jump')).toBe(true);
    expect(actionMap.isHeld('jump')).toBe(true);

    // 下一个 120Hz tick 自动检测到松开边沿（触发可变跳高 vy *= 0.45 截断）
    actionMap.sampleFixedTick();
    expect(actionMap.wasJustPressed('jump')).toBe(false);
    expect(actionMap.isHeld('jump')).toBe(false);
    expect(actionMap.wasJustReleased('jump')).toBe(true);
  });

  it('enforces 48px floating stick origin drift, Slide-to-Cancel, and iPhone Pro 852x393 safe-area bounds', () => {
    const mobileVp = buildViewportSnapshot(852, 393, 3);
    const touch = new TouchVirtualPadProvider(mobileVp, null);
    const actionMap = new ActionMap(mobileVp, {
      keyboardMouse: new KeyboardMouseProvider(null),
      gamepad: new GamepadProvider(() => []),
      touchPad: touch,
    });

    const initialHud = touch.buildHudSnapshot('TOUCH');
    expect(initialHud.visible).toBe(true);

    // 1. 校验全部 7 枚右侧弧形动作键严格处于 59px 左右灵动岛安全区与 >=22px Home Indicator 净空之内，且互不重叠
    for (let i = 0; i < initialHud.buttons.length; i++) {
      const b = initialHud.buttons[i]!;
      expect(b.centerX + b.radiusPx).toBeLessThanOrEqual(852 - MOBILE_LANDSCAPE_SAFE_X_PX);
      expect(b.centerY + b.radiusPx).toBeLessThanOrEqual(393 - MOBILE_HOME_SAFE_BOTTOM_PX);
      for (let j = i + 1; j < initialHud.buttons.length; j++) {
        const other = initialHud.buttons[j]!;
        const centerDist = Math.hypot(b.centerX - other.centerX, b.centerY - other.centerY);
        expect(centerDist).toBeGreaterThan(b.radiusPx + other.radiusPx);
      }
    }

    // 2. 左半屏任意点按下唤出浮动摇杆，拖出 90px 后圆心跟手漂移保持距离 === 48px
    touch.injectPointer('down', 10, 150, 220);
    touch.injectPointer('move', 10, 250, 220); // 向右拖出 100px
    const draggedHud = touch.buildHudSnapshot('TOUCH');
    expect(draggedHud.stick.active).toBe(true);
    expect(250 - draggedHud.stick.originX).toBeCloseTo(
      TOUCH_PAD_METRICS.STICK_ORIGIN_DRIFT_LIMIT_PX,
      0
    );

    // 3. 右半屏 Slide-to-Cancel：按住主攻击键后不抬指直接滑入翻滚键热区
    const atkBtn = initialHud.buttons.find((b) => b.action === 'attack_primary')!;
    const rollBtn = initialHud.buttons.find((b) => b.action === 'dodge')!;

    touch.injectPointer('down', 20, atkBtn.centerX, atkBtn.centerY);
    actionMap.sampleFixedTick();
    expect(actionMap.wasJustPressed('attack_primary')).toBe(true);
    expect(actionMap.isHeld('attack_primary')).toBe(true);

    // 同一根手指 (pointerId=20) 零抬指滑向翻滚键中心
    touch.injectPointer('move', 20, rollBtn.centerX, rollBtn.centerY);
    actionMap.sampleFixedTick();
    expect(actionMap.isHeld('attack_primary')).toBe(false);
    expect(actionMap.wasJustPressed('dodge')).toBe(true);
    expect(actionMap.isHeld('dodge')).toBe(true);
  });
});
