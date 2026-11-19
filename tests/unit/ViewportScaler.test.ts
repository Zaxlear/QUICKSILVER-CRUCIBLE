import { describe, expect, it } from 'vitest';
import { isDevQaQueryEnabled } from '../../src/core/Constants';
import {
  buildViewportSnapshot,
  computeViewportMetrics,
  isPortraitOrientationLocked,
} from '../../src/render/ViewportScaler';

describe('ViewportScaler Adaptive Resolution Matrix', () => {
  it('locks Tier 1 1920x1080 (DPR 1) to exact 640x360 with 3x integer zoom', () => {
    const snap = buildViewportSnapshot(1920, 1080, 1.0);
    expect(snap.logicalWidth).toBe(640);
    expect(snap.logicalHeight).toBe(360);
    expect(snap.zoomFactor).toBe(3);
    expect(snap.tier).toBe('TIER_1_DESKTOP_FHD');
    expect(snap.safeInsets).toEqual({ top: 24, right: 24, bottom: 24, left: 24 });
  });

  it('locks Tier 2 2560x1440 (DPR 1) to exact 640x360 with 4x integer zoom', () => {
    const snap = buildViewportSnapshot(2560, 1440, 1.0);
    expect(snap.logicalWidth).toBe(640);
    expect(snap.logicalHeight).toBe(360);
    expect(snap.zoomFactor).toBe(4);
    expect(snap.tier).toBe('TIER_2_DESKTOP_HIRES');
  });

  it('expands Tier 3 iPhone Pro landscape 852x393 (DPR 3) horizontally to 780x360', () => {
    const snap = buildViewportSnapshot(852, 393, 3.0);
    expect(snap.logicalWidth).toBe(780);
    expect(snap.logicalHeight).toBe(360);
    expect(snap.dpr).toBe(3);
    expect(snap.zoomFactor).toBeCloseTo(3.275, 3);
    expect(snap.tier).toBe('TIER_3_MOBILE_EXPAND');
    expect(snap.safeInsets.left).toBe(59);
    expect(snap.safeInsets.right).toBe(59);
    expect(snap.safeInsets.bottom).toBe(22);
  });

  it('expands Tier 4 iPad Pro 11" landscape 1194x834 (DPR 2) vertically to 640x448', () => {
    const metrics = computeViewportMetrics(1194, 834, 2.0);
    expect(metrics.logicalWidth).toBe(640);
    expect(metrics.logicalHeight).toBe(448);
    expect(metrics.dpr).toBe(2);
  });

  it('detects portrait rotation 852x393 <-> 393x852 accurately', () => {
    expect(isPortraitOrientationLocked(852, 393, true)).toBe(false);
    expect(isPortraitOrientationLocked(852, 393, false)).toBe(false);
    expect(isPortraitOrientationLocked(393, 852, true)).toBe(true);
    expect(isPortraitOrientationLocked(393, 852, false)).toBe(true);
    expect(isPortraitOrientationLocked(1920, 1080, false)).toBe(false);
  });

  it('gates QA shader dock & minimap cheat controls strictly behind dev env + ?dev=1 / ?qa=1', () => {
    expect(isDevQaQueryEnabled('', true)).toBe(false);
    expect(isDevQaQueryEnabled('?dev=1', true)).toBe(true);
    expect(isDevQaQueryEnabled('?qa=1', true)).toBe(true);
    expect(isDevQaQueryEnabled('?dev=1', false)).toBe(false);
    expect(isDevQaQueryEnabled('?qa=1', false)).toBe(false);
  });
});
