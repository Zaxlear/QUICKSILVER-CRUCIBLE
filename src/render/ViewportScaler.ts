import {
  DESKTOP_SAFE_PADDING_PX,
  INTEGER_ZOOM_SNAP_TOLERANCE,
  LOGICAL_BASE_HEIGHT,
  LOGICAL_BASE_WIDTH,
  LOGICAL_MAX_HEIGHT,
  LOGICAL_MAX_WIDTH,
  MAX_DPR_CAP,
  MOBILE_HOME_SAFE_BOTTOM_PX,
  MOBILE_LANDSCAPE_SAFE_X_PX,
  STANDARD_ASPECT_RATIO,
} from '../core/Constants';
import type { ViewportSnapshotPayload, ViewportTierId } from '../core/EventBus';

export interface ViewportMetrics {
  readonly logicalWidth: number;
  readonly logicalHeight: number;
  readonly zoomFactor: number;
  readonly dpr: number;
}

/**
 * 四端自适应分辨率缩放纯函数：
 * - 16:9 桌面端精确锁定 640×360 并吸附整数倍（1080p=3×, 1440p=4×, 4K=6×）
 * - 超宽全面屏手机（如 852×393）锁定高度 360px，水平 EXPAND 至 780×360 零黑边
 * - 4:3 / 1.43:1 平板（如 1194×834）锁定宽度 640px，垂直 EXPAND 至 640×448
 */
export function computeViewportMetrics(
  cssWidth: number,
  cssHeight: number,
  rawDpr: number
): ViewportMetrics {
  const dpr = Math.min(Math.max(rawDpr || 1, 1), MAX_DPR_CAP);
  const safeWidth = Math.max(cssWidth, 320);
  const safeHeight = Math.max(cssHeight, 240);
  const aspect = safeWidth / safeHeight;

  let logicalWidth = LOGICAL_BASE_WIDTH;
  let logicalHeight = LOGICAL_BASE_HEIGHT;

  if (aspect >= STANDARD_ASPECT_RATIO) {
    logicalHeight = LOGICAL_BASE_HEIGHT;
    logicalWidth = Math.min(
      LOGICAL_MAX_WIDTH,
      Math.round((LOGICAL_BASE_HEIGHT * aspect) / 2) * 2
    );
  } else {
    logicalWidth = LOGICAL_BASE_WIDTH;
    logicalHeight = Math.min(
      LOGICAL_MAX_HEIGHT,
      Math.round((LOGICAL_BASE_WIDTH / aspect) / 2) * 2
    );
  }

  const physicalHeight = safeHeight * dpr;
  const rawZoom = physicalHeight / logicalHeight;
  const nearestInt = Math.round(rawZoom);
  const zoomFactor =
    Math.abs(rawZoom - nearestInt) < INTEGER_ZOOM_SNAP_TOLERANCE
      ? Math.max(1, nearestInt)
      : Number(rawZoom.toFixed(4));

  return {
    logicalWidth,
    logicalHeight,
    zoomFactor,
    dpr,
  };
}

export function classifyViewportTier(
  cssWidth: number,
  cssHeight: number,
  dpr: number
): ViewportTierId {
  const safeHeight = Math.max(cssHeight, 1);
  const aspect = cssWidth / safeHeight;

  if (aspect >= 1.92) {
    return 'TIER_3_MOBILE_EXPAND';
  }
  if (aspect < STANDARD_ASPECT_RATIO - 0.03) {
    return 'TIER_4_TABLET_EXPAND';
  }
  if (safeHeight * dpr > 1100) {
    return 'TIER_2_DESKTOP_HIRES';
  }
  return 'TIER_1_DESKTOP_FHD';
}

export function computeSafeInsetsFloor(
  cssWidth: number,
  cssHeight: number
): ViewportSnapshotPayload['safeInsets'] {
  const safeHeight = Math.max(cssHeight, 1);
  const aspect = cssWidth / safeHeight;
  const isMobileUltrawideLandscape = cssHeight <= 450 && aspect >= 1.92;

  if (isMobileUltrawideLandscape) {
    return {
      top: 12,
      right: MOBILE_LANDSCAPE_SAFE_X_PX,
      bottom: MOBILE_HOME_SAFE_BOTTOM_PX,
      left: MOBILE_LANDSCAPE_SAFE_X_PX,
    };
  }

  return {
    top: DESKTOP_SAFE_PADDING_PX,
    right: DESKTOP_SAFE_PADDING_PX,
    bottom: DESKTOP_SAFE_PADDING_PX,
    left: DESKTOP_SAFE_PADDING_PX,
  };
}

/**
 * 检测移动端或窄视口竖屏握持状态：
 * 兼容 iOS Safari 真机触控设备与自动化测试 852×393 -> 393×852 窗口旋转。
 */
export function isPortraitOrientationLocked(
  cssWidth: number,
  cssHeight: number,
  hasTouchCapability = false
): boolean {
  if (cssHeight <= cssWidth) {
    return false;
  }
  return hasTouchCapability || cssWidth <= 900;
}

export function buildViewportSnapshot(
  cssWidth: number,
  cssHeight: number,
  rawDpr: number
): ViewportSnapshotPayload {
  const metrics = computeViewportMetrics(cssWidth, cssHeight, rawDpr);
  const tier = classifyViewportTier(cssWidth, cssHeight, metrics.dpr);
  const safeInsets = computeSafeInsetsFloor(cssWidth, cssHeight);

  return {
    cssWidth,
    cssHeight,
    logicalWidth: metrics.logicalWidth,
    logicalHeight: metrics.logicalHeight,
    zoomFactor: metrics.zoomFactor,
    dpr: metrics.dpr,
    tier,
    safeInsets,
  };
}
