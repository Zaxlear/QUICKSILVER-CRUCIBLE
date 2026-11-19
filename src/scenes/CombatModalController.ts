/**
 * 装备/主动技能对比卡、三系卷轴、军械商、受诅咒秘匣、蓝图圣柜与永恒锻炉 UI 弹窗桥接控制器
 * （src/scenes/CombatModalController.ts，严格 <= 250 行）。
 */

import type { ClockController } from '../core/ClockController';
import type { DeterministicRng } from '../core/DeterministicRng';
import { EventBus } from '../core/EventBus';
import { NarrativeStore } from '../core/NarrativeSessionStore';
import { ECONOMY_CONSTANTS } from '../data/economy.data';
import type { RolledSkillInstance, SkillSlotId } from '../data/skills.data';
import type { RolledWeaponInstance, WeaponSlotId } from '../data/weapons.data';
import type { PlayerEntity } from '../entities/player/PlayerEntity';
import type { CameraRig } from '../render/CameraRig';
import { CloudSync } from '../storage/CloudSyncCoordinator';
import type { CombatLootSpawner, FloorWeaponDrop } from '../world/CombatLootSpawner';
import type { ShopMerchantController } from '../world/ShopMerchantController';
import type { FloorSkillDrop, SkillLootSpawner } from '../world/SkillLootSpawner';

export interface PendingWeaponCandidate {
  readonly id: string; readonly weapon: RolledWeaponInstance;
  readonly dropX?: number; readonly dropY?: number;
  readonly fromTube?: boolean; readonly isShopBought?: boolean;
}

export interface PendingSkillCandidate {
  readonly id: string; readonly skill: RolledSkillInstance;
  readonly dropX?: number; readonly dropY?: number;
  readonly fromTube?: boolean; readonly isShopBought?: boolean;
}

export interface CombatModalEconomyHooks {
  readonly skillLoot?: SkillLootSpawner | null;
  readonly shop?: ShopMerchantController | null;
  readonly onSwapTubeWeapon?: (tubeId: string, displaced: RolledWeaponInstance) => void;
  readonly onSwapTubeSkill?: (tubeId: string, displaced: RolledSkillInstance) => void;
  readonly onRecycleLootById?: (lootId: string) => void;
  readonly onAcceptCursedChest?: (chestId: string) => void;
  readonly onBlueprintNewlyUnlocked?: (blueprintId: string) => void;
}

export class CombatModalController {
  private pendingWeapon: PendingWeaponCandidate | null = null;
  private pendingSkill: PendingSkillCandidate | null = null;
  private pendingScrollId: string | null = null;
  private pendingCursedChestId: string | null = null;
  private mutationForgeOpen = false;
  private shopModalOpen = false;
  private collectorModalOpen = false;
  private externalPauseOpen = false;
  private modalSeq = 1;
  private economyHooks: CombatModalEconomyHooks = {};
  private readonly unbinds: Array<() => void>;

