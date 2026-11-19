import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { FIXED_STEP_SEC } from '../../src/core/ClockController';
import { TILE_SIZE_PX } from '../../src/core/Constants';
import { DeterministicRng } from '../../src/core/DeterministicRng';
import { ALL_BIOME_IDS } from '../../src/data/biomes.data';
import { BIOME_DAG_CONFIGS } from '../../src/data/runes.data';
import { PlayerEntity } from '../../src/entities/player/PlayerEntity';
import { ActionMap } from '../../src/input/ActionMap';
import { GamepadProvider } from '../../src/input/GamepadProvider';
import { KeyboardMouseProvider } from '../../src/input/KeyboardMouseProvider';
import { TouchVirtualPadProvider } from '../../src/input/TouchVirtualPadProvider';
import { buildViewportSnapshot } from '../../src/render/ViewportScaler';
import { generateBiomeDag } from '../../src/world/DagBiomeGenerator';
import { bakeStitchedWorldGeometry } from '../../src/world/DoorSocketStitcher';
import { composeMinimapSnapshot } from '../../src/world/MinimapProjection';
import {
  validateRoomChunkTemplate,
  verifyChunkInternalReachability,
  type RoomChunkTemplate,
} from '../../src/world/RoomChunkSchema';
import { computeTrapActiveHitbox, evaluateTrapPhase } from '../../src/world/TrapKinematics';
import {
  ALL_RUNE_IDS,
  ATHANOR_FORGE_UPGRADES,
  EXPLORATION_RUNES,
  PLAYER_KINEMATICS_Check,
} from './topologyTestHelpers';

function loadAllChunksFromDisk(): readonly RoomChunkTemplate[] {
  const dir = path.resolve(process.cwd(), 'public/assets/tilemaps/chunks');
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8')) as {
    readonly chunks: readonly string[];
  };
  return manifest.chunks.map((id) => {
    const raw = JSON.parse(fs.readFileSync(path.join(dir, `${id}.json`), 'utf8')) as unknown;
    return validateRoomChunkTemplate(raw);
  });
}

