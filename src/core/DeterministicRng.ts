export interface RngSnapshot {
  readonly seed: number;
  readonly internalState: number;
  readonly stepCount: number;
}

/**
 * Mulberry32 确定性 32 位伪随机数生成器。
 * 支持跨设备状态快照序列化与独立通道子流派生，杜绝非确定性随机源。
 */
export class DeterministicRng {
  public readonly seed: number;
  private state: number;
  private steps: number;

  public constructor(seed: number, internalState?: number, stepCount = 0) {
    this.seed = seed >>> 0;
    this.state = (internalState !== undefined ? internalState : seed) >>> 0;
    this.steps = Math.max(0, Math.floor(stepCount));
  }

  public static fromSnapshot(snap: RngSnapshot): DeterministicRng {
    return new DeterministicRng(snap.seed, snap.internalState, snap.stepCount);
  }

  public get stepCount(): number {
    return this.steps;
  }

  public get internalState(): number {
    return this.state >>> 0;
  }

  public serialize(): RngSnapshot {
    return {
      seed: this.seed,
      internalState: this.state >>> 0,
      stepCount: this.steps,
    };
  }

  /** 生成 [0, 4294967295] 无符号 32 位确定性整数 */
  public nextUint32(): number {
    this.steps += 1;
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  }

  /** 生成 [0, 1) 半开区间均匀分布 32 位确定性浮点数 */
  public nextFloat(): number {
    return this.nextUint32() / 4294967296;
  }

  /** 生成 [min, max] 闭区间确定性整数 */
  public nextInt(min: number, max: number): number {
    const lo = Math.ceil(Math.min(min, max));
    const hi = Math.floor(Math.max(min, max));
    return Math.floor(this.nextFloat() * (hi - lo + 1)) + lo;
  }

  /** 按给定概率 [0, 1] 返回确定性布尔值 */
  public nextBool(probability = 0.5): boolean {
    if (probability <= 0) return false;
    if (probability >= 1) return true;
    return this.nextFloat() < probability;
  }

  /** 派生子模块独立确定性随机流，不消耗父流 stepCount */
  public fork(channelHash: number): DeterministicRng {
    const mixed = (this.state ^ Math.imul(channelHash >>> 0, 0x9e3779b1)) >>> 0;
    return new DeterministicRng(mixed);
  }

  /** 从非空只读数组中确定性抽取一项 */
  public pick<T>(items: readonly T[]): T {
    if (items.length === 0) {
      throw new Error('DeterministicRng.pick called on empty array');
    }
    const idx = this.nextInt(0, items.length - 1);
    return items[idx]!;
  }

  /** 原地执行确定性 Fisher-Yates 洗牌 */
  public shuffleInPlace<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = this.nextInt(0, i);
      const tmp = items[i]!;
      items[i] = items[j]!;
      items[j] = tmp;
    }
    return items;
  }
}