  public constructor(
    private readonly player: PlayerEntity,
    private readonly loot: CombatLootSpawner | null,
    private readonly lootRng: DeterministicRng,
    private readonly clock: ClockController,
    private readonly cameraRig: CameraRig,
    private readonly onChanged: () => void,
    initHooks?: CombatModalEconomyHooks
  ) {
    if (initHooks) this.economyHooks = initHooks;
    const loadout = this.player.inventory.loadout;

    this.unbinds = [
      EventBus.on('ui:command:resolve_weapon_compare', ({ action }) => {
        const pw = this.pendingWeapon;
        if (pw) {
          if (action !== 'cancel') {
            const slot: WeaponSlotId = action === 'equip_primary' ? 'primary' : 'secondary';
            const displaced = this.player.inventory.equipToSlot(slot, pw.weapon);
            if (pw.fromTube) this.economyHooks.onSwapTubeWeapon?.(pw.id, displaced);
            else if (pw.isShopBought) {
              this.loot?.spawnDynamicWeaponDrop(`wpn_shop_swap_${++this.modalSeq}`, pw.dropX ?? this.player.physics.x, pw.dropY ?? this.player.physics.y, displaced);
            } else this.loot?.swapWeaponOnFloor(pw.id, displaced);
          } else if (pw.isShopBought) {
            this.loot?.spawnDynamicWeaponDrop(`wpn_shop_drop_${++this.modalSeq}`, pw.dropX ?? this.player.physics.x, pw.dropY ?? this.player.physics.y, pw.weapon);
          }
        }
        this.pendingWeapon = null;
        this.syncModalPause();
        EventBus.emit('combat:weapon_compare_opened', null);
        this.onChanged();
      }),
      EventBus.on('ui:command:resolve_skill_compare', ({ action }) => {
        const ps = this.pendingSkill;
        if (ps) {
          if (action !== 'cancel') {
            const slot: SkillSlotId = action === 'equip_skill_1' ? 'skill_1' : 'skill_2';
            const displaced = loadout.equipSkill(slot, ps.skill);
            if (ps.fromTube) this.economyHooks.onSwapTubeSkill?.(ps.id, displaced);
            else if (ps.isShopBought) {
              this.economyHooks.skillLoot?.spawnSkillDrop(`skl_shop_swap_${++this.modalSeq}`, ps.dropX ?? this.player.physics.x, ps.dropY ?? this.player.physics.y, displaced);
            } else this.economyHooks.skillLoot?.swapSkillOnFloor(ps.id, displaced);
          } else if (ps.isShopBought) {
            this.economyHooks.skillLoot?.spawnSkillDrop(`skl_shop_drop_${++this.modalSeq}`, ps.dropX ?? this.player.physics.x, ps.dropY ?? this.player.physics.y, ps.skill);
          }
        }
        this.pendingSkill = null;
        this.syncModalPause();
        EventBus.emit('combat:skill_compare_opened', null);
        this.onChanged();
      }),
      EventBus.on('ui:command:recycle_floor_loot', ({ lootId }) => {
        const id = lootId ?? this.pendingWeapon?.id ?? this.pendingSkill?.id;
        if (id && !this.pendingWeapon?.fromTube && !this.pendingSkill?.fromTube) {
          this.economyHooks.onRecycleLootById?.(id);
        }
        if (this.pendingWeapon) { this.pendingWeapon = null; EventBus.emit('combat:weapon_compare_opened', null); }
        if (this.pendingSkill) { this.pendingSkill = null; EventBus.emit('combat:skill_compare_opened', null); }
        this.syncModalPause();
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
        this.player.inventory.equipToSlot(slot, this.player.inventory.rollWeaponInstance(this.lootRng, weaponId, 'II', 'PLUS'));
        this.onChanged();
      }),
      EventBus.on('ui:command:equip_skill_direct', ({ slot, skillId }) => {
        if (!import.meta.env.DEV) return;
        loadout.equipSkill(slot, loadout.rollSkillInstance(this.lootRng, skillId, 'II', 'PLUS'));
        this.onChanged();
      }),
      EventBus.on('ui:command:toggle_mutation_forge', ({ open }) => this.setMutationForgeOpen(open ?? !this.mutationForgeOpen)),
      EventBus.on('ui:command:toggle_mutation_choice', ({ mutationId }) => { loadout.toggleMutationChoice(mutationId); this.publishMutationForge(); this.onChanged(); }),
      EventBus.on('ui:command:respec_mutations', () => { loadout.respecAllMutations(this.player.stats); this.publishMutationForge(); this.onChanged(); }),
      EventBus.on('ui:command:invest_forge_ichor', ({ upgradeId, amount }) => { loadout.investForgeIchor(upgradeId, this.player.stats, amount); this.publishMutationForge(); this.onChanged(); }),
      EventBus.on('ui:command:shop_purchase_slot', ({ slotId }) => {
        this.economyHooks.shop?.purchaseSlot(slotId);
        this.shopModalOpen = Boolean(this.economyHooks.shop?.isModalOpen);
        this.syncModalPause();
        this.onChanged();
      }),
      EventBus.on('ui:command:shop_restock', ({ shopNodeId }) => { this.economyHooks.shop?.restockShop(shopNodeId); this.onChanged(); }),
      EventBus.on('ui:command:close_shop_modal', () => { this.economyHooks.shop?.closeShopModal(); this.shopModalOpen = false; this.syncModalPause(); this.onChanged(); }),
      EventBus.on('ui:command:resolve_cursed_chest', ({ accept }) => {
        const cid = this.pendingCursedChestId;
        this.pendingCursedChestId = null;
        EventBus.emit('world:cursed_chest_modal_opened', null);
        if (accept && cid) this.economyHooks.onAcceptCursedChest?.(cid);
        this.syncModalPause();
        this.onChanged();
      }),
      EventBus.on('ui:command:open_collector_modal', () => this.openCollectorModal(NarrativeStore.archiveCarriedBlueprints())),
      EventBus.on('ui:command:close_collector_modal', () => {
        this.collectorModalOpen = false;
        this.syncModalPause();
        EventBus.emit('narrative:collector_modal_opened', null);
        this.onChanged();
      }),
      EventBus.on('ui:command:invest_blueprint_ichor', ({ blueprintId, amount }) => {
        const avail = this.player.stats.ichor + CloudSync.bankedIchor;
        const out = NarrativeStore.investBlueprintIchor(blueprintId, avail, amount);
        if (out.spent > 0) {
          const fromCarried = Math.min(this.player.stats.ichor, out.spent);
          this.player.stats.ichor -= fromCarried;
          if (out.spent > fromCarried) CloudSync.spendBankedIchor(out.spent - fromCarried);
          EventBus.emit('audio:sfx_requested', { sfxId: 'sfx_scroll_upgrade', worldX: this.player.physics.x });
          if (out.unlockedNow) this.economyHooks.onBlueprintNewlyUnlocked?.(blueprintId);
          this.publishCollectorModal(0);
          this.onChanged();
        }
      }),
      EventBus.on('ui:pause_menu_updated', ({ open }) => { this.externalPauseOpen = open; this.syncModalPause(); }),
    ];
  }

