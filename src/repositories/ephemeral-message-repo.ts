export class EphemeralMessageRepo {
  constructor(private db: D1Database) {}

  /**
   * Save a message to be automatically deleted later when a new one of the same type is sent
   */
  async save(chatId: string | number, messageId: string | number, type: string): Promise<void> {
    await this.db
      .prepare('INSERT INTO ephemeral_messages (chat_id, message_id, type) VALUES (?, ?, ?)')
      .bind(String(chatId), String(messageId), type)
      .run();
  }

  /**
   * Get all previous messages of a specific type in a chat
   */
  async getByType(chatId: string | number, type: string): Promise<{ id: number; message_id: string }[]> {
    const result = await this.db
      .prepare('SELECT id, message_id FROM ephemeral_messages WHERE chat_id = ? AND type = ?')
      .bind(String(chatId), type)
      .all<{ id: number; message_id: string }>();
    return result.results;
  }

  /**
   * Delete records after the actual Telegram messages have been deleted
   */
  async deleteRecords(ids: number[]): Promise<void> {
    if (ids.length === 0) return;
    const placeholders = ids.map(() => '?').join(',');
    await this.db
      .prepare(`DELETE FROM ephemeral_messages WHERE id IN (${placeholders})`)
      .bind(...ids)
      .run();
  }
}
