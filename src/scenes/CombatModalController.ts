/**
 * 装备词条对比卡、炼金三系卷轴与「变异构筑 & 永恒锻炉」UI 弹窗状态桥接控制器
 * （src/scenes/CombatModalController.ts）。
 */

import type { ClockController } from '../core/ClockController';
import type { DeterministicRng } from '../core/DeterministicRng';
import { EventBus } from '../core/EventBus';
import type { WeaponSlotId } from '../data/weapons.data';
import type { PlayerEntity } from '../entities/player/PlayerEntity';
import type { CameraRig } from '../render/CameraRig';
import type { CombatLootSpawner, FloorWeaponDrop } from '../world/CombatLootSpawner';

export class CombatModalController {
  private pendingWeaponDrop: FloorWeaponDrop | null = null;
  private pendingScrollId: string | null = null;
  private mutationForgeOpen = false;
  private externalPauseOpen = false;
  private readonly unbinds: Array<() => void>;

  public constructor(
    private readonly player: PlayerEntity,
    private readonly loot: CombatLootSpawner | null,
    private readonly lootRng: DeterministicRng,
    private readonly clock: ClockController,
    private readonly cameraRig: CameraRig,
    private readonly onChanged: () => void
  ) {
    const loadout = this.player.inventory.loadout;
    this.unbinds = [
      EventBus.on('ui:command:resolve_weapon_compare', ({ action }) => {
        if (this.pendingWeaponDrop && action !== 'cancel') {
          const slot: WeaponSlotId = action === 'equip_primary' ? 'primary' : 'secondary';
          const displaced = this.player.inventory.equipToSlot(slot, this.pendingWeaponDrop.weapon);
          this.loot?.swapWeaponOnFloor(this.pendingWeaponDrop.id, displaced);
        }
        this.pendingWeaponDrop = null;
        this.syncModalPause();
        EventBus.emit('combat:weapon_compare_opened', null);
        this.onChanged();
      }),
      EventBus.on('ui:command:pick_scroll_color', ({ color }) => {
        if (this.pendingScrollId && this.loot?.consumeScrollDrop(this.pendingScrollId)) {
          this.player.stats.applyScrollUpgrade(color);
          this.cameraRig.addTrauma(0.24);
        }
        this.pendingScrollId = null;
        this.syncModalPause();
        EventBus.emit('combat:scroll_pick_opened', null);
        this.onChanged();
      }),
      EventBus.on('ui:command:equip_weapon_direct', ({ slot, weaponId }) => {
        if (!import.meta.env.DEV) return;
        const rolled = this.player.inventory.rollWeaponInstance(this.lootRng, weaponId, 'II', 'PLUS');
        this.player.inventory.equipToSlot(slot, rolled);
        this.onChanged();
      }),
      EventBus.on('ui:command:equip_skill_direct', ({ slot, skillId }) => {
        if (!import.meta.env.DEV) return;
        const rolled = loadout.rollSkillInstance(this.lootRng, skillId, 'II', 'PLUS');
        loadout.equipSkill(slot, rolled);
        this.onChanged();
      }),
      EventBus.on('ui:command:toggle_mutation_forge', ({ open }) => {
        this.setMutationForgeOpen(open ?? !this.mutationForgeOpen);
      }),
      EventBus.on('ui:command:toggle_mutation_choice', ({ mutationId }) => {
        loadout.toggleMutationChoice(mutationId);
        this.publishMutationForge();
        this.onChanged();
      }),
      EventBus.on('ui:command:respec_mutations', () => {
        loadout.respecAllMutations(this.player.stats);
        this.publishMutationForge();
        this.onChanged();
      }),
      EventBus.on('ui:command:invest_forge_ichor', ({ upgradeId, amount }) => {
        loadout.investForgeIchor(upgradeId, this.player.stats, amount);
        this.publishMutationForge();
        this.onChanged();
      }),
      EventBus.on('ui:pause_menu_updated', ({ open }) => {
        this.externalPauseOpen = open;
        this.syncModalPause();
      }),
    ];
  }

  public get isModalOpen(): boolean {
    return this.pendingWeaponDrop !== null || this.pendingScrollId !== null || this.mutationForgeOpen;
  }

  public openWeaponCompare(drop: FloorWeaponDrop): void {
    this.pendingWeaponDrop = drop;
    this.clock.setPaused(true);
    EventBus.emit(
      'combat:weapon_compare_opened',
      this.player.inventory.buildComparePayload(drop.id, drop.weapon, this.player.stats.snapshotLevels)
    );
  }

  public openScrollPick(scrollId: string): void {
    this.pendingScrollId = scrollId;
    this.clock.setPaused(true);
    EventBus.emit('combat:scroll_pick_opened', {
      open: true,
      stationId: scrollId,
      currentHp: this.player.stats.hp,
      currentMaxHp: this.player.stats.maxHp,
      options: this.player.stats.buildScrollPickOptions(),
    });
  }

  public setMutationForgeOpen(nextOpen: boolean): void {
    this.mutationForgeOpen = nextOpen;
    this.syncModalPause();
    this.publishMutationForge();
  }

  private syncModalPause(): void {
    const locked = Boolean(window.__QC_GAME_APP__?.isPortraitLocked);
    this.clock.setPaused(locked || this.externalPauseOpen || this.isModalOpen);
  }

  public destroy(): void {
    for (const off of this.unbinds) off();
    this.unbinds.length = 0;
  }

  private publishMutationForge(): void {
    EventBus.emit(
      'combat:mutation_forge_opened',
      this.mutationForgeOpen
        ? this.player.inventory.loadout.buildMutationForgeModalPayload(this.player.stats, true)
        : null
    );
  }
}
