/**
 * 强类型 EventBus 驱动的 20 条词条（afx_01 ~ afx_20）化学反应联动执行引擎
 * （src/combat/AffixSynergyEngine.ts）。
 *
 * 严格遵循反耦合铁律：零具体武器分支判断，纯事件订阅与生命周期卸载（unmount 防泄漏）。
 */

import { EventBus, type TypedEventBus } from '../core/EventBus';
import {
  computeAffixIncomingDamageMultiplier,
  evaluateAffixDamageMultiplier,
} from './AffixMultiplierMath';
import type { CombatTargetView } from './CombatTypes';
import type { StatusEffectMachine } from './StatusEffectMachine';

export type AffixSpawnedZoneKind = 'VIOLET_NAPALM_TRAIL' | 'TOXIC_MIST_CLOUD';

export interface AffixRuntimeCallbacks {
  readonly getTargets: () => readonly CombatTargetView[];
  readonly onHealPlayerRatio?: (maxHpRatio: number) => void;
  readonly onAstralBreachLightning?: (
    targetId: string,
    worldX: number,
    worldY: number,
    damage: number
  ) => void;
  readonly onSpawnHazardZone?: (
    kind: AffixSpawnedZoneKind,
    worldX: number,
    worldY: number,
    radiusPx: number,
    durationSec: number,
    statScale: number
  ) => void;
  readonly onAreaDirectDamage?: (
    worldX: number,
    worldY: number,
    radiusPx: number,
    damage: number,
    isCrit: boolean
  ) => void;
}

export class AffixSynergyEngine {
  private readonly unsubscribers: Array<() => void> = [];

  public constructor(
    private readonly statusMachine: StatusEffectMachine,
    private readonly callbacks: AffixRuntimeCallbacks,
    private readonly bus: TypedEventBus = EventBus
  ) {}

  /** 查询目标实时元素状态并汇总全部条件词条与双倍伤乘区 */
  public computeHitAffixMultiplier(
    affixIds: readonly string[],
    targetId: string,
    targetIsStunned = false
  ): number {
    return evaluateAffixDamageMultiplier(affixIds, {
      isBleeding: this.statusMachine.has(targetId, 'bleeding'),
      isPoisoned: this.statusMachine.has(targetId, 'poisoned'),
      isIgnited: this.statusMachine.has(targetId, 'ignited'),
      isVioletNapalm: this.statusMachine.isVioletNapalm(targetId),
      isFrozen: this.statusMachine.has(targetId, 'frozen'),
      isElectrified: this.statusMachine.has(targetId, 'electrified'),
      isStunnedOrRooted: this.statusMachine.isImmobilized(targetId, targetIsStunned),
    });
  }

  public static computeIncomingDamagePenaltyMultiplier(equippedAffixIds: readonly string[]): number {
    return computeAffixIncomingDamageMultiplier(equippedAffixIds);
  }

  /** 翻滚路径触发 #13 翻滚感电与 #14 炼金紫火径 */
  public triggerDodgeRollPathAffixes(
    worldX: number,
    worldY: number,
    activeAffixIds: readonly string[],
    statScale = 1.0
  ): void {
    if (activeAffixIds.includes('afx_shock_on_dodge')) {
      this.statusMachine.applyRadius(
        worldX,
        worldY,
        48,
        this.callbacks.getTargets(),
        'electrified',
        2,
        statScale
      );
      this.callbacks.onAreaDirectDamage?.(worldX, worldY, 44, Math.round(18 * statScale), false);
    }
    if (activeAffixIds.includes('afx_oil_fire_trail')) {
      this.callbacks.onSpawnHazardZone?.('VIOLET_NAPALM_TRAIL', worldX, worldY, 42, 3.0, statScale);
    }
  }

  public mount(): void {
    this.unmount();

    this.unsubscribers.push(
      this.bus.on('combat:hit_landed', (ev) => {
        const affixes = ev.affixIds;
        if (!affixes || affixes.length === 0) return;
        const scale = ev.attackerStatScale ?? 1.0;

        if (affixes.includes('afx_coat_blade_oil')) {
          this.statusMachine.apply(ev.targetId, 'oiled', 1, scale, { worldX: ev.worldX, worldY: ev.worldY });
        }
        if (ev.isCrit && affixes.includes('afx_ignite_on_crit')) {
          this.statusMachine.apply(ev.targetId, 'ignited', 2, scale, { worldX: ev.worldX, worldY: ev.worldY });
        }
        if (ev.isCrit && affixes.includes('afx_leech_elite_hit')) {
          this.callbacks.onHealPlayerRatio?.(0.01);
        }
        if (ev.triggeredBreachStun && affixes.includes('afx_breach_shockwave')) {
          const base = ev.baseWeaponDamage ?? ev.damage;
          const boltDmg = Math.max(1, Math.round(base * scale * 0.85));
          this.statusMachine.apply(ev.targetId, 'electrified', 1, scale, { worldX: ev.worldX, worldY: ev.worldY });
          this.callbacks.onAstralBreachLightning?.(ev.targetId, ev.worldX, ev.worldY, boltDmg);
        }
      }),
      this.bus.on('combat:enemy_killed', (ev) => {
        const affixes = ev.killerAffixIds;
        if (!affixes || affixes.length === 0) return;
        if (affixes.includes('afx_bleed_spread_kill')) {
          this.statusMachine.transferStacksInRadius(
            ev.enemyId,
            ev.worldX,
            ev.worldY,
            112,
            ['bleeding', 'poisoned'],
            this.callbacks.getTargets()
          );
        }
        if (affixes.includes('afx_freeze_blast_kill')) {
          this.statusMachine.applyRadius(ev.worldX, ev.worldY, 80, this.callbacks.getTargets(), 'frozen', 1, 1.0, 2.0);
        }
      }),
      this.bus.on('combat:dodge_evaded', (ev) => {
        if (ev.activeAffixIds && ev.activeAffixIds.length > 0) {
          this.triggerDodgeRollPathAffixes(ev.worldX, ev.worldY, ev.activeAffixIds, 1.0);
        }
      }),
      this.bus.on('combat:parry_succeeded', (ev) => {
        if (ev.shieldAffixIds?.includes('afx_shield_parry_poison')) {
          this.statusMachine.applyRadius(ev.worldX, ev.worldY, 110, this.callbacks.getTargets(), 'poisoned', 4, 1.0);
        }
      }),
      this.bus.on('combat:skill_deployed', (ev) => {
        if (ev.affixIds.includes('afx_toxic_cloud_hit')) {
          this.callbacks.onSpawnHazardZone?.('TOXIC_MIST_CLOUD', ev.worldX, ev.worldY, 88, 4.0, ev.statScale);
        }
      }),
      this.bus.on('combat:skill_expired', (ev) => {
        if (ev.affixIds.includes('afx_grenade_voltaic_net')) {
          this.statusMachine.applyRadius(ev.worldX, ev.worldY, 100, this.callbacks.getTargets(), 'electrified', 3, ev.statScale);
          const dmg = Math.max(1, Math.round(ev.baseDamage * ev.statScale * 1.2));
          this.callbacks.onAreaDirectDamage?.(ev.worldX, ev.worldY, 100, dmg, true);
        }
      })
    );
  }

  public unmount(): void {
    while (this.unsubscribers.length > 0) {
      this.unsubscribers.pop()?.();
    }
  }
}
