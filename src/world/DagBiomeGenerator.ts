/**
 * 基于种子的有向无环图（DAG）生态群落关卡生成器（src/world/DagBiomeGenerator.ts）。
 *
 * 严格遵循 .agents/rules/level-topology-and-determinism.md：
 * - 通过 runRng.fork(BIOME_TOPOLOGY) 隔离拓扑随机流，不消耗父流步数；
 * - 主干必经路径（ENTRANCE -> ... -> EXIT）强制零符文门阻断；
 * - 支持 3~4 分支确定性回溯，确保 100% 种子零 AABB 重叠与零台阶拼接。
 */

import type { DeterministicRng } from '../core/DeterministicRng';
import { BIOME_DAG_CONFIGS, RNG_CHANNEL_HASH, type BiomeId, type RuneId } from '../data/runes.data';
import {
  buildCorridorBridge,
  hasPlacementCollision,
  OPPOSITE_DOOR_DIR,
  solveSocketAlignment,
  type PlacedRoomNode,
  type StitchedCorridorBridge,
} from './DoorSocketStitcher';
import type { DoorDirection, DoorSocketSpec, RoomChunkTemplate, RoomRole } from './RoomChunkSchema';

export interface GeneratedBiomeDag {
  readonly biomeId: BiomeId;
  readonly seed: number;
  readonly nodes: readonly PlacedRoomNode[];
  readonly bridges: readonly StitchedCorridorBridge[];
  readonly mainSpineNodeIds: readonly string[];
  readonly branchNodeIds: readonly string[];
}

const BRIDGE_LENGTHS = [6, 10, 14] as const;
const HORIZ_ORDER: Readonly<Record<DoorDirection, number>> = { EAST: 0, NORTH: 1, SOUTH: 2, WEST: 3 };
const VERT_ORDER: Readonly<Record<DoorDirection, number>> = { NORTH: 0, SOUTH: 1, EAST: 2, WEST: 3 };

function shuffle<T>(items: readonly T[], rng: DeterministicRng): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rng.nextInt(0, i);
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
  return arr;
}

