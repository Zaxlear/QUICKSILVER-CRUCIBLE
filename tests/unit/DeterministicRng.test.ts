import { describe, expect, it } from 'vitest';
import { DeterministicRng } from '../../src/core/DeterministicRng';

describe('DeterministicRng (Mulberry32)', () => {
  it('produces 10,000 bit-identical floats and integers for identical seeds', () => {
    const rngA = new DeterministicRng(0x9e3779b9);
    const rngB = new DeterministicRng(0x9e3779b9);

    for (let i = 0; i < 10_000; i++) {
      expect(rngA.nextFloat()).toBe(rngB.nextFloat());
      expect(rngA.nextInt(-1000, 5000)).toBe(rngB.nextInt(-1000, 5000));
    }

    expect(rngA.stepCount).toBe(20_000);
    expect(rngA.serialize()).toEqual(rngB.serialize());
  });

  it('produces 10,000 bit-identical floats and integers after mid-stream serialize/fromSnapshot', () => {
    const continuousRng = new DeterministicRng(0x51c0ffee);

    // 先推进 2,500 步模拟跨房间存档点
    for (let i = 0; i < 2_500; i++) {
      continuousRng.nextFloat();
    }

    const snapshot = continuousRng.serialize();
    expect(snapshot.stepCount).toBe(2_500);

    const restoredRng = DeterministicRng.fromSnapshot(snapshot);

    for (let i = 0; i < 10_000; i++) {
      const fOrig = continuousRng.nextFloat();
      const fRestored = restoredRng.nextFloat();
      expect(Object.is(fOrig, fRestored)).toBe(true);

      const iOrig = continuousRng.nextInt(1, 100_000);
      const iRestored = restoredRng.nextInt(1, 100_000);
      expect(iOrig).toBe(iRestored);
    }

    expect(restoredRng.serialize()).toEqual(continuousRng.serialize());
  });

  it('isolates forked child channels without mutating parent stepCount or sequence', () => {
    const referenceRng = new DeterministicRng(424242);
    const workingRng = new DeterministicRng(424242);

    expect(referenceRng.nextUint32()).toBe(workingRng.nextUint32());

    const biomeForkA = workingRng.fork(0x101);
    const biomeForkB = referenceRng.fork(0x101);
    const lootFork = workingRng.fork(0x202);

    // 子流消耗大量随机步，不得改变父流内部状态与步数
    for (let i = 0; i < 500; i++) {
      expect(biomeForkA.nextFloat()).toBe(biomeForkB.nextFloat());
      lootFork.nextInt(0, 99);
    }

    expect(workingRng.stepCount).toBe(1);
    for (let i = 0; i < 1_000; i++) {
      expect(workingRng.nextFloat()).toBe(referenceRng.nextFloat());
    }
  });

  it('keeps values strictly within [0, 1) and inclusive [min, max] bounds', () => {
    const rng = new DeterministicRng(1337);
    const pool = ['rubedo', 'citrinitas', 'albedo'] as const;

    for (let i = 0; i < 2_000; i++) {
      const f = rng.nextFloat();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);

      const n = rng.nextInt(3, 7);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(7);

      expect(pool).toContain(rng.pick(pool));
    }

    expect(() => rng.pick([])).toThrow();
  });
});
