import { SessionRepo } from '../repositories/session-repo';
import { RsvpRepo } from '../repositories/rsvp-repo';
import { PlayerRepo } from '../repositories/player-repo';
import type { Session } from '../types/domain';

export class SessionService {
  constructor(
    private sessionRepo: SessionRepo,
    private rsvpRepo: RsvpRepo,
    private playerRepo: PlayerRepo,
  ) {}

  async create(
    groupId: number,
    title: string,
    createdByMemberId: number,
    scheduledAt?: string | null,
    location?: string | null,
    estimatedCost?: number | null,
  ): Promise<Session> {
    return this.sessionRepo.create(groupId, title, createdByMemberId, scheduledAt, location, estimatedCost);
  }

  async getById(id: number): Promise<Session | null> {
    return this.sessionRepo.getById(id);
  }

  async setTelegramMessageId(sessionId: number, messageId: string): Promise<void> {
    await this.sessionRepo.updateTelegramMessageId(sessionId, messageId);
  }

  /**
   * Finalize attendance: take all 'join' RSVPs and lock them as official players.
   */
  async finalize(session: Session): Promise<{ success: boolean; error?: string; playerCount?: number }> {
    if (session.status !== 'open') {
      return { success: false, error: 'This session is already finalized or closed.' };
    }

    // Get all join RSVPs
    const joinRsvps = await this.rsvpRepo.listByStatus(session.id, 'join');
    if (joinRsvps.length === 0) {
      return { success: false, error: 'No players have joined this session yet.' };
    }

    // Insert into session_players
    const memberIds = joinRsvps.map((r) => r.member_id);
    await this.playerRepo.batchInsert(session.id, memberIds);

    // Update session status
    await this.sessionRepo.updateStatus(session.id, 'finalized');

    return { success: true, playerCount: memberIds.length };
  }

  /**
   * Close session.
   */
  async close(session: Session): Promise<{ success: boolean; error?: string }> {
    if (session.status === 'closed') {
      return { success: false, error: 'This session is already closed.' };
    }
    if (session.status === 'open') {
      return { success: false, error: 'Please finalize attendance before closing.' };
    }

    await this.sessionRepo.updateStatus(session.id, 'closed');
    return { success: true };
  }

  async listByGroup(groupId: number, limit: number = 10): Promise<Session[]> {
    return this.sessionRepo.listByGroup(groupId, limit);
  }
}
