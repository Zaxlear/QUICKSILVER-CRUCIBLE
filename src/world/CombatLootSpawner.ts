/**
 * 关卡地面掉落武器、三系卷轴祭坛、受诅咒骷髅秘匣与出口「变异永恒锻炉祭坛」生成器
 * （src/world/CombatLootSpawner.ts，严格 <= 250 行）。
 */

import type Phaser from 'phaser';
import { DepthLayer, PALETTE_VOID_HEX, TILE_SIZE_PX } from '../core/Constants';
import type { DeterministicRng } from '../core/DeterministicRng';
import { NarrativeStore } from '../core/NarrativeSessionStore';
import { computeGearRecycleGold } from '../data/economy.data';
import { BIOME_DEPTH_BY_ID, DEFAULT_STARTER_WEAPONS } from '../data/storage.data';
import { WEAPON_CATALOG, type RolledWeaponInstance, type WeaponId } from '../data/weapons.data';
import { computeLootQualityTier } from '../entities/player/ForgeGradeRoller';
import { formatWeaponQualityBadge, type PlayerInventory } from '../entities/player/PlayerInventory';
import type { GeneratedBiomeDag } from './DagBiomeGenerator';
import type { IWorldDisplayRegistrar } from './ParallaxComposer';

export interface FloorWeaponDrop {
  readonly id: string; readonly x: number; readonly baseY: number;
  readonly sprite: Phaser.GameObjects.Sprite | null; weapon: RolledWeaponInstance;
}
export interface ScrollAltarDrop {
  readonly id: string; readonly x: number; readonly baseY: number;
  readonly sprite: Phaser.GameObjects.Sprite | null; consumed: boolean;
}
export interface ForgeCrucibleStation {
  readonly id: string; readonly x: number; readonly baseY: number;
  readonly sprite: Phaser.GameObjects.Sprite | null;
}
export interface CursedVaultChest {
  readonly id: string; readonly x: number; readonly baseY: number;
  opened: boolean; readonly sprite: Phaser.GameObjects.Sprite | null;
}

export class CombatLootSpawner {
  public readonly weaponDrops: FloorWeaponDrop[] = [];
  public readonly scrollDrops: ScrollAltarDrop[] = [];
  public readonly forgeStations: ForgeCrucibleStation[] = [];
  public readonly cursedChests: CursedVaultChest[] = [];
  private readonly promptLabel: Phaser.GameObjects.Text | null;
  private bobClockSec = 0;
  private lastPromptText = '';
  private lastPromptColor = '#38BDF8';
  private readonly biomeDepth: 1 | 2 | 3 | 4;

  public constructor(
    private readonly scene: Phaser.Scene | null,
    private readonly registrar: IWorldDisplayRegistrar | null,
    dag: GeneratedBiomeDag,
    private readonly inventory: PlayerInventory,
    private readonly lootRng: DeterministicRng
  ) {
    this.biomeDepth = BIOME_DEPTH_BY_ID[dag.biomeId];
    this.promptLabel = scene && registrar
      ? registrar.registerCrispOverlay(
          scene.add.text(0, 0, '', { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '10px', fontStyle: 'bold', color: '#38BDF8', stroke: PALETTE_VOID_HEX, strokeThickness: 3 })
            .setOrigin(0.5, 1.0).setDepth(DepthLayer.CRISP_TELEGRAPH + 2).setVisible(false)
        )
      : null;
    this.populateInitialDrops(dag);
  }

