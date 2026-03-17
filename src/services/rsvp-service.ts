import { RsvpRepo } from '../repositories/rsvp-repo';
import type { RsvpStatus, RsvpWithMember } from '../types/domain';

export class RsvpService {
  constructor(private rsvpRepo: RsvpRepo) {}

  async upsert(sessionId: number, memberId: number, status: RsvpStatus): Promise<void> {
    await this.rsvpRepo.upsert(sessionId, memberId, status, 'button');
  }

  async countBySession(sessionId: number): Promise<{ join: number; maybe: number; skip: number }> {
    return this.rsvpRepo.countBySession(sessionId);
  }

  async listBySession(sessionId: number): Promise<RsvpWithMember[]> {
    return this.rsvpRepo.listBySession(sessionId);
  }
}