describe('Milestone 4 & 7 — 55-Chunk Multi-Biome Library, 2,000-Seed DAG Stitcher & 4 Runes', () => {
  const allChunks = loadAllChunksFromDisk();

  it('validates all 55 handcrafted RoomChunk templates across all 4 biomes and kinematic envelopes', () => {
    expect(allChunks).toHaveLength(55);

    for (const c of allChunks) {
      expect(c.widthTiles).toBeGreaterThanOrEqual(40);
      expect(c.heightTiles).toBeGreaterThanOrEqual(30);
      const reach = verifyChunkInternalReachability(c);
      expect(reach).toEqual({ ok: true });
    }

    expect(allChunks.filter((c) => c.biomePool.includes('biome_01_slag_retort'))).toHaveLength(13);
    expect(allChunks.filter((c) => c.biomePool.includes('biome_02_vitriol_sewers'))).toHaveLength(14);
    expect(allChunks.filter((c) => c.biomePool.includes('biome_03_clockwork_ossuary'))).toHaveLength(14);
    expect(allChunks.filter((c) => c.biomePool.includes('biome_04_crucible_apex'))).toHaveLength(14);

    expect(ALL_RUNE_IDS).toHaveLength(4);
    expect(Object.keys(EXPLORATION_RUNES)).toHaveLength(4);
    expect(ATHANOR_FORGE_UPGRADES).toHaveLength(8);
    expect(PLAYER_KINEMATICS_Check.SLAM_DIVE_VY).toBe(680);
  });

  it('generates 500 random runSeeds × 4 Biomes (2,000 worlds) with 0 AABB overlaps, 0px floor step, and 100% ungated Spine/Shop/Lore/Vault path', () => {
    const seedSource = new DeterministicRng(0x20261117);
    const seeds: number[] = [0, 1, 0x51c0ffee, 0xffffffff];
    while (seeds.length < 500) {
      seeds.push(seedSource.nextUint32());
    }

    for (const biomeId of ALL_BIOME_IDS) {
      const cfg = BIOME_DAG_CONFIGS[biomeId];
      const expectedTotalNodes = cfg.mainSpineCount + cfg.branchCount;

      for (let idx = 0; idx < seeds.length; idx++) {
        const runSeed = seeds[idx]!;
        const runRng = new DeterministicRng(runSeed);
        const dag = generateBiomeDag(runRng, biomeId, allChunks);

        // 1. fork 通道隔离：父随机流步数必须严格保持 0
        expect(runRng.stepCount).toBe(0);
        expect(dag.nodes).toHaveLength(expectedTotalNodes);
        expect(dag.bridges).toHaveLength(expectedTotalNodes - 1);
        expect(dag.mainSpineNodeIds).toHaveLength(cfg.mainSpineCount);
        expect(dag.branchNodeIds).toHaveLength(cfg.branchCount);

        // 2. 100% 房间包围盒零重叠核验
        for (let i = 0; i < dag.nodes.length; i++) {
          const a = dag.nodes[i]!;
          for (let j = i + 1; j < dag.nodes.length; j++) {
            const b = dag.nodes[j]!;
            const separated =
              a.worldTileX + a.chunk.widthTiles + 2 <= b.worldTileX ||
              b.worldTileX + b.chunk.widthTiles + 2 <= a.worldTileX ||
              a.worldTileY + a.chunk.heightTiles + 2 <= b.worldTileY ||
              b.worldTileY + b.chunk.heightTiles + 2 <= a.worldTileY;
            expect(separated).toBe(true);
          }
        }

        // 3. 所有 DoorSocket 拼接处世界地面 Y 轴零像素误差（0.00 px）核验
        const nodeMap = new Map(dag.nodes.map((n) => [n.nodeId, n]));
        for (const br of dag.bridges) {
          const fromNode = nodeMap.get(br.fromNodeId)!;
          const toNode = nodeMap.get(br.toNodeId)!;
          const outSock = fromNode.chunk.doorSockets.find((s) => s.socketId === br.fromSocketId)!;
          const inSock = toNode.chunk.doorSockets.find((s) => s.socketId === br.toSocketId)!;

          if (br.direction === 'EAST' || br.direction === 'WEST') {
            expect(br.parentDoorFloorY).toBe(br.childDoorFloorY);
            expect(br.bridgeFloorY).toBe(br.parentDoorFloorY);
            const expectedParentY = (fromNode.worldTileY + outSock.tileY + 1) * TILE_SIZE_PX;
            const expectedChildY = (toNode.worldTileY + inSock.tileY + 1) * TILE_SIZE_PX;
            expect(expectedParentY - expectedChildY).toBe(0);
          } else {
            const expectedParentX = (fromNode.worldTileX + outSock.tileX) * TILE_SIZE_PX;
            const expectedChildX = (toNode.worldTileX + inSock.tileX) * TILE_SIZE_PX;
            expect(expectedParentX - expectedChildX).toBe(0);
            expect(br.shaftLeftWorldX).toBe(expectedParentX);
          }
        }

        // 4. 无符文 BFS 连通图遍历：断言主线出口与非隐藏分支 100% 无未解锁符文阻断
        const ungatedAdj = new Map<string, string[]>();
        for (const n of dag.nodes) ungatedAdj.set(n.nodeId, []);
        for (const br of dag.bridges) {
          if (br.requiredRune === null) {
            ungatedAdj.get(br.fromNodeId)!.push(br.toNodeId);
            ungatedAdj.get(br.toNodeId)!.push(br.fromNodeId);
          }
        }

        const reachableWithoutRunes = new Set<string>(['room_00_entrance']);
        const queue = ['room_00_entrance'];
        while (queue.length > 0) {
          const cur = queue.shift()!;
          for (const nxt of ungatedAdj.get(cur) ?? []) {
            if (!reachableWithoutRunes.has(nxt)) {
              reachableWithoutRunes.add(nxt);
              queue.push(nxt);
            }
          }
        }

        const exitNode = dag.nodes.find((n) => n.chunk.role === 'EXIT')!;
        const eliteNode = dag.nodes.find((n) => n.chunk.role === 'ELITE')!;
        const shopNode = dag.nodes.find((n) => n.chunk.role === 'SHOP')!;
        const loreNode = dag.nodes.find((n) => n.chunk.role === 'LORE')!;
        const secretNode = dag.nodes.find((n) => n.chunk.role === 'RUNE_SECRET')!;

        expect(reachableWithoutRunes.has(exitNode.nodeId)).toBe(true);
        expect(reachableWithoutRunes.has(eliteNode.nodeId)).toBe(true);
        expect(reachableWithoutRunes.has(shopNode.nodeId)).toBe(true);
        expect(reachableWithoutRunes.has(loreNode.nodeId)).toBe(true);
        if (cfg.branchCount >= 4) {
          const vaultNode = dag.nodes.find(
            (n) => n.chunk.role === 'CURSED_VAULT' || n.chunk.role === 'TREASURE'
          )!;
          expect(reachableWithoutRunes.has(vaultNode.nodeId)).toBe(true);
        }
        // 隐藏秘宝室必须严格受对应符文门保护
        expect(reachableWithoutRunes.has(secretNode.nodeId)).toBe(false);
      }
    }
  });

  it('proves 100% zero-rune (unlockedRunes = []) deck-to-deck traversal (dy_up <= 96px, dx_gap <= 144px) across every main-spine chunk', () => {
    const unlockedRunes: readonly string[] = [];
    expect(unlockedRunes).toHaveLength(0);

    const ungatedRoles = new Set(['ENTRANCE', 'COMBAT', 'TELEPORTER_HUB', 'ELITE', 'SHOP', 'LORE', 'CURSED_VAULT', 'EXIT']);
    for (const chunk of allChunks) {
      if (!ungatedRoles.has(chunk.role)) continue;
      const decks: Array<{ x0: number; x1: number; y: number }> = [];
      for (const r of chunk.solidRects) {
        if (r.tileY >= 3) decks.push({ x0: r.tileX * 16, x1: (r.tileX + r.widthTiles) * 16, y: r.tileY * 16 });
      }
      for (const p of chunk.oneWayPlatforms) {
        decks.push({ x0: p.tileX * 16, x1: (p.tileX + p.widthTiles) * 16, y: p.tileY * 16 });
      }

      const canHopWithoutRunes = (a: { x0: number; x1: number; y: number }, b: { x0: number; x1: number; y: number }): boolean => {
        const horizGap = Math.max(0, a.x0 - b.x1, b.x0 - a.x1);
        if (horizGap > 144) return false;
        // Going UP from a to b means b.y < a.y -> a.y - b.y <= 96px (double jump envelope); going DOWN is gravity-assisted
        const riseUpPx = a.y - b.y;
        return riseUpPx <= 96;
      };

      const ungatedHorizSockets = chunk.doorSockets.filter(
        (s) => s.requiredRune === null && (s.direction === 'WEST' || s.direction === 'EAST')
      );
      if (ungatedHorizSockets.length < 2) continue;

      const findSocketDeckIdx = (sx: number, sy: number): number =>
        decks.findIndex((d) => Math.abs(d.y - sy) <= 4 && sx + 48 >= d.x0 && sx <= d.x1 + 16);

      const startSock = ungatedHorizSockets[0]!;
      const startIdx = findSocketDeckIdx(startSock.tileX * 16, (startSock.tileY + 1) * 16);
      expect(startIdx).toBeGreaterThanOrEqual(0);

      // Zero-rune directed BFS over decks (no climbableWalls, no breakableSlagFloors!)
      const visited = new Set<number>([startIdx]);
      const q = [startIdx];
      while (q.length > 0) {
        const u = q.shift()!;
        for (let v = 0; v < decks.length; v++) {
          if (!visited.has(v) && canHopWithoutRunes(decks[u]!, decks[v]!)) {
            visited.add(v);
            q.push(v);
          }
        }
      }

      for (const targetSock of ungatedHorizSockets.slice(1)) {
        const targetIdx = findSocketDeckIdx(targetSock.tileX * 16, (targetSock.tileY + 1) * 16);
        expect(targetIdx, `Chunk ${chunk.chunkId} socket ${targetSock.socketId} missing deck`).toBeGreaterThanOrEqual(0);
        expect(visited.has(targetIdx), `Chunk ${chunk.chunkId} cannot traverse ${startSock.socketId} -> ${targetSock.socketId} with unlockedRunes=[]`).toBe(true);
      }
    }
  });

  it('guarantees bit-identical DAG replay and seamless 0px-snag sprint across stitched corridor bridges', () => {
    const dagA = generateBiomeDag(new DeterministicRng(0x51c0ffee), 'biome_03_clockwork_ossuary', allChunks);
    const dagB = generateBiomeDag(new DeterministicRng(0x51c0ffee), 'biome_03_clockwork_ossuary', allChunks);
    expect(dagA).toEqual(dagB);

    const baked = bakeStitchedWorldGeometry(dagA.nodes, dagA.bridges);
    const firstBridge = dagA.bridges.find((b) => b.direction === 'EAST')!;

    const vp = buildViewportSnapshot(1920, 1080, 1);
    const kbm = new KeyboardMouseProvider(null);
    const actionMap = new ActionMap(vp, {
      keyboardMouse: kbm,
      gamepad: new GamepadProvider(() => []),
      touchPad: new TouchVirtualPadProvider(vp, null),
    });

    const startX = firstBridge.worldTileX * TILE_SIZE_PX - 48;
    const floorY = firstBridge.bridgeFloorY;
    const player = new PlayerEntity({
      spawnX: startX,
      spawnY: floorY,
      world: baked,
      input: actionMap,
    });

    kbm.injectKey('KeyD', true);
    for (let tick = 0; tick < 160; tick++) {
      actionMap.sampleFixedTick();
      player.fixedUpdate(FIXED_STEP_SEC);
      expect(player.physics.isGrounded).toBe(true);
      expect(player.physics.y).toBeCloseTo(floorY, 5);
    }

    const endBridgeX = (firstBridge.worldTileX + firstBridge.lengthTiles) * TILE_SIZE_PX;
    expect(player.physics.x).toBeGreaterThan(endBridgeX + 32);
  });

  it('executes airborne Calcined Ram Slam Dive to shatter breakableSlagFloors and validates trap phases & minimap', () => {
    const dag = generateBiomeDag(new DeterministicRng(0x51c0ffee), 'biome_01_slag_retort', allChunks);
    const baked = bakeStitchedWorldGeometry(dag.nodes, dag.bridges);
    const targetFloor = baked.breakableFloors[0]!;
    expect(targetFloor).toBeDefined();
    expect(targetFloor.shattered).toBe(false);

    const vp = buildViewportSnapshot(1920, 1080, 1);
    const kbm = new KeyboardMouseProvider(null);
    const actionMap = new ActionMap(vp, {
      keyboardMouse: kbm,
      gamepad: new GamepadProvider(() => []),
      touchPad: new TouchVirtualPadProvider(vp, null),
    });

    const centerFloorX = targetFloor.rectPx.x + targetFloor.rectPx.w * 0.5;
    let slamTriggered = false;

    const player = new PlayerEntity({
      spawnX: centerFloorX,
      spawnY: targetFloor.rectPx.y - 72,
      world: baked,
      input: actionMap,
      hasCalcinedRamRune: true,
      hooks: {
        notifySlamLanded: (_wx, _wy, hasRam) => {
          slamTriggered = true;
          if (hasRam) {
            targetFloor.shattered = true;
            const i = baked.solidRects.indexOf(targetFloor.rectPx);
            if (i >= 0) baked.solidRects.splice(i, 1);
          }
        },
      },
    });

    player.physics.coyoteTicks = 0;
    actionMap.sampleFixedTick();
    player.fixedUpdate(FIXED_STEP_SEC);

    kbm.injectKey('KeyS', true);
    kbm.injectKey('Space', true);
    actionMap.sampleFixedTick();
    player.fixedUpdate(FIXED_STEP_SEC);
    kbm.injectKey('Space', false);
    kbm.injectKey('KeyS', false);

    expect(player.physics.vy).toBe(0);

    for (let tick = 0; tick < 35; tick++) {
      actionMap.sampleFixedTick();
      player.fixedUpdate(FIXED_STEP_SEC);
    }

    expect(slamTriggered).toBe(true);
    expect(targetFloor.shattered).toBe(true);
    expect(player.physics.y).toBeGreaterThan(targetFloor.rectPx.y + 8);

    const acidTrap = {
      slotId: 't_acid',
      trapType: 'ACID_GEYSER' as const,
      tileX: 10,
      tileY: 25,
      widthTiles: 6,
      phaseOffsetMs: 0,
      cyclePeriodMs: 3200,
    };
    expect(evaluateTrapPhase(acidTrap, 200).phase).toBe('DORMANT');
    expect(evaluateTrapPhase(acidTrap, 1800).phase).toBe('WARNING');
    const activePhase = evaluateTrapPhase(acidTrap, 2600);
    expect(activePhase.phase).toBe('ACTIVE');
    const acidBox = computeTrapActiveHitbox(acidTrap, 160, 416, 96, activePhase);
    expect(acidBox.y1 - acidBox.y0).toBeGreaterThan(96);

    const minimapSnap = composeMinimapSnapshot({
      dag,
      currentRoomId: 'room_00_entrance',
      expanded: true,
      isWarping: false,
      visitedNodeIds: new Set(['room_00_entrance', 'room_02_teleporter_hub']),
      steleStates: new Map([
        ['room_00_entrance', true],
        ['room_02_teleporter_hub', true],
      ]),
      unlockedRunes: ['rune_vitriol_tendril'],
      banner: null,
      interactPrompt: null,
    });
    expect(minimapSnap.nodes).toHaveLength(9);
    expect(minimapSnap.nodes.filter((n) => n.teleporterActive)).toHaveLength(2);
  });
});