  public stepFixed(
    dtSec: number, px: number, py: number, interactJustPressed: boolean,
    onInspectWeapon: (drop: FloorWeaponDrop) => void, onInspectScroll: (scroll: ScrollAltarDrop) => void,
    onOpenMutationForge?: () => void, onInspectCursedChest?: (chest: CursedVaultChest) => void
  ): void {
    this.bobClockSec += dtSec;
    const bobOffset = Math.sin(this.bobClockSec * 3.4) * 2.5;
    const altarParity = (Math.floor(this.bobClockSec * 4) & 1) as 0 | 1;

    for (const w of this.weaponDrops) w.sprite?.setY(w.baseY - 12 + bobOffset);
    for (const s of this.scrollDrops) if (!s.consumed) s.sprite?.setY(s.baseY - 14 - bobOffset);
    for (const f of this.forgeStations) f.sprite?.setFrame(`forge_crucible_altar_${altarParity}`);

    for (const f of this.forgeStations) {
      if (Math.hypot(px - f.x, py - f.baseY) < 32) {
        this.syncPrompt('[E/V] 开启 变异构筑与永恒大熔炉（自动归档携带蓝图）', '#A855F7', f.x, f.baseY - 52);
        if (interactJustPressed) { NarrativeStore.archiveCarriedBlueprints(); onOpenMutationForge?.(); }
        return;
      }
    }
    for (const c of this.cursedChests) {
      if (!c.opened && Math.hypot(px - c.x, py - c.baseY) < 34) {
        this.syncPrompt('[E/ACT] 开启受诅咒骷髅秘匣（☠ 承受 10 杀血咒）', '#A855F7', c.x, c.baseY - 38);
        if (interactJustPressed) onInspectCursedChest?.(c);
        return;
      }
    }
    const bestWeapon = this.findNearestWeaponDrop(px, py, 28);
    if (bestWeapon) {
      const def = WEAPON_CATALOG[bestWeapon.weapon.weaponId];
      const badge = formatWeaponQualityBadge(bestWeapon.weapon.level, bestWeapon.weapon.forgeGrade);
      const recVal = computeGearRecycleGold('WEAPON', bestWeapon.weapon.level, bestWeapon.weapon.forgeGrade, (NarrativeStore.forgeTiers.recycle_lvl ?? 0) > 0);
      this.syncPrompt(`[E] 检视 ${def.nameZh} ${badge} · [长按R] 回收 +${recVal}G`, '#38BDF8', bestWeapon.x, bestWeapon.baseY - 30);
      if (interactJustPressed) onInspectWeapon(bestWeapon);
      return;
    }
    for (const s of this.scrollDrops) {
      if (!s.consumed && Math.hypot(px - s.x, py - s.baseY) < 30) {
        this.syncPrompt('[E/ACT] 汲取 炼金三系卷轴', '#FBBF24', s.x, s.baseY - 34);
        if (interactJustPressed) onInspectScroll(s);
        return;
      }
    }
    if (this.promptLabel?.visible) this.promptLabel.setVisible(false);
  }

  public findNearestWeaponDrop(px: number, py: number, maxDist: number): FloorWeaponDrop | null {
    let best: FloorWeaponDrop | null = null;
    let bestDist = maxDist;
    for (const w of this.weaponDrops) {
      const d = Math.hypot(px - w.x, py - w.baseY);
      if (d < bestDist) { bestDist = d; best = w; }
    }
    return best;
  }

  public spawnDynamicWeaponDrop(id: string, x: number, baseY: number, weapon: RolledWeaponInstance): FloorWeaponDrop {
    const def = WEAPON_CATALOG[weapon.weaponId];
    const sprite = this.scene && this.registrar
      ? this.registrar.registerWorldLit(this.scene.add.sprite(x, baseY - 12, def.worldAtlas, def.worldFrame).setDepth(DepthLayer.LOOT).setPipeline('Light2D'))
      : null;
    const drop: FloorWeaponDrop = { id, x, baseY, sprite, weapon };
    this.weaponDrops.push(drop);
    return drop;
  }

  public spawnDynamicScrollDrop(id: string, x: number, baseY: number): ScrollAltarDrop {
    const sprite = this.scene && this.registrar
      ? this.registrar.registerWorldLit(this.scene.add.sprite(x, baseY - 14, 'weapons_fx_atlas', 'scroll_tri_pickup').setDepth(DepthLayer.LOOT).setPipeline('Light2D'))
      : null;
    const scr: ScrollAltarDrop = { id, x, baseY, sprite, consumed: false };
    this.scrollDrops.push(scr);
    return scr;
  }

  public removeWeaponDrop(dropId: string): FloorWeaponDrop | null {
    const idx = this.weaponDrops.findIndex((d) => d.id === dropId);
    if (idx < 0) return null;
    const removed = this.weaponDrops[idx]!;
    if (removed.sprite && this.registrar) { this.registrar.unregister(removed.sprite); removed.sprite.destroy(); }
    this.weaponDrops.splice(idx, 1);
    return removed;
  }

  public openCursedChestAndSpawnLoot(chestId: string): { readonly weapon: RolledWeaponInstance; readonly scroll: ScrollAltarDrop; readonly x: number; readonly y: number } | null {
    const chest = this.cursedChests.find((c) => c.id === chestId && !c.opened);
    if (!chest) return null;
    chest.opened = true;
    chest.sprite?.setFrame('cursed_skull_chest_open');
    this.registrar?.spawnLightFlash(chest.x, chest.baseY - 18, 0xa855f7, 240, 2.8, 360);
    const pool = NarrativeStore.unlockedWeapons.length > 0 ? NarrativeStore.unlockedWeapons : (DEFAULT_STARTER_WEAPONS as readonly WeaponId[]);
    const tier = computeLootQualityTier(this.biomeDepth, NarrativeStore.maxCrucibleHeat, true);
    const weapon = this.inventory.rollWeaponInstance(this.lootRng, this.lootRng.pick(pool), tier, 'S', true);
    this.spawnDynamicWeaponDrop(`${chestId}_legendary`, chest.x - 22, chest.baseY, weapon);
    const scroll = this.spawnDynamicScrollDrop(`${chestId}_scroll`, chest.x + 22, chest.baseY);
    return { weapon, scroll, x: chest.x, y: chest.baseY };
  }

