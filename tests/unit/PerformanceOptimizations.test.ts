/**
 * Safari / iPhone 15 Pro 战斗地图全链路性能优化契约单测
 * （tests/unit/PerformanceOptimizations.test.ts）。
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type Phaser from 'phaser';
import { DeterministicRng } from '../../src/core/DeterministicRng';
import {
  paddedPointHitsIndexedRects,
  pointHitsIndexedRects,
  selectRectCandidates,
  type SpatialRectLike,
} from '../../src/core/SpatialRectIndex';
import { ALL_ELITE_AFFIX_IDS } from '../../src/data/biomes.data';
import { createEnemyCrispHud } from '../../src/entities/enemies/EnemyCrispHud';
import { EnemyDirector } from '../../src/entities/enemies/EnemyDirector';
import { EnemyOverheadLabelMemo } from '../../src/entities/enemies/EnemyTypes';
import { KillMutationBatcher } from '../../src/storage/KillMutationBatcher';
import { generateBiomeDag } from '../../src/world/DagBiomeGenerator';
import { bakeStitchedWorldGeometry } from '../../src/world/DoorSocketStitcher';
import type { IWorldDisplayRegistrar } from '../../src/world/ParallaxComposer';
import { validateRoomChunkTemplate, type RoomChunkTemplate } from '../../src/world/RoomChunkSchema';

function loadAllChunksFromDisk(): readonly RoomChunkTemplate[] {
  const dir = path.resolve(process.cwd(), 'public/assets/tilemaps/chunks');
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8')) as {
    readonly chunks: readonly string[];
  };
  return manifest.chunks.map((id) =>
    validateRoomChunkTemplate(JSON.parse(fs.readFileSync(path.join(dir, `${id}.json`), 'utf8')))
  );
}

function createMockPhaserText() {
  const counts = { setText: 0, setColor: 0, setStroke: 0, setVisible: 0, setPosition: 0, setAlpha: 0 };
  const textObj = {
    setOrigin() { return textObj; },
    setDepth() { return textObj; },
    setScale() { return textObj; },
    setVisible() { counts.setVisible += 1; return textObj; },
    setText() { counts.setText += 1; return textObj; },
    setColor() { counts.setColor += 1; return textObj; },
    setStroke() { counts.setStroke += 1; return textObj; },
    setPosition() { counts.setPosition += 1; return textObj; },
    setAlpha() { counts.setAlpha += 1; return textObj; },
    destroy() {},
  };
  return { textObj, counts };
}

describe('SpatialRectIndex collision & LOS acceleration parity', () => {
  const allChunks = loadAllChunksFromDisk();

  it('matches brute-force point/padded queries across stitched biome solids and auto-rebuilds after splice', () => {
    const rng = new DeterministicRng(0x51a71a1);
    const dag = generateBiomeDag(rng, 'biome_01_slag_retort', allChunks);
    const baked = bakeStitchedWorldGeometry(dag.nodes, dag.bridges);
    expect(baked.solidRects.length).toBeGreaterThan(40);

    for (let x = 0; x <= 2600; x += 97) {
      for (let y = 0; y <= 640; y += 53) {
        const brute = baked.solidRects.some(
          (r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h
        );
        expect(pointHitsIndexedRects(x, y, baked.solidRects)).toBe(brute);

        const pad = 4;
        const brutePad = baked.solidRects.some(
          (w) => x + pad > w.x && x - pad < w.x + w.w && y + pad > w.y && y - pad < w.y + w.h
        );
        expect(paddedPointHitsIndexedRects(x, y, pad, baked.solidRects)).toBe(brutePad);
      }
    }

    const scratch: SpatialRectLike[] = [];
    const target = baked.solidRects[Math.floor(baked.solidRects.length / 2)]!;
    const cx = target.x + target.w * 0.5;
    const cy = target.y + target.h * 0.5;
    expect(pointHitsIndexedRects(cx, cy, baked.solidRects)).toBe(true);
    expect(selectRectCandidates(baked.solidRects, cx - 8, cy - 8, cx + 8, cy + 8, scratch)).toContain(
      target
    );

    // 模拟碎渣地板被震碎后原地 splice 移除碰撞体，验证 WeakMap 缓存按长度自动失效重建
    const targetIdx = baked.solidRects.indexOf(target);
    baked.solidRects.splice(targetIdx, 1);
    const stillOverlappedByOther = baked.solidRects.some(
      (r) => cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h
    );
    expect(pointHitsIndexedRects(cx, cy, baked.solidRects)).toBe(stillOverlappedByOther);
  });

  it('puts enemies beyond 1-hop room neighborhood into dormant mode while stepping active room enemies', () => {
    const rng = new DeterministicRng(0x9911aa22);
    const dag = generateBiomeDag(rng, 'biome_01_slag_retort', allChunks);
    const baked = bakeStitchedWorldGeometry(dag.nodes, dag.bridges);
    const director = new EnemyDirector(null, null, dag, rng);

    const activeCombatRoomId = dag.nodes.find((n) => n.chunk.enemySpawns.length > 0)!.nodeId;
    const neighborIds = new Set<string>([activeCombatRoomId]);
    for (const b of dag.bridges) {
      if (b.fromNodeId === activeCombatRoomId) neighborIds.add(b.toNodeId);
      if (b.toNodeId === activeCombatRoomId) neighborIds.add(b.fromNodeId);
    }
    const distantEnemy = director.enemies.find((e) => !neighborIds.has(e.roomId));
    const startEnemy = director.enemies.find((e) => e.roomId === activeCombatRoomId);
    expect(distantEnemy).toBeDefined();
    expect(startEnemy).toBeDefined();

    const dormantSpy = vi.spyOn(distantEnemy!, 'setDormantHidden');
    const startStepSpy = vi.spyOn(startEnemy!, 'stepFixed');

    director.stepFixed(
      1 / 120,
      startEnemy!.x,
      startEnemy!.y,
      1,
      false,
      baked.solidRects,
      () => 0,
      {
        onStrikePlayer: () => {},
        onSpawnProjectile: () => {},
        onSpawnAcidOrFireHazard: () => {},
      },
      undefined,
      activeCombatRoomId
    );

    expect(dormantSpy).toHaveBeenCalledTimes(1);
    expect(startStepSpy).toHaveBeenCalledTimes(1);
  });
});

describe('EnemyCrispHud 120Hz texture upload guard & KillMutationBatcher', () => {
  it('invokes Phaser Text.setText / setColor only on real state transitions instead of every tick', () => {
    const created: ReturnType<typeof createMockPhaserText>[] = [];
    const mockScene = {
      add: {
        text: () => {
          const m = createMockPhaserText();
          created.push(m);
          return m.textObj;
        },
      },
    } as unknown as Phaser.Scene;
    const mockReg = {
      registerCrispOverlay: <T,>(o: T) => o,
      unregister: () => {},
    } as unknown as IWorldDisplayRegistrar;

    const hud = createEnemyCrispHud(mockScene, mockReg, 320, 240);
    const memo = new EnemyOverheadLabelMemo();
    const [badgeMock, statusMock] = created;
    statusMock!.counts.setVisible = 0;
    badgeMock!.counts.setVisible = 0;

    for (let tick = 0; tick < 120; tick++) {
      const label = memo.resolve({
        isBoss: false,
        isElite: true,
        eliteAffixes: [ALL_ELITE_AFFIX_IDS[0]!],
        isShielded: false,
        isStunned: false,
        hp: 180,
        maxHp: 180,
        embeddedArrows: 0,
        statusBadge: '',
      });
      hud.sync(320.2, 240.1, 44, 'NONE', (tick & 8) === 0, label, false, true, true);
    }

    expect(statusMock!.counts.setText).toBe(1);
    expect(statusMock!.counts.setColor).toBe(1);
    expect(statusMock!.counts.setPosition).toBe(1);
    expect(badgeMock!.counts.setColor).toBe(0);
    expect(badgeMock!.counts.setText).toBe(0);
  });

  it('batches rapid enemy kills in memory and drains atomically on timeout or emergency flush', () => {
    vi.useFakeTimers();
    let flushedCount = 0;
    const batcher = new KillMutationBatcher(() => {
      flushedCount += 1;
    }, 2000);

    batcher.recordKill('mob_01_slag_hound');
    batcher.recordKill('mob_01_slag_hound');
    batcher.recordKill('mob_03_retort_fusilier');
    expect(batcher.hasPending).toBe(true);

    vi.advanceTimersByTime(1500);
    expect(flushedCount).toBe(0);

    const drained = batcher.drainBatch();
    expect(drained).toEqual({ mob_01_slag_hound: 2, mob_03_retort_fusilier: 1 });
    expect(batcher.hasPending).toBe(false);

    vi.advanceTimersByTime(2000);
    expect(flushedCount).toBe(0);
    vi.useRealTimers();
  });
});
