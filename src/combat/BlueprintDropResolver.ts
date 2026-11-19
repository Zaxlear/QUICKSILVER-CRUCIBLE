/**
 * 怪物击杀金币分拆计算、12 物种秘银蓝图卷轴爆落判定与世界卷轴拾取控制器
 * （src/combat/BlueprintDropResolver.ts）。
 *
 * 严格使用 RNG_CHANNEL_HASH.GOLD_AND_BLUEPRINT 专享子流，绝不污染关卡拓扑或词条抽签（<= 165 行）。
 */

import type Phaser from 'phaser';
import { DepthLayer } from '../core/Constants';
import type { DeterministicRng } from '../core/DeterministicRng';
import { EventBus } from '../core/EventBus';
import type { NarrativeSessionStore } from '../core/NarrativeSessionStore';
import { ENEMY_CATALOG, type EnemyId } from '../data/biomes.data';
import { BLUEPRINT_BY_ID, ECONOMY_CONSTANTS, type BlueprintUnlockSpec } from '../data/economy.data';

export interface GoldDropRollResult {
  readonly totalGold: number;
  readonly chunks: readonly number[];
  readonly isNugget: boolean;
}

export interface BlueprintDisplayRegistrar {
  registerWorldLit<T extends Phaser.GameObjects.GameObject>(obj: T): T;
  unregister(obj: Phaser.GameObjects.GameObject): void;
  spawnLightFlash(x: number, y: number, color: number, radius: number, peak: number, durationMs: number): void;
}

function splitGoldIntoChunks(total: number, count: number): readonly number[] {
  const safeCount = Math.max(1, count);
  const base = Math.floor(total / safeCount);
  const rem = total - base * safeCount;
  const out: number[] = [];
  for (let i = 0; i < safeCount; i++) out.push(base + (i < rem ? 1 : 0));
  return out;
}

/** 精确计算单只怪物或 Boss 阵亡爆出的金币总额与物理金块分拆数组（docs/06 §2.2） */
export function rollEnemyGoldDrop(
  goldRng: DeterministicRng,
  params: {
    readonly biomeDepth: 1 | 2 | 3 | 4;
    readonly crucibleHeat: number;
    readonly isElite: boolean;
    readonly bossId?: 'boss_01_furnace_warden' | 'boss_02_grand_alchemist';
  }
): GoldDropRollResult {
  if (params.bossId === 'boss_01_furnace_warden' || params.bossId === 'boss_02_grand_alchemist') {
    const total = params.bossId === 'boss_01_furnace_warden' ? ECONOMY_CONSTANTS.BOSS_1_FIXED_GOLD : ECONOMY_CONSTANTS.BOSS_2_FIXED_GOLD;
    return { totalGold: total, chunks: splitGoldIntoChunks(total, ECONOMY_CONSTANTS.BOSS_COIN_SPLIT_COUNT), isNugget: true };
  }
  const d = Math.max(1, Math.min(4, Math.floor(params.biomeDepth)));
  const h = Math.max(0, Math.min(5, Math.floor(params.crucibleHeat)));
  const u = ECONOMY_CONSTANTS.ENEMY_GOLD_VARIANCE_MIN + goldRng.nextFloat() * (ECONOMY_CONSTANTS.ENEMY_GOLD_VARIANCE_MAX - ECONOMY_CONSTANTS.ENEMY_GOLD_VARIANCE_MIN);
  const rankMult = params.isElite ? ECONOMY_CONSTANTS.ELITE_RANK_GOLD_MULT : ECONOMY_CONSTANTS.NORMAL_RANK_GOLD_MULT;
  const totalGold = Math.max(
    1,
    Math.round((ECONOMY_CONSTANTS.ENEMY_GOLD_BASE_FLAT + ECONOMY_CONSTANTS.ENEMY_GOLD_DEPTH_STEP * d) * (1 + ECONOMY_CONSTANTS.ENEMY_GOLD_HEAT_STEP * h) * rankMult * u)
  );
  if (!params.isElite) return { totalGold, chunks: [totalGold], isNugget: false };
  const count = goldRng.nextInt(ECONOMY_CONSTANTS.ELITE_COIN_SPLIT_MIN, ECONOMY_CONSTANTS.ELITE_COIN_SPLIT_MAX);
  return { totalGold, chunks: splitGoldIntoChunks(totalGold, count), isNugget: true };
}

