/**
 * 零 GC 帧精确近战攻击盒（AABB / 招架扇形 / 电弧链式索敌）管理器（src/combat/HitboxManager.ts）。
 *
 * 严格遵循单向依赖与战斗热路径零分配铁律：
 * - 全部活跃判定盒经 ObjectPool 预分配，内置定长数组多帧去重（严禁热路径 new Set）；
 * - 统一输出近战命中、正面塔盾弹刀与星盘电弧法杖 4 目标跳变轨迹。
 */

import { ObjectPool, type IPoolable } from '../core/ObjectPool';
import { COMBAT_CONSTANTS, type Milestone5WeaponId } from '../data/weapons.data';
import type {
  CombatTargetView,
  ResolvedWeaponHit,
  VoltaicChainSegment,
} from './CombatTypes';
import { solveVoltaicArcPulse } from './VoltaicChainSolver';

export type { CombatTargetView, ResolvedWeaponHit, VoltaicChainSegment };

const MAX_DEDUP_TARGETS = 16;

class PooledMeleeHitbox implements IPoolable {
  public weaponId: Milestone5WeaponId = 'wpn_rust_scalpel';
  public stageIndex = 0;
  public centerX = 0;
  public centerY = 0;
  public halfW = 16;
  public halfH = 12;
  public ticksRemaining = 0;
  public bypassFrontShield = false;
  public forceParryCrit = false;
  public readonly hitTargetIds: string[] = new Array<string>(MAX_DEDUP_TARGETS).fill('');
  public hitCount = 0;

  public hasAlreadyHit(targetId: string): boolean {
    for (let i = 0; i < this.hitCount; i++) {
      if (this.hitTargetIds[i] === targetId) return true;
    }
    return false;
  }

  public markHit(targetId: string): void {
    if (this.hitCount < MAX_DEDUP_TARGETS) {
      this.hitTargetIds[this.hitCount] = targetId;
      this.hitCount += 1;
    }
  }

  public reset(): void {
    this.ticksRemaining = 0;
    this.bypassFrontShield = false;
    this.forceParryCrit = false;
    this.hitCount = 0;
  }
}

export class HitboxManager {
  private readonly pool: ObjectPool<PooledMeleeHitbox>;
  private activeSwingBox: PooledMeleeHitbox | null = null;
  private readonly scratchHits: ResolvedWeaponHit[] = [];
  private readonly scratchChainVisited: string[] = new Array<string>(8).fill('');

  public constructor() {
    this.pool = new ObjectPool<PooledMeleeHitbox>(() => new PooledMeleeHitbox(), 16, 64);
  }

  public get activeHitboxCount(): number {
    return this.pool.activeCount;
  }

  /** 开启一次跟随主角挥砍阶段的持续帧判定盒（同段挥砍内对每个敌人至多结算 1 次） */
  public beginPlayerSwingBox(
    weaponId: Milestone5WeaponId,
    stageIndex: number,
    centerX: number,
    centerY: number,
    widthPx: number,
    heightPx: number,
    activeTicks: number
  ): void {
    this.cancelPlayerSwingBox();
    const box = this.pool.acquire();
    box.weaponId = weaponId;
    box.stageIndex = stageIndex;
    box.centerX = centerX;
    box.centerY = centerY;
    box.halfW = widthPx * 0.5;
    box.halfH = heightPx * 0.5;
    box.ticksRemaining = Math.max(1, activeTicks);
    box.bypassFrontShield = false;
    box.forceParryCrit = false;
    this.activeSwingBox = box;
  }

  public syncPlayerSwingPosition(centerX: number, centerY: number): void {
    if (this.activeSwingBox) {
      this.activeSwingBox.centerX = centerX;
      this.activeSwingBox.centerY = centerY;
    }
  }

  public cancelPlayerSwingBox(): void {
    if (this.activeSwingBox) {
      this.pool.release(this.activeSwingBox);
      this.activeSwingBox = null;
    }
  }

  /** 触发盾牌黄金招架成功的正前方必暴冲击波（支持矿渣圆盾与水银镜面圣盾） */
  public spawnBucklerParryShockwave(
    originX: number,
    originY: number,
    facing: -1 | 1,
    shieldWeaponId: 'wpn_slag_buckler' | 'wpn_mirror_aegis' = 'wpn_slag_buckler'
  ): void {
    const reach = COMBAT_CONSTANTS.BUCKLER_PARRY_SHOCKWAVE_PX;
    const box = this.pool.acquire();
    box.weaponId = shieldWeaponId;
    box.stageIndex = 0;
    box.centerX = originX + facing * (reach * 0.5);
    box.centerY = originY - 18;
    box.halfW = reach * 0.5;
    box.halfH = 28;
    box.ticksRemaining = 4;
    box.bypassFrontShield = true;
    box.forceParryCrit = true;
  }

  public resolveVoltaicArcPulse(
    originX: number,
    originY: number,
    facing: -1 | 1,
    targets: readonly CombatTargetView[],
    outSegments: VoltaicChainSegment[]
  ): readonly ResolvedWeaponHit[] {
    return solveVoltaicArcPulse(
      originX,
      originY,
      facing,
      targets,
      this.scratchChainVisited,
      this.scratchHits,
      outSegments
    );
  }

  /** 在每个 120Hz 逻辑帧检测所有活跃判定盒与目标的碰撞重叠 */
  public stepFixed(
    attackerX: number,
    targets: readonly CombatTargetView[],
    stageBreachLookup: (weaponId: Milestone5WeaponId, stageIndex: number) => number
  ): readonly ResolvedWeaponHit[] {
    this.scratchHits.length = 0;

    this.pool.forEachActive((box) => {
      const bLeft = box.centerX - box.halfW;
      const bRight = box.centerX + box.halfW;
      const bTop = box.centerY - box.halfH;
      const bBot = box.centerY + box.halfH;
      const breach = stageBreachLookup(box.weaponId, box.stageIndex);

      for (let i = 0; i < targets.length; i++) {
        const t = targets[i]!;
        if (!t.isAlive || box.hasAlreadyHit(t.id)) continue;

        const tHalfW = t.width * 0.5;
        const tLeft = t.x - tHalfW;
        const tRight = t.x + tHalfW;
        const tTop = t.y - t.height;
        const tBot = t.y;

        if (bRight <= tLeft || bLeft >= tRight || bBot <= tTop || bTop >= tBot) {
          continue;
        }

        box.markHit(t.id);
        const frontBlocked =
          t.hasFrontShield &&
          !t.isStunned &&
          !box.bypassFrontShield &&
          breach < 1.5 &&
          (attackerX - t.x) * t.facing >= 0;

        this.scratchHits.push({
          weaponId: box.weaponId,
          stageIndex: box.stageIndex,
          targetId: t.id,
          impactX: (Math.max(bLeft, tLeft) + Math.min(bRight, tRight)) * 0.5,
          impactY: (Math.max(bTop, tTop) + Math.min(bBot, tBot)) * 0.5,
          blockedByFrontShield: frontBlocked,
          bypassFrontShield: box.bypassFrontShield,
          chainBounceIndex: 0,
          forceParryCrit: box.forceParryCrit,
        });
      }

      box.ticksRemaining -= 1;
      if (box.ticksRemaining <= 0) {
        if (this.activeSwingBox === box) {
          this.activeSwingBox = null;
        }
        this.pool.release(box);
      }
    });

    return this.scratchHits;
  }

  public releaseAll(): void {
    this.activeSwingBox = null;
    this.pool.releaseAll();
  }
}
