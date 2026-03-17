import type { PlayerWithMember } from '../types/domain';

export class PlayerRepo {
  constructor(private db: D1Database) {}

  async batchInsert(sessionId: number, memberIds: number[]): Promise<void> {
    const stmt = this.db.prepare('INSERT OR IGNORE INTO session_players (session_id, member_id) VALUES (?, ?)');
    const batch = memberIds.map((mid) => stmt.bind(sessionId, mid));
    if (batch.length > 0) {
      await this.db.batch(batch);
    }
  }

  async listBySession(sessionId: number): Promise<PlayerWithMember[]> {
    const result = await this.db
      .prepare(
        `SELECT p.*, m.display_name, m.first_name, m.username, m.telegram_user_id
         FROM session_players p
         JOIN members m ON p.member_id = m.id
         WHERE p.session_id = ?
         ORDER BY p.created_at ASC`,
      )
      .bind(sessionId)
      .all<PlayerWithMember>();
    return result.results;
  }

  async countBySession(sessionId: number): Promise<number> {
    const result = await this.db
      .prepare('SELECT COUNT(*) as cnt FROM session_players WHERE session_id = ?')
      .bind(sessionId)
      .first<{ cnt: number }>();
    return result?.cnt ?? 0;
  }
}
