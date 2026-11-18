/**
 * 敌方 AI 家族共享运行时契约与步进上下文定义（src/entities/enemies/EnemyTypes.ts）。
 */

import type Phaser from 'phaser';
import type { SolidWallRect } from '../../combat/CombatTypes';
import { DepthLayer } from '../../core/Constants';
import { ELITE_AFFIX_CATALOG, ELITE_SCALING, type EliteAffixId, type EnemyId } from '../../data/biomes.data';
import type { IWorldDisplayRegistrar } from '../../world/ParallaxComposer';
import type { BaseEnemy } from './BaseEnemy';

export function spawnEnemyLitSprite(
  scene: Phaser.Scene | null,
  registrar: IWorldDisplayRegistrar | null,
  init: EnemySpawnInit,
  framePrefix: string,
  isElite: boolean,
  isClone: boolean
): { readonly sprite: Phaser.GameObjects.Sprite | null; readonly initialFrameKey: string } {
  const atlasKey = init.atlasKey ?? 'enemies_roster_atlas';
  const initialFrameKey =
    atlasKey === 'bosses_atlas' ? `${framePrefix}_p1_idle_0` : `${framePrefix}_idle_0`;
  if (!scene || !registrar) return { sprite: null, initialFrameKey };
  const sc = isElite ? ELITE_SCALING.SCALE_MULTIPLIER : 1.0;
  const sprite = registrar.registerWorldLit(
    scene.add
      .sprite(init.x, init.y, atlasKey, initialFrameKey)
      .setOrigin(0.5, 1.0)
      .setScale(sc)
      .setAlpha(isClone ? 0.58 : 1.0)
      .setDepth(DepthLayer.ENEMIES)
      .setPipeline('Light2D')
  );
  if (isClone) sprite.setTint(0x9aa5b8);
  return { sprite, initialFrameKey };
}

export function formatEnemyOverheadLabel(params: {
  readonly isBoss: boolean;
  readonly isElite: boolean;
  readonly eliteAffixes: readonly EliteAffixId[];
  readonly isShielded: boolean;
  readonly isStunned: boolean;
  readonly hp: number;
  readonly maxHp: number;
  readonly embeddedArrows: number;
  readonly statusBadge: string;
}): string {
  if (params.isBoss) return params.isStunned ? 'STUN!' : params.statusBadge;
  const elitePrefix = params.isElite
    ? `★${params.eliteAffixes.map((a) => ELITE_AFFIX_CATALOG[a].badgeZh).join('·')} `
    : '';
  return `${elitePrefix}${params.isShielded ? '⛨WARD ' : ''}${params.isStunned ? 'STUN! ' : ''}${params.hp}/${params.maxHp}${params.embeddedArrows > 0 ? ` ➴${params.embeddedArrows}` : ''}${params.statusBadge ? ` [${params.statusBadge}]` : ''}`;
}

export class EnemyOverheadLabelMemo {
  private lastHp = -1;
  private lastShielded = false;
  private lastStunned = false;
  private lastArrows = -1;
  private lastBadge = '\u0000';
  private cached = '';

  public resolve(params: Parameters<typeof formatEnemyOverheadLabel>[0]): string {
    if (
      params.hp !== this.lastHp ||
      params.isShielded !== this.lastShielded ||
      params.isStunned !== this.lastStunned ||
      params.embeddedArrows !== this.lastArrows ||
      params.statusBadge !== this.lastBadge
    ) {
      this.lastHp = params.hp;
      this.lastShielded = params.isShielded;
      this.lastStunned = params.isStunned;
      this.lastArrows = params.embeddedArrows;
      this.lastBadge = params.statusBadge;
      this.cached = formatEnemyOverheadLabel(params);
    }
    return this.cached;
  }
}

export interface EnemySpawnInit {
  readonly id: string;
  readonly speciesId: EnemyId;
  readonly roomId: string;
  readonly x: number;
  readonly y: number;
  readonly patrolMinX: number;
  readonly patrolMaxX: number;
  readonly hpScale?: number;
  readonly damageScale?: number;
  readonly isElite?: boolean;
  readonly eliteAffixes?: readonly EliteAffixId[];
  readonly isClone?: boolean;
  readonly evergreenRespawn?: boolean;
  readonly atlasKey?: string;
  readonly framePrefix?: string;
  readonly overrideBaseHp?: number;
  readonly overrideBasePoise?: number;
}

export interface EnemyHitOutcome {
  readonly killed: boolean;
  readonly triggeredBreachStun: boolean;
  readonly blockedByWard: boolean;
  readonly thornsReflectedDamage: number;
}

export interface EnemyViewBounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export interface EnemyStepContext {
  readonly dtSec: number;
  readonly dtMs: number;
  readonly playerX: number;
  readonly playerY: number;
  readonly playerFacing: -1 | 1;
  readonly playerStealthed: boolean;
  readonly solidRects: readonly SolidWallRect[];
  readonly roomAllies: readonly BaseEnemy[];
  readonly viewBounds?: EnemyViewBounds;
  onStrikePlayer: (
    damage: number,
    dirX: -1 | 1,
    parriable: boolean,
    source: BaseEnemy,
    rootSec?: number
  ) => void;
  onSpawnProjectile: (
    sourceId: string,
    ox: number,
    oy: number,
    vx: number,
    vy: number,
    damage: number,
    gravityY: number,
    kind: 'ENEMY_FLASK' | 'ENEMY_ACID_GLOB' | 'ENEMY_ASTRAL_BLADE'
  ) => void;
  onSpawnAcidOrFireHazard: (
    worldX: number,
    worldY: number,
    radiusPx: number,
    isPoisonCloud: boolean
  ) => void;
  onDrawBeam?: (
    kind: 'PRELATE_TETHER' | 'WEAVER_RAY',
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    hot: boolean
  ) => void;
  onDrawGroundEffect?: (
    kind: 'SPIKE_WARN' | 'SPIKE_ERUPT' | 'GRAVITY_SIGIL' | 'EXECUTOR_WAVE',
    x: number,
    y: number
  ) => void;
}