/** 按物种配表判定是否爆出未解锁且未携带的秘银蓝图卷轴（普通 14% / 精英 50%） */
export function rollEnemyBlueprintDrop(
  goldRng: DeterministicRng,
  params: { readonly speciesId: EnemyId; readonly isElite: boolean },
  store: NarrativeSessionStore
): BlueprintUnlockSpec | null {
  const bpId = ENEMY_CATALOG[params.speciesId]?.blueprintDropId;
  if (!bpId || store.isBlueprintUnlockedOrRegistered(bpId)) return null;
  const chance = params.isElite ? ECONOMY_CONSTANTS.ELITE_BLUEPRINT_DROP_CHANCE : ECONOMY_CONSTANTS.NORMAL_BLUEPRINT_DROP_CHANCE;
  return goldRng.nextBool(chance) ? (BLUEPRINT_BY_ID[bpId] ?? null) : null;
}

export interface WorldBlueprintScrollOrb {
  readonly spec: BlueprintUnlockSpec;
  x: number;
  y: number;
  vy: number;
  readonly floorY: number;
  collected: boolean;
  readonly sprite: Phaser.GameObjects.Sprite | null;
}

export class BlueprintScrollWorldPool {
  public readonly activeScrolls: WorldBlueprintScrollOrb[] = [];
  private animSec = 0;

  public constructor(
    private readonly scene: Phaser.Scene | null,
    private readonly registrar: BlueprintDisplayRegistrar | null,
    private readonly store: NarrativeSessionStore
  ) {}

  public spawnScroll(spec: BlueprintUnlockSpec, x: number, floorY: number): void {
    const sprite = this.scene && this.registrar
      ? this.registrar.registerWorldLit(this.scene.add.sprite(x, floorY - 14, 'world_props_atlas', 'blueprint_scroll_0').setDepth(DepthLayer.LOOT + 1).setPipeline('Light2D'))
      : null;
    this.registrar?.spawnLightFlash(x, floorY - 18, 0x38bdf8, 195, 2.5, 280);
    this.activeScrolls.push({ spec, x, y: floorY - 14, vy: -185, floorY, collected: false, sprite });
  }

  public stepFixed(dtSec: number, playerX: number, playerY: number, onPickedUp: (spec: BlueprintUnlockSpec, x: number, y: number) => void): void {
    this.animSec += dtSec;
    const bit = (Math.floor(this.animSec * 5) & 1) as 0 | 1;
    for (const s of this.activeScrolls) {
      if (s.collected) continue;
      if (s.y < s.floorY - 12 || s.vy < 0) {
        s.vy += 680 * dtSec;
        s.y = Math.min(s.floorY - 12, s.y + s.vy * dtSec);
      }
      const dx = playerX - s.x;
      const dy = playerY - 16 - s.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= 84 && dist > 1) {
        s.x += (dx / dist) * 260 * dtSec;
        s.y += (dy / dist) * 260 * dtSec;
      }
      s.sprite?.setPosition(s.x, s.y + Math.sin(this.animSec * 4) * 2).setFrame(`blueprint_scroll_${bit}`);
      if (dist <= 26) {
        s.collected = true;
        s.sprite?.setVisible(false);
        if (this.store.stageCarriedBlueprint(s.spec.blueprintId)) {
          EventBus.emit('audio:sfx_requested', { sfxId: 'sfx_scroll_upgrade', worldX: s.x });
          onPickedUp(s.spec, s.x, s.y);
        }
      }
    }
  }

  public destroy(): void {
    for (const s of this.activeScrolls) if (s.sprite && this.registrar) { this.registrar.unregister(s.sprite); s.sprite.destroy(); }
    this.activeScrolls.length = 0;
  }
}
