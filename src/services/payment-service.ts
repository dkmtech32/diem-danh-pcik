import { SplitRepo } from '../repositories/split-repo';
import type { SplitWithMember } from '../types/domain';

export class PaymentService {
  constructor(private splitRepo: SplitRepo) {}

  /**
   * Mark a member as paid for a session.
   * Returns false if the member is not in the split list or already paid.
   */
  async markPaid(sessionId: number, memberId: number): Promise<{ success: boolean; error?: string }> {
    const split = await this.splitRepo.getBySessionAndMember(sessionId, memberId);
    if (!split) {
      return { success: false, error: 'You are not in the finalized player list for this session.' };
    }
    if (split.payment_status === 'paid') {
      return { success: false, error: 'You have already marked as paid.' };
    }

    const updated = await this.splitRepo.markPaid(sessionId, memberId);
    return updated
      ? { success: true }
      : { success: false, error: 'Could not update payment status.' };
  }

  async getMyStatus(sessionId: number, memberId: number): Promise<SplitWithMember | null> {
    return this.splitRepo.getBySessionAndMember(sessionId, memberId);
  }

  async listUnpaid(sessionId: number): Promise<SplitWithMember[]> {
    return this.splitRepo.listUnpaid(sessionId);
  }
}
