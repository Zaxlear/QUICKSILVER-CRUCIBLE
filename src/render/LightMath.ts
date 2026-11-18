/**
 * Light2D 动态点光源纯数学计算函数（零状态、零 Math.random，支持独立确定性单测）。
 */

/**
 * 计算炼金火把双频正弦摇曳强度与半径：
 * I(t) = I0 * (1 + A * (0.6*sin(7.3t + phi) + 0.4*sin(17.9t + 2*phi)))
 * R(t) = R0 * (1 + 0.05 * sin(11.1t + phi))
 */
export function evaluateTorchFlicker(
  baseIntensity: number,
  baseRadiusPx: number,
  amplitude: number,
  timeSec: number,
  phaseRad: number
): { readonly intensity: number; readonly radiusPx: number } {
  const wave =
    0.6 * Math.sin(7.3 * timeSec + phaseRad) + 0.4 * Math.sin(17.9 * timeSec + 2.0 * phaseRad);
  const intensity = Math.max(0, baseIntensity * (1.0 + amplitude * wave));
  const radiusPx = Math.max(1, baseRadiusPx * (1.0 + 0.05 * Math.sin(11.1 * timeSec + phaseRad)));
  return { intensity, radiusPx };
}

/**
 * 由世界坐标确定性派生相位角（弧度 0 ~ 6.283，严禁使用 Math.random）
 */
export function deriveDeterministicPhase(x: number, y: number, salt = 0): number {
  const hash =
    Math.imul(Math.round(x) * 73856093, 1) ^ Math.imul(Math.round(y) * 19349663, 1) ^ salt;
  return ((hash >>> 0) % 6283) * 0.001;
}
