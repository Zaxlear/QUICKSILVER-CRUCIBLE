import { describe, expect, it } from 'vitest';
import { ClockController, FIXED_STEP_SEC } from '../../src/core/ClockController';
import { ObjectPool, type IPoolable } from '../../src/core/ObjectPool';

class DummyProjectile implements IPoolable {
  public active = true;
  public x = 0;

  public reset(): void {
    this.active = false;
    this.x = 0;
  }
}

describe('ClockController 120Hz Fixed-Step Accumulator', () => {
  it('executes exact 1 step @ 120Hz and exact 2 steps @ 60Hz with identical total displacement', () => {
    const clock120 = new ClockController();
    const clock60 = new ClockController();
    let dist120 = 0;
    let dist60 = 0;
    const speedPxPerSec = 216;

    // 模拟 1 秒钟：120 帧 × (1000/120 ms) vs 60 帧 × (1000/60 ms)
    for (let i = 0; i < 120; i++) {
      const steps = clock120.tick(
        1000 / 120,
        (dt) => {
          dist120 += speedPxPerSec * dt;
        },
        () => {}
      );
      expect(steps).toBe(1);
    }

    for (let i = 0; i < 60; i++) {
      const steps = clock60.tick(
        1000 / 60,
        (dt) => {
          dist60 += speedPxPerSec * dt;
        },
        () => {}
      );
      expect(steps).toBe(2);
    }

    expect(clock120.totalFixedTicks).toBe(120);
    expect(clock60.totalFixedTicks).toBe(120);
    expect(dist120).toBeCloseTo(216, 6);
    expect(dist60).toBeCloseTo(dist120, 9);
  });

  it('clamps huge background tab delta spikes to MAX_ACCUMULATOR_SEC (50ms = 6 ticks)', () => {
    const clock = new ClockController();
    let executed = 0;
    clock.tick(
      2_500,
      (dt) => {
        expect(dt).toBe(FIXED_STEP_SEC);
        executed += 1;
      },
      () => {}
    );
    expect(executed).toBe(6);
  });

  it('takes max hit-stop duration without stacking and pauses/resumes in 0ms', () => {
    const clock = new ClockController();
    clock.triggerHitStop(45);
    clock.triggerHitStop(90);
    clock.triggerHitStop(25);
    expect(clock.hitStopRemainingMs).toBeCloseTo(90, 4);

    let simRan = false;
    let renderHitStopFlag = false;
    clock.tick(
      50,
      () => {
        simRan = true;
      },
      (_alpha, hitStopActive) => {
        renderHitStopFlag = hitStopActive;
      }
    );
    expect(simRan).toBe(false);
    expect(renderHitStopFlag).toBe(true);

    // 消耗剩余 40ms 顿帧
    clock.tick(40, () => {}, () => {});
    expect(clock.isHitStopActive).toBe(false);

    // 测试竖屏暂停与 0ms 瞬时恢复
    clock.setPaused(true);
    expect(clock.tick(16.67, () => {}, () => {})).toBe(0);
    clock.setPaused(false);
    expect(clock.tick(16.67, () => {}, () => {})).toBe(2);
  });
});

describe('ObjectPool Zero-GC Pre-allocation', () => {
  it('reuses pre-allocated instances without leaking capacity', () => {
    let createdCount = 0;
    const pool = new ObjectPool<DummyProjectile>(
      () => {
        createdCount += 1;
        return new DummyProjectile();
      },
      8,
      16
    );

    expect(createdCount).toBe(8);
    expect(pool.freeCount).toBe(8);
    expect(pool.activeCount).toBe(0);

    const a = pool.acquire();
    const b = pool.acquire();
    a.active = true;
    a.x = 128;
    b.active = true;

    expect(pool.activeCount).toBe(2);
    expect(pool.freeCount).toBe(6);

    expect(pool.release(a)).toBe(true);
    expect(pool.release(a)).toBe(false);
    expect(a.active).toBe(false);
    expect(a.x).toBe(0);

    pool.releaseAll();
    expect(pool.activeCount).toBe(0);
    expect(pool.freeCount).toBe(8);
    expect(createdCount).toBe(8);
  });
});