  public swapWeaponOnFloor(dropId: string, displacedWeapon: RolledWeaponInstance): boolean {
    const found = this.weaponDrops.find((d) => d.id === dropId);
    if (!found) return false;
    found.weapon = displacedWeapon;
    const def = WEAPON_CATALOG[displacedWeapon.weaponId];
    found.sprite?.setTexture(def.worldAtlas, def.worldFrame);
    this.registrar?.spawnLightFlash(found.x, found.baseY - 12, 0x38bdf8, 150, 2.2, 220);
    return true;
  }

  public consumeScrollDrop(scrollId: string): boolean {
    const found = this.scrollDrops.find((s) => s.id === scrollId && !s.consumed);
    if (found) { found.consumed = true; found.sprite?.setVisible(false); this.registrar?.spawnLightFlash(found.x, found.baseY - 16, 0xfbbf24, 210, 2.6, 320); return true; }
    const chest = this.cursedChests.find((c) => c.id === scrollId && !c.opened);
    if (chest) { chest.opened = true; chest.sprite?.setFrame('cursed_skull_chest_open'); return true; }
    return false;
  }

  public destroy(): void {
    for (const w of this.weaponDrops) if (w.sprite && this.registrar) { this.registrar.unregister(w.sprite); w.sprite.destroy(); }
    for (const s of this.scrollDrops) if (s.sprite && this.registrar) { this.registrar.unregister(s.sprite); s.sprite.destroy(); }
    for (const f of this.forgeStations) if (f.sprite && this.registrar) { this.registrar.unregister(f.sprite); f.sprite.destroy(); }
    for (const c of this.cursedChests) if (c.sprite && this.registrar) { this.registrar.unregister(c.sprite); c.sprite.destroy(); }
    if (this.promptLabel && this.registrar) { this.registrar.unregister(this.promptLabel); this.promptLabel.destroy(); }
    this.weaponDrops.length = 0; this.scrollDrops.length = 0; this.forgeStations.length = 0; this.cursedChests.length = 0;
  }

  private syncPrompt(text: string, color: string, x: number, y: number): void {
    if (!this.promptLabel) return;
    if (text !== this.lastPromptText) { this.promptLabel.setText(text); this.lastPromptText = text; }
    if (color !== this.lastPromptColor) { this.promptLabel.setColor(color); this.lastPromptColor = color; }
    this.promptLabel.setPosition(x, y);
    if (!this.promptLabel.visible) this.promptLabel.setVisible(true);
  }

  private populateInitialDrops(dag: GeneratedBiomeDag): void {
    for (const node of dag.nodes) {
      if (node.chunk.role === 'ENTRANCE' || node.chunk.role === 'SHOP' || node.chunk.role === 'ELITE') continue;
      if (node.chunk.role === 'EXIT') {
        const ped = node.chunk.rewardPedestalTilePos;
        const fx = (node.worldTileX + (ped ? ped.tileX - 5 : 18)) * TILE_SIZE_PX;
        const fy = (node.worldTileY + (ped ? ped.tileY + 1 : 26)) * TILE_SIZE_PX;
        const sprite = this.scene && this.registrar ? this.registrar.registerWorldLit(this.scene.add.sprite(fx, fy - 26, 'synergy_fx_atlas', 'forge_crucible_altar_0').setDepth(DepthLayer.LOOT).setPipeline('Light2D')) : null;
        this.registrar?.registerAmbientLight({ id: `light_forge_${node.nodeId}`, x: fx, y: fy - 28, preset: 'MERCURY_SILVER', radiusPx: 155, flickerAmplitude: 0.08 });
        this.forgeStations.push({ id: `forge_exit_${node.nodeId}`, x: fx, baseY: fy, sprite });
        continue;
      }
      const ped = node.chunk.rewardPedestalTilePos;
      if (!ped) continue;
      const px = (node.worldTileX + ped.tileX) * TILE_SIZE_PX + 8;
      const py = (node.worldTileY + ped.tileY + 1) * TILE_SIZE_PX;
      if (node.chunk.role === 'CURSED_VAULT') {
        const sprite = this.scene && this.registrar ? this.registrar.registerWorldLit(this.scene.add.sprite(px, py, 'world_props_atlas', 'cursed_skull_chest_closed').setOrigin(0.5, 1.0).setDepth(DepthLayer.LOOT).setPipeline('Light2D')) : null;
        this.registrar?.registerAmbientLight({ id: `curse_chest_${node.nodeId}`, x: px, y: py - 20, preset: 'VOLTAIC_CYAN', radiusPx: 165, flickerAmplitude: 0.16 });
        this.cursedChests.push({ id: `cursed_chest_${node.nodeId}`, x: px, baseY: py, opened: false, sprite });
      } else {
        this.spawnDynamicScrollDrop(`scroll_room_${node.nodeId}`, px, py);
      }
    }
  }
}
