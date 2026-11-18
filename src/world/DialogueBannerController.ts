/**
 * 非阻断暗黑炼金对话卷轴与自动折叠轻字幕控制器（src/world/DialogueBannerController.ts）。
 *
 * 供 SanctumHubScene、BiomeRunScene（LoreRoomSpawner）与 BossArenaScene 共用：
 * - 播放开场三段式序章（pro_01 -> pro_02 -> pro_03）；
 * - NPC 对话途中若玩家翻滚或走离说话人 > 92px，自动平滑折叠为 COMPACT_SUBTITLE 底部伴随轻字幕；
 * - 环境叙事（LORE）阅读满 250ms 后按任意移动/翻滚键立即无阻断关闭。
 */

import { EventBus } from '../core/EventBus';
import {
  PROLOGUE_SEQUENCE,
  TRUE_ENDING_SEAL_META,
  type DialogueBannerSnapshot,
  type LoreRoomEntrySpec,
  type NpcDialogueLineSpec,
} from '../data/dialogue.data';

export const NPC_COMPACT_DISTANCE_PX = 92;

export class DialogueBannerController {
  private active: DialogueBannerSnapshot | null = null;
  private anchorX = 0;
  private elapsedMs = 0;
  private durationMs = 5600;
  private prologueQueueIdx = -1;
  private readonly unbindCmd: () => void;

  public constructor() {
    this.unbindCmd = EventBus.on('ui:command:advance_or_dismiss_dialogue', ({ action }) => {
      if (!this.active) return;
      if (action === 'compact') {
        this.compactToSubtitle();
      } else if (action === 'next' && this.prologueQueueIdx >= 0 && this.prologueQueueIdx < PROLOGUE_SEQUENCE.length - 1) {
        this.playPrologueBeat(this.prologueQueueIdx + 1, this.anchorX);
      } else {
        this.prologueQueueIdx = -1;
        this.clear();
      }
    });
  }

  public get current(): DialogueBannerSnapshot | null {
    return this.active;
  }

  public startPrologueSequence(spawnX: number): void {
    this.playPrologueBeat(0, spawnX);
  }

  public showNpcLine(line: NpcDialogueLineSpec, npcWorldX: number): void {
    this.prologueQueueIdx = -1;
    this.publish(
      {
        id: line.id,
        sourceKind: 'NPC',
        speakerNameZh: line.speakerNameZh,
        speakerTitleZh: line.speakerTitleZh,
        bodyZh: line.bodyZh,
        portraitSlot: line.portraitSlot,
        accentHex: line.accentHex,
        mode: 'FULL',
        badgeChipZh: null,
        canAdvance: true,
      },
      npcWorldX,
      6400
    );
  }

  public showLoreDiscovery(entry: LoreRoomEntrySpec, ichorGranted: number, shrineWorldX: number): void {
    this.prologueQueueIdx = -1;
    const sealBadge = entry.grantsSealFlag ? `✦ ${TRUE_ENDING_SEAL_META[entry.grantsSealFlag].shortZh} 已点亮` : null;
    const ichorBadge = ichorGranted > 0 ? `+${ichorGranted} 灵液结晶` : '已收录档案';
    this.publish(
      {
        id: entry.id,
        sourceKind: 'LORE',
        speakerNameZh: entry.titleZh,
        speakerTitleZh: entry.decorDescZh,
        bodyZh: entry.bodyZh,
        portraitSlot: 4,
        accentHex: entry.accentHex,
        mode: 'FULL',
        badgeChipZh: sealBadge ? `${sealBadge} · ${ichorBadge}` : ichorBadge,
        canAdvance: true,
      },
      shrineWorldX,
      7200
    );
  }

