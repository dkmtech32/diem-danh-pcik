import type { SessionRsvp, RsvpStatus, RsvpWithMember } from '../types/domain';

export class RsvpRepo {
  constructor(private db: D1Database) {}

  async upsert(sessionId: number, memberId: number, status: RsvpStatus, source: string = 'button'): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO session_rsvps (session_id, member_id, rsvp_status, source)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(session_id, member_id) DO UPDATE SET
           rsvp_status = excluded.rsvp_status,
           source = excluded.source,
           updated_at = datetime('now')`,
      )
      .bind(sessionId, memberId, status, source)
      .run();
  }

  async getBySessionAndMember(sessionId: number, memberId: number): Promise<SessionRsvp | null> {
    return this.db
      .prepare('SELECT * FROM session_rsvps WHERE session_id = ? AND member_id = ?')
      .bind(sessionId, memberId)
      .first<SessionRsvp>();
  }

  async listBySession(sessionId: number): Promise<RsvpWithMember[]> {
    const result = await this.db
      .prepare(
        `SELECT r.*, m.display_name, m.first_name, m.username
         FROM session_rsvps r
         JOIN members m ON r.member_id = m.id
         WHERE r.session_id = ?
         ORDER BY r.updated_at ASC`,
      )
      .bind(sessionId)
      .all<RsvpWithMember>();
    return result.results;
  }

  async countBySession(sessionId: number): Promise<{ join: number; maybe: number; skip: number }> {
    const result = await this.db
      .prepare(
        `SELECT rsvp_status, COUNT(*) as cnt
         FROM session_rsvps WHERE session_id = ?
         GROUP BY rsvp_status`,
      )
      .bind(sessionId)
      .all<{ rsvp_status: string; cnt: number }>();

    const counts = { join: 0, maybe: 0, skip: 0 };
    for (const row of result.results) {
      if (row.rsvp_status === 'join') counts.join = row.cnt;
      else if (row.rsvp_status === 'maybe') counts.maybe = row.cnt;
      else if (row.rsvp_status === 'skip') counts.skip = row.cnt;
    }
    return counts;
  }

  async listByStatus(sessionId: number, status: RsvpStatus): Promise<RsvpWithMember[]> {
    const result = await this.db
      .prepare(
        `SELECT r.*, m.display_name, m.first_name, m.username
         FROM session_rsvps r
         JOIN members m ON r.member_id = m.id
         WHERE r.session_id = ? AND r.rsvp_status = ?
         ORDER BY r.updated_at ASC`,
      )
      .bind(sessionId, status)
      .all<RsvpWithMember>();
    return result.results;
  }
}
