import type { Session, SessionStatus } from '../types/domain';

export class SessionRepo {
  constructor(private db: D1Database) {}

  async create(
    groupId: number,
    title: string,
    createdByMemberId: number,
    scheduledAt?: string | null,
    location?: string | null,
    estimatedCost?: number | null,
  ): Promise<Session> {
    const result = await this.db
      .prepare(
        `INSERT INTO sessions (group_id, title, scheduled_at, location, estimated_cost, created_by_member_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(groupId, title, scheduledAt ?? null, location ?? null, estimatedCost ?? null, createdByMemberId)
      .run();

    const id = result.meta.last_row_id as number;
    return this.getById(id) as Promise<Session>;
  }

  async getById(id: number): Promise<Session | null> {
    return this.db.prepare('SELECT * FROM sessions WHERE id = ?').bind(id).first<Session>();
  }

  async updateTelegramMessageId(sessionId: number, messageId: string): Promise<void> {
    await this.db
      .prepare("UPDATE sessions SET telegram_message_id = ?, updated_at = datetime('now') WHERE id = ?")
      .bind(messageId, sessionId)
      .run();
  }

  async updateStatus(sessionId: number, status: SessionStatus): Promise<void> {
    const extra =
      status === 'finalized'
        ? ", finalized_at = datetime('now')"
        : status === 'closed'
          ? ", closed_at = datetime('now')"
          : '';
    await this.db
      .prepare(`UPDATE sessions SET status = ?, updated_at = datetime('now')${extra} WHERE id = ?`)
      .bind(status, sessionId)
      .run();
  }

  async updateActualCost(sessionId: number, actualCost: number): Promise<void> {
    await this.db
      .prepare("UPDATE sessions SET actual_cost = ?, updated_at = datetime('now') WHERE id = ?")
      .bind(actualCost, sessionId)
      .run();
  }

  async listByGroup(groupId: number, limit: number = 10): Promise<Session[]> {
    const result = await this.db
      .prepare('SELECT * FROM sessions WHERE group_id = ? ORDER BY created_at DESC LIMIT ?')
      .bind(groupId, limit)
      .all<Session>();
    return result.results;
  }

  async getLatestOpenSession(groupId: number): Promise<Session | null> {
    return this.db
      .prepare("SELECT * FROM sessions WHERE group_id = ? AND status = 'open' ORDER BY created_at DESC LIMIT 1")
      .bind(groupId)
      .first<Session>();
  }
}
