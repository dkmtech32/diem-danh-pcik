import type { SplitWithMember } from '../types/domain';

export class SplitRepo {
  constructor(private db: D1Database) {}

  async batchInsert(sessionId: number, memberIds: number[], amountDue: number): Promise<void> {
    const stmt = this.db.prepare(
      `INSERT OR IGNORE INTO session_splits (session_id, member_id, amount_due)
       VALUES (?, ?, ?)`,
    );
    const batch = memberIds.map((mid) => stmt.bind(sessionId, mid, amountDue));
    if (batch.length > 0) {
      await this.db.batch(batch);
    }
  }

  async markPaid(sessionId: number, memberId: number): Promise<boolean> {
    const result = await this.db
      .prepare(
        `UPDATE session_splits
         SET payment_status = 'paid', amount_paid = amount_due, paid_at = datetime('now'), updated_at = datetime('now')
         WHERE session_id = ? AND member_id = ? AND payment_status = 'unpaid'`,
      )
      .bind(sessionId, memberId)
      .run();
    return (result.meta.changes ?? 0) > 0;
  }

  async getBySessionAndMember(sessionId: number, memberId: number): Promise<SplitWithMember | null> {
    return this.db
      .prepare(
        `SELECT s.*, m.display_name, m.first_name, m.username, m.telegram_user_id
         FROM session_splits s
         JOIN members m ON s.member_id = m.id
         WHERE s.session_id = ? AND s.member_id = ?`,
      )
      .bind(sessionId, memberId)
      .first<SplitWithMember>();
  }

  async listBySession(sessionId: number): Promise<SplitWithMember[]> {
    const result = await this.db
      .prepare(
        `SELECT s.*, m.display_name, m.first_name, m.username, m.telegram_user_id
         FROM session_splits s
         JOIN members m ON s.member_id = m.id
         WHERE s.session_id = ?
         ORDER BY s.payment_status ASC, s.created_at ASC`,
      )
      .bind(sessionId)
      .all<SplitWithMember>();
    return result.results;
  }

  async listUnpaid(sessionId: number): Promise<SplitWithMember[]> {
    const result = await this.db
      .prepare(
        `SELECT s.*, m.display_name, m.first_name, m.username, m.telegram_user_id
         FROM session_splits s
         JOIN members m ON s.member_id = m.id
         WHERE s.session_id = ? AND s.payment_status = 'unpaid'
         ORDER BY s.created_at ASC`,
      )
      .bind(sessionId)
      .all<SplitWithMember>();
    return result.results;
  }

  async countBySession(sessionId: number): Promise<{ total: number; paid: number; unpaid: number }> {
    const result = await this.db
      .prepare(
        `SELECT payment_status, COUNT(*) as cnt
         FROM session_splits WHERE session_id = ?
         GROUP BY payment_status`,
      )
      .bind(sessionId)
      .all<{ payment_status: string; cnt: number }>();

    const counts = { total: 0, paid: 0, unpaid: 0 };
    for (const row of result.results) {
      counts.total += row.cnt;
      if (row.payment_status === 'paid') counts.paid = row.cnt;
      else counts.unpaid = row.cnt;
    }
    return counts;
  }

  async getUnpaidSummaryByGroup(groupId: number): Promise<import('../types/domain').UnpaidSummary[]> {
    const result = await this.db
      .prepare(
        `SELECT 
           s.member_id,
           m.telegram_user_id,
           m.display_name,
           m.first_name,
           m.username,
           SUM(s.amount_due - s.amount_paid) as total_unpaid,
           COUNT(s.id) as session_count
         FROM session_splits s
         JOIN members m ON s.member_id = m.id
         JOIN sessions sess ON s.session_id = sess.id
         WHERE sess.group_id = ? AND s.payment_status = 'unpaid'
         GROUP BY s.member_id
         HAVING total_unpaid > 0
         ORDER BY total_unpaid DESC`,
      )
      .bind(groupId)
      .all<import('../types/domain').UnpaidSummary>();
    return result.results;
  }
}
