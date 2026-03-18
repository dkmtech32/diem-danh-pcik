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

  async getUnpaidSummaryMessage(groupId: number): Promise<string | null> {
    const summaries = await this.splitRepo.getUnpaidSummaryByGroup(groupId);
    if (!summaries || summaries.length === 0) return null;

    let text = '💥 <b>Danh sách Ai còn nợ (Chưa đóng tiền sân)</b> 💥\n\n';
    let totalAll = 0;

    for (const s of summaries) {
      const name = s.display_name || s.first_name || s.username || 'Người chơi ẩn danh';
      const mention = s.username ? `@${s.username}` : `<a href="tg://user?id=${s.telegram_user_id}">${name}</a>`;
      text += `• ${mention}: <b>${s.total_unpaid.toLocaleString()}đ</b> (${s.session_count} buổi)\n`;
      totalAll += s.total_unpaid;
    }

    text += `\n💰 <b>Tổng nợ cả nhóm: ${totalAll.toLocaleString()}đ</b>\n`;
    text += `\nNhanh tay ting ting cho chủ thớt nhé! 💸`;

    return text;
  }
}
