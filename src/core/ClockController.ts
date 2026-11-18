import { FIXED_STEP_SEC, MAX_ACCUMULATOR_SEC } from './Constants';

export { FIXED_STEP_SEC, MAX_ACCUMULATOR_SEC };

/**
 * 60Hz / 120Hz ProMotion 自适应固定步长主循环控制器。
 * 支持分级顿帧（Hit-Stop）、时间缩放（TimeScale）与竖屏/菜单 0ms 瞬时暂停恢复。
 */
export class ClockController {
  private accumulatorSec = 0;
  private hitStopRemainingSec = 0;
  private timeScale = 1.0;
  private paused = false;
  private fixedTickCounter = 0;

  public get totalFixedTicks(): number {
    return this.fixedTickCounter;
  }

  public get isPaused(): boolean {
    return this.paused;
  }

  public get isHitStopActive(): boolean {
    return this.hitStopRemainingSec > 0;
  }

  public get hitStopRemainingMs(): number {
    return this.hitStopRemainingSec * 1000;
  }

  public get currentTimeScale(): number {
    return this.timeScale;
  }

  /** 同帧多次命中取最长顿帧时长，避免无限叠加锁死 */
  public triggerHitStop(durationMs: number): void {
    if (durationMs <= 0) return;
    this.hitStopRemainingSec = Math.max(this.hitStopRemainingSec, durationMs / 1000);
  }

  public setTimeScale(scale: number): void {
    this.timeScale = Math.min(Math.max(scale, 0), 4.0);
  }

  /** 系统级/竖屏握持暂停：冻结累加器与顿帧倒计时，切回横屏后 0ms 恢复 */
  public setPaused(paused: boolean): void {
    this.paused = paused;
  }

  public reset(): void {
    this.accumulatorSec = 0;
    this.hitStopRemainingSec = 0;
    this.timeScale = 1.0;
    this.paused = false;
    this.fixedTickCounter = 0;
  }

  public tick(
    rawDeltaMs: number,
    fixedSimStep: (dtSec: number) => void,
    renderInterpolate: (alpha: number, hitStopActive: boolean) => void
  ): number {
    if (this.paused) {
      const frozenAlpha = this.accumulatorSec / FIXED_STEP_SEC;
      renderInterpolate(frozenAlpha, this.hitStopRemainingSec > 0);
      return 0;
    }

    const clampedSec = Math.min(Math.max(rawDeltaMs / 1000, 0), MAX_ACCUMULATOR_SEC);

    if (this.hitStopRemainingSec > 0) {
      this.hitStopRemainingSec = Math.max(0, this.hitStopRemainingSec - clampedSec);
      renderInterpolate(1.0, true);
      return 0;
    }

    this.accumulatorSec += clampedSec * this.timeScale;
    let stepsExecuted = 0;

    // 浮点边界容差保护：避免 16.6666667ms = 2 * (1/120) 因 IEEE-754 尾数误差少跑 1 步
    const EPSILON_SEC = 1e-7;
    while (this.accumulatorSec + EPSILON_SEC >= FIXED_STEP_SEC) {
      fixedSimStep(FIXED_STEP_SEC);
      this.accumulatorSec = Math.max(0, this.accumulatorSec - FIXED_STEP_SEC);
      this.fixedTickCounter += 1;
      stepsExecuted += 1;
    }

    const alpha = Math.min(1, Math.max(0, this.accumulatorSec / FIXED_STEP_SEC));
    renderInterpolate(alpha, false);
    return stepsExecuted;
  }
}
