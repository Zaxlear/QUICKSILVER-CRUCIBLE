/**
 * 战斗击杀图鉴计数防抖批处理器（src/storage/KillMutationBatcher.ts）。
 *
 * 将高频连续击杀产生的 `save:mutate_meta` 请求聚合为 2,000ms 窗口批量写盘，
 * 同时支持页面隐藏/云同步/房间检查点时的 0ms 立即同步排空（零数据丢失）。
 */

export class KillMutationBatcher {
  private readonly counts: Record<string, number> = {};
  private dirty = false;
  private timerId: ReturnType<typeof setTimeout> | null = null;

  public constructor(
    private readonly onFlushTimeout: () => void,
    private readonly debounceMs = 2000
  ) {}

  public get hasPending(): boolean {
    return this.dirty;
  }

  public recordKill(archetypeId: string): void {
    this.counts[archetypeId] = (this.counts[archetypeId] ?? 0) + 1;
    this.dirty = true;
    if (this.timerId !== null) clearTimeout(this.timerId);
    this.timerId = setTimeout(this.onFlushTimeout, this.debounceMs);
  }

  public drainBatch(): Record<string, number> | null {
    this.cancelTimer();
    if (!this.dirty) return null;
    const snapshot = { ...this.counts };
    for (const key of Object.keys(this.counts)) {
      delete this.counts[key];
    }
    this.dirty = false;
    return snapshot;
  }

  public cancelTimer(): void {
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }
}
