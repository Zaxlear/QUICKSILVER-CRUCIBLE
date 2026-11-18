export interface IPoolable {
  /** 回收归池时重置状态、隐藏精灵并休眠物理碰撞盒 */
  reset(): void;
}

/**
 * 战斗热路径零 GC 泛型预分配对象池。
 * 采用紧凑活跃槽位交换弹出（Swap-and-Pop）与空闲栈，在 acquire/release/forEachActive 中零临时数组分配。
 */
export class ObjectPool<T extends IPoolable> {
  private readonly freeStack: T[] = [];
  private readonly activeList: T[] = [];
  private readonly activeIndexMap = new Map<T, number>();
  private readonly factory: () => T;
  private readonly maxCapacity: number;

  public constructor(factory: () => T, initialCapacity = 64, maxCapacity = 512) {
    this.factory = factory;
    this.maxCapacity = Math.max(initialCapacity, maxCapacity);

    for (let i = 0; i < initialCapacity; i++) {
      const item = this.factory();
      item.reset();
      this.freeStack.push(item);
    }
  }

  public get activeCount(): number {
    return this.activeList.length;
  }

  public get freeCount(): number {
    return this.freeStack.length;
  }

  public get totalAllocated(): number {
    return this.activeList.length + this.freeStack.length;
  }

  public acquire(): T {
    let item = this.freeStack.pop();
    if (!item) {
      if (this.totalAllocated < this.maxCapacity) {
        item = this.factory();
      } else {
        // 达容量硬顶时强制回收最老的活跃实例复用，杜绝帧尖峰无限膨胀
        const oldest = this.activeList[0];
        if (!oldest) {
          item = this.factory();
        } else {
          this.release(oldest);
          item = this.freeStack.pop()!;
        }
      }
    }

    const idx = this.activeList.length;
    this.activeList.push(item);
    this.activeIndexMap.set(item, idx);
    return item;
  }

  public release(item: T): boolean {
    const idx = this.activeIndexMap.get(item);
    if (idx === undefined) {
      return false;
    }

    const lastIdx = this.activeList.length - 1;
    const lastItem = this.activeList[lastIdx]!;

    if (idx !== lastIdx) {
      this.activeList[idx] = lastItem;
      this.activeIndexMap.set(lastItem, idx);
    }

    this.activeList.pop();
    this.activeIndexMap.delete(item);

    item.reset();
    this.freeStack.push(item);
    return true;
  }

  public forEachActive(callback: (item: T, index: number) => void): void {
    // 倒序遍历允许回调内部安全调用 release(item)
    for (let i = this.activeList.length - 1; i >= 0; i--) {
      const item = this.activeList[i];
      if (item !== undefined) {
        callback(item, i);
      }
    }
  }

  public releaseAll(): void {
    for (let i = this.activeList.length - 1; i >= 0; i--) {
      const item = this.activeList[i]!;
      item.reset();
      this.freeStack.push(item);
    }
    this.activeList.length = 0;
    this.activeIndexMap.clear();
  }
}