export function generateBiomeDag(
  runRng: DeterministicRng,
  biomeId: BiomeId,
  chunkLibrary: readonly RoomChunkTemplate[]
): GeneratedBiomeDag {
  const rng = runRng.fork(RNG_CHANNEL_HASH.BIOME_TOPOLOGY);
  const cfg = BIOME_DAG_CONFIGS[biomeId];
  const pool = chunkLibrary.filter((c) => c.biomePool.includes(biomeId));
  const byRole = (r: RoomRole): RoomChunkTemplate[] => shuffle(pool.filter((c) => c.role === r), rng);

  const entrances = byRole('ENTRANCE');
  const combats = byRole('COMBAT');
  const hubs = byRole('TELEPORTER_HUB');
  const elites = byRole('ELITE');
  const exits = byRole('EXIT');
  const shops = byRole('SHOP');
  const lores = byRole('LORE');
  const secrets = byRole('RUNE_SECRET');
  const vaults = [...byRole('CURSED_VAULT'), ...byRole('TREASURE')];

  if (!entrances.length || !combats.length || !hubs.length || !elites.length || !exits.length) {
    throw new Error(`Incomplete RoomChunk pool for biome ${biomeId}`);
  }

  const spineRoles: RoomRole[] = ['ENTRANCE', 'COMBAT', 'TELEPORTER_HUB', 'ELITE', 'COMBAT', 'EXIT'];
  while (spineRoles.length < cfg.mainSpineCount) {
    spineRoles.splice(spineRoles.length - 1, 0, 'COMBAT');
  }
  const secretCombats = combats.filter((c) =>
    c.doorSockets.some((s) => s.requiredRune === cfg.secretBranchRune)
  );

  const rootNode: PlacedRoomNode = {
    nodeId: 'room_00_entrance',
    chunk: entrances[0]!,
    worldTileX: 0,
    worldTileY: 0,
    parentNodeId: null,
    isMainSpine: true,
  };

  const usedSockets = new Set<string>();
  const sKey = (nid: string, sid: string): string => `${nid}::${sid}`;
  let backtrackLeft = 96;
  let solvedRooms: PlacedRoomNode[] | null = null;
  let solvedBridges: StitchedCorridorBridge[] | null = null;

  const tryPlaceChild = (
    parent: PlacedRoomNode,
    candidates: readonly RoomChunkTemplate[],
    runeFilter: RuneId | null,
    nodeId: string,
    bridgeId: string,
    isMainSpine: boolean,
    dirOrder: Readonly<Record<DoorDirection, number>>,
    rooms: readonly PlacedRoomNode[],
    bridges: readonly StitchedCorridorBridge[],
    cont: (r: PlacedRoomNode, b: StitchedCorridorBridge) => boolean
  ): boolean => {
    if (backtrackLeft <= 0) return false;
    const outSocks = parent.chunk.doorSockets
      .filter((s) => !usedSockets.has(sKey(parent.nodeId, s.socketId)) && s.requiredRune === runeFilter)
      .sort((a, b) => dirOrder[a.direction] - dirOrder[b.direction]);

    for (const outSock of outSocks) {
      const needDir = OPPOSITE_DOOR_DIR[outSock.direction];
      for (const chunk of candidates) {
        const inSocks: readonly DoorSocketSpec[] = chunk.doorSockets.filter(
          (s) => s.direction === needDir && s.requiredRune === runeFilter
        );
        for (const inSock of inSocks) {
          for (const bridgeLen of BRIDGE_LENGTHS) {
            const pos = solveSocketAlignment(parent, outSock, chunk, inSock, bridgeLen);
            const candRoom: PlacedRoomNode = {
              nodeId,
              chunk,
              worldTileX: pos.worldTileX,
              worldTileY: pos.worldTileY,
              parentNodeId: parent.nodeId,
              isMainSpine,
            };
            const candBridge = buildCorridorBridge(bridgeId, parent, outSock, candRoom, inSock, bridgeLen);
            if (!hasPlacementCollision(candRoom, candBridge, rooms, bridges)) {
              const ko = sKey(parent.nodeId, outSock.socketId);
              const ki = sKey(candRoom.nodeId, inSock.socketId);
              usedSockets.add(ko);
              usedSockets.add(ki);
              if (cont(candRoom, candBridge)) return true;
              usedSockets.delete(ko);
              usedSockets.delete(ki);
              if (backtrackLeft <= 0) return false;
            }
          }
        }
      }
    }
    return false;
  };

  const solveBranches = (rooms: PlacedRoomNode[], bridges: StitchedCorridorBridge[]): boolean => {
    const midHosts = rooms.filter((r) => r.chunk.role !== 'ENTRANCE' && r.chunk.role !== 'EXIT');
    const specs = [
      secrets.length
        ? { id: 'branch_01_secret', bid: 'bridge_b01_secret', pool: secrets, rune: cfg.secretBranchRune, hosts: [...rooms].reverse().filter((r) => r.chunk.role === 'COMBAT') }
        : null,
      shops.length
        ? { id: 'branch_02_shop', bid: 'bridge_b02_shop', pool: shops, rune: null, hosts: midHosts }
        : null,
      lores.length
        ? { id: 'branch_03_lore', bid: 'bridge_b03_lore', pool: lores, rune: null, hosts: [...midHosts].reverse() }
        : null,
      cfg.branchCount >= 4 && vaults.length
        ? { id: 'branch_04_vault', bid: 'bridge_b04_vault', pool: vaults, rune: null, hosts: midHosts }
        : null,
    ].filter((x): x is NonNullable<typeof x> => x !== null);

    const stepBranch = (idx: number, rs: PlacedRoomNode[], bs: StitchedCorridorBridge[]): boolean => {
      if (idx >= specs.length) {
        solvedRooms = rs;
        solvedBridges = bs;
        return true;
      }
      const sp = specs[idx]!;
      for (const host of sp.hosts) {
        if (
          tryPlaceChild(host, sp.pool, sp.rune, sp.id, sp.bid, false, VERT_ORDER, rs, bs, (nr, nb) =>
            stepBranch(idx + 1, [...rs, nr], [...bs, nb])
          )
        ) {
          return true;
        }
      }
      return false;
    };
    return stepBranch(0, rooms, bridges);
  };

  const solveSpine = (idx: number, rooms: PlacedRoomNode[], bridges: StitchedCorridorBridge[]): boolean => {
    if (idx >= spineRoles.length) return solveBranches(rooms, bridges);
    const role = spineRoles[idx]!;
    const usedIds = new Set(rooms.map((r) => r.chunk.chunkId));
    let cands: readonly RoomChunkTemplate[] = exits;
    if (role === 'COMBAT') {
      const base = idx === spineRoles.length - 2 && secretCombats.length ? secretCombats : combats;
      const fresh = base.filter((c) => !usedIds.has(c.chunkId));
      cands = shuffle(fresh.length ? fresh : base, rng);
    } else if (role === 'TELEPORTER_HUB') cands = hubs;
    else if (role === 'ELITE') cands = elites;

    return tryPlaceChild(
      rooms[rooms.length - 1]!,
      cands,
      null,
      `room_0${idx}_${role.toLowerCase()}`,
      `bridge_s0${idx}`,
      true,
      HORIZ_ORDER,
      rooms,
      bridges,
      (nr, nb) => {
        if (solveSpine(idx + 1, [...rooms, nr], [...bridges, nb])) return true;
        backtrackLeft -= 1;
        return false;
      }
    );
  };

  if (!solveSpine(1, [rootNode], []) || !solvedRooms || !solvedBridges) {
    throw new Error(`Failed to solve collision-free Biome DAG for biome=${biomeId} seed=${runRng.seed}`);
  }
  const nodes: readonly PlacedRoomNode[] = solvedRooms;
  const bridges: readonly StitchedCorridorBridge[] = solvedBridges;
  return {
    biomeId,
    seed: runRng.seed,
    nodes,
    bridges,
    mainSpineNodeIds: nodes.filter((r) => r.isMainSpine).map((r) => r.nodeId),
    branchNodeIds: nodes.filter((r) => !r.isMainSpine).map((r) => r.nodeId),
  };
}
