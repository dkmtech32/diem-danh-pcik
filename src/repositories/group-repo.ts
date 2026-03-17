import type { Group } from '../types/domain';

export class GroupRepo {
  constructor(private db: D1Database) {}

  async upsert(telegramChatId: string, title: string | null): Promise<Group> {
    const existing = await this.db
      .prepare('SELECT * FROM groups WHERE telegram_chat_id = ?')
      .bind(telegramChatId)
      .first<Group>();

    if (existing) {
      if (existing.telegram_chat_title !== title) {
        await this.db
          .prepare("UPDATE groups SET telegram_chat_title = ?, updated_at = datetime('now') WHERE id = ?")
          .bind(title, existing.id)
          .run();
      }
      return { ...existing, telegram_chat_title: title };
    }

    const result = await this.db
      .prepare('INSERT INTO groups (telegram_chat_id, telegram_chat_title) VALUES (?, ?)')
      .bind(telegramChatId, title)
      .run();

    return {
      id: result.meta.last_row_id as number,
      telegram_chat_id: telegramChatId,
      telegram_chat_title: title,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  async getByTelegramChatId(telegramChatId: string): Promise<Group | null> {
    return this.db
      .prepare('SELECT * FROM groups WHERE telegram_chat_id = ?')
      .bind(telegramChatId)
      .first<Group>();
  }
}
