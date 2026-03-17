import type { Member, GroupMember, GroupMemberRole } from '../types/domain';

export class MemberRepo {
  constructor(private db: D1Database) {}

  async upsert(
    telegramUserId: string,
    username: string | null,
    firstName: string | null,
    lastName: string | null,
  ): Promise<Member> {
    const displayName = firstName || username || 'Unknown';
    const existing = await this.db
      .prepare('SELECT * FROM members WHERE telegram_user_id = ?')
      .bind(telegramUserId)
      .first<Member>();

    if (existing) {
      await this.db
        .prepare(
          `UPDATE members SET username = ?, first_name = ?, last_name = ?, display_name = ?, updated_at = datetime('now')
           WHERE id = ?`,
        )
        .bind(username, firstName, lastName, displayName, existing.id)
        .run();
      return { ...existing, username, first_name: firstName, last_name: lastName, display_name: displayName };
    }

    const result = await this.db
      .prepare(
        'INSERT INTO members (telegram_user_id, username, first_name, last_name, display_name) VALUES (?, ?, ?, ?, ?)',
      )
      .bind(telegramUserId, username, firstName, lastName, displayName)
      .run();

    return {
      id: result.meta.last_row_id as number,
      telegram_user_id: telegramUserId,
      username,
      first_name: firstName,
      last_name: lastName,
      display_name: displayName,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  async getByTelegramUserId(telegramUserId: string): Promise<Member | null> {
    return this.db
      .prepare('SELECT * FROM members WHERE telegram_user_id = ?')
      .bind(telegramUserId)
      .first<Member>();
  }

  async getById(id: number): Promise<Member | null> {
    return this.db.prepare('SELECT * FROM members WHERE id = ?').bind(id).first<Member>();
  }

  async upsertGroupMember(groupId: number, memberId: number, role: GroupMemberRole = 'member'): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO group_members (group_id, member_id, role) VALUES (?, ?, ?)
         ON CONFLICT(group_id, member_id) DO UPDATE SET role = excluded.role`,
      )
      .bind(groupId, memberId, role)
      .run();
  }

  async getGroupMember(groupId: number, memberId: number): Promise<GroupMember | null> {
    return this.db
      .prepare('SELECT * FROM group_members WHERE group_id = ? AND member_id = ?')
      .bind(groupId, memberId)
      .first<GroupMember>();
  }

  async listGroupMembers(groupId: number): Promise<(Member & { role: GroupMemberRole })[]> {
    const result = await this.db
      .prepare(
        `SELECT m.*, gm.role
         FROM group_members gm
         JOIN members m ON gm.member_id = m.id
         WHERE gm.group_id = ?
         ORDER BY m.display_name ASC`,
      )
      .bind(groupId)
      .all<Member & { role: GroupMemberRole }>();
    return result.results;
  }
}