  public showEndingEpilogue(isTrueEnding: boolean, anchorX: number): void {
    this.prologueQueueIdx = -1;
    this.publish(
      isTrueEnding
        ? {
            id: 'ending_true_alkahest',
            sourceKind: 'ENDING',
            speakerNameZh: '【真结局：归还痛觉 · THE GREAT ALKAHEST】',
            speakerTitleZh: '永恒循环终结 · 纯净原初体已刻印',
            bodyZh: '“水银核击穿衔尾蛇星盘，将人性、慈悲与真实的死亡重新归还尖塔。百年炉火终于熄灭，晨光第一次照进冷却的曲颈瓶。”',
            portraitSlot: 0,
            accentHex: '#38BDF8',
            mode: 'FULL',
            badgeChipZh: '★ 解锁白金皮肤「纯净原初体」',
            canAdvance: true,
          }
        : {
            id: 'ending_false_usurp',
            sourceKind: 'ENDING',
            speakerNameZh: '【常规结局：篡位钙化 · USURPATION】',
            speakerTitleZh: '原初质算力同化 · 坩埚热阶上限 +1',
            bodyZh: '“水银核吞噬了王座上的原初质，却在庞大的绝对理性中被烧熔同化，化作端坐云端的新一代冰冷炼金师。唯有一缕残液流回圣所……”',
            portraitSlot: 5,
            accentHex: '#E11D48',
            mode: 'FULL',
            badgeChipZh: '坩埚热阶 +1 · 寻找三枚真名封印以破局',
            canAdvance: true,
          },
      anchorX,
      10000
    );
  }

  public stepFixed(dtMs: number, playerX: number, isRolling: boolean, isMovingHoriz: boolean): void {
    if (!this.active) return;
    this.elapsedMs += dtMs;
    const dist = Math.abs(playerX - this.anchorX);

    if (this.active.sourceKind === 'LORE' && this.elapsedMs >= 250 && (isRolling || isMovingHoriz)) {
      this.clear();
      return;
    }

    if (
      (this.active.sourceKind === 'NPC' || this.active.sourceKind === 'PROLOGUE') &&
      this.active.mode === 'FULL' &&
      (isRolling || dist > NPC_COMPACT_DISTANCE_PX)
    ) {
      this.compactToSubtitle();
    }

    if (this.elapsedMs >= this.durationMs) {
      if (this.prologueQueueIdx >= 0 && this.prologueQueueIdx < PROLOGUE_SEQUENCE.length - 1) {
        this.playPrologueBeat(this.prologueQueueIdx + 1, this.anchorX);
      } else {
        this.prologueQueueIdx = -1;
        this.clear();
      }
    }
  }

  public compactToSubtitle(): void {
    if (!this.active || this.active.mode === 'COMPACT_SUBTITLE') return;
    this.active = { ...this.active, mode: 'COMPACT_SUBTITLE', canAdvance: false };
    EventBus.emit('narrative:dialogue_updated', this.active);
  }

  public clear(): void {
    this.active = null;
    EventBus.emit('narrative:dialogue_updated', null);
  }

  public destroy(): void {
    this.unbindCmd();
    if (this.active) this.clear();
  }

  private playPrologueBeat(idx: number, spawnX: number): void {
    const beat = PROLOGUE_SEQUENCE[idx];
    if (!beat) return;
    this.prologueQueueIdx = idx;
    const preserveCompact = this.active?.sourceKind === 'PROLOGUE' && this.active.mode === 'COMPACT_SUBTITLE';
    this.publish(
      {
        id: beat.id,
        sourceKind: 'PROLOGUE',
        speakerNameZh: `序章唤醒 (${idx + 1}/3) · Vessel-09`,
        speakerTitleZh: beat.stageDirectionZh,
        bodyZh: beat.bodyZh,
        portraitSlot: 0,
        accentHex: '#38BDF8',
        mode: preserveCompact ? 'COMPACT_SUBTITLE' : 'FULL',
        badgeChipZh: '永恒锻炉圣所',
        canAdvance: !preserveCompact,
      },
      spawnX,
      beat.durationMs
    );
  }

  private publish(snap: DialogueBannerSnapshot, anchorX: number, durationMs: number): void {
    this.active = snap;
    this.anchorX = anchorX;
    this.elapsedMs = 0;
    this.durationMs = durationMs;
    EventBus.emit('narrative:dialogue_updated', snap);
  }
}