  public attachEconomyHooks(hooks: CombatModalEconomyHooks): void { this.economyHooks = hooks; }

  public get isModalOpen(): boolean {
    return (
      this.pendingWeapon !== null || this.pendingSkill !== null || this.pendingScrollId !== null ||
      this.pendingCursedChestId !== null || this.mutationForgeOpen || this.shopModalOpen || this.collectorModalOpen
    );
  }

  public openWeaponCompare(cand: FloorWeaponDrop | PendingWeaponCandidate): void {
    this.pendingWeapon = cand;
    this.syncModalPause();
    const payload = this.player.inventory.buildComparePayload(cand.id, cand.weapon, this.player.stats.snapshotLevels);
    EventBus.emit('combat:weapon_compare_opened', 'fromTube' in cand && (cand.fromTube || cand.isShopBought) ? { ...payload, recycleGoldValue: 0 } : payload);
  }

  public openSkillCompare(cand: FloorSkillDrop | PendingSkillCandidate): void {
    this.pendingSkill = cand;
    this.syncModalPause();
    const affixes = this.player.inventory.collectAllEquippedAffixIds();
    const payload = this.player.inventory.loadout.buildSkillComparePayload(cand.id, cand.skill, this.player.stats.snapshotLevels, affixes);
    EventBus.emit('combat:skill_compare_opened', 'fromTube' in cand && (cand.fromTube || cand.isShopBought) ? { ...payload, recycleGoldValue: 0 } : payload);
  }

  public openScrollPick(scrollId: string): void {
    this.pendingScrollId = scrollId;
    this.syncModalPause();
    EventBus.emit('combat:scroll_pick_opened', {
      open: true, stationId: scrollId, currentHp: this.player.stats.hp,
      currentMaxHp: this.player.stats.maxHp, options: this.player.stats.buildScrollPickOptions(),
    });
  }

  public openCursedChestModal(chestId: string): void {
    this.pendingCursedChestId = chestId;
    this.syncModalPause();
    EventBus.emit('world:cursed_chest_modal_opened', {
      open: true, chestId, killRequirement: ECONOMY_CONSTANTS.CURSE_KILL_PENALTY, bonusGold: ECONOMY_CONSTANTS.CURSE_CHEST_BONUS_GOLD,
    });
  }

  public notifyShopModalOpened(): void { this.shopModalOpen = true; this.syncModalPause(); }

  public openCollectorModal(newlyRegisteredCount = 0): void {
    this.collectorModalOpen = true;
    this.syncModalPause();
    this.publishCollectorModal(newlyRegisteredCount);
  }

  public setMutationForgeOpen(nextOpen: boolean): void {
    this.mutationForgeOpen = nextOpen;
    this.syncModalPause();
    this.publishMutationForge();
  }

  public destroy(): void { for (const off of this.unbinds) off(); this.unbinds.length = 0; }

  private syncModalPause(): void {
    this.clock.setPaused(Boolean(window.__QC_GAME_APP__?.isPortraitLocked) || this.externalPauseOpen || this.isModalOpen);
  }
  private publishMutationForge(): void {
    EventBus.emit('combat:mutation_forge_opened', this.mutationForgeOpen ? this.player.inventory.loadout.buildMutationForgeModalPayload(this.player.stats, true) : null);
  }
  private publishCollectorModal(newlyRegisteredCount: number): void {
    EventBus.emit('narrative:collector_modal_opened', {
      open: true, availableIchor: this.player.stats.ichor + CloudSync.bankedIchor,
      newlyRegisteredCount, entries: NarrativeStore.buildCollectorEntries(),
    });
  }
}
