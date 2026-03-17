import { SessionRepo } from '../repositories/session-repo';
import { PlayerRepo } from '../repositories/player-repo';
import { SplitRepo } from '../repositories/split-repo';
import type { Session, SplitWithMember } from '../types/domain';

export class SplitService {
  constructor(
    private sessionRepo: SessionRepo,
    private playerRepo: PlayerRepo,
    private splitRepo: SplitRepo,
  ) {}

  /**
   * Create bill split for a finalized session.
   */
  async createSplit(
    session: Session,
    totalCost: number,
  ): Promise<{ success: boolean; error?: string; perPerson?: number }> {
    if (session.status !== 'finalized') {
      return { success: false, error: 'Session must be finalized before splitting the bill.' };
    }

    // Update actual cost
    await this.sessionRepo.updateActualCost(session.id, totalCost);

    // Get finalized players
    const players = await this.playerRepo.listBySession(session.id);
    if (players.length === 0) {
      return { success: false, error: 'No finalized players found.' };
    }

    const perPerson = Math.ceil(totalCost / players.length);
    const memberIds = players.map((p) => p.member_id);

    // Create split records (INSERT OR IGNORE for idempotency)
    await this.splitRepo.batchInsert(session.id, memberIds, perPerson);

    return { success: true, perPerson };
  }

  async listBySession(sessionId: number): Promise<SplitWithMember[]> {
    return this.splitRepo.listBySession(sessionId);
  }

  async countBySession(sessionId: number): Promise<{ total: number; paid: number; unpaid: number }> {
    return this.splitRepo.countBySession(sessionId);
  }
}
