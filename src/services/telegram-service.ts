import { telegramApiUrl } from '../config';
import type {
  TelegramInlineKeyboardMarkup,
  TelegramApiResponse,
  TelegramChatMember,
  TelegramMessage,
} from '../types/telegram';

export class TelegramService {
  private baseUrl: string;

  constructor(token: string) {
    this.baseUrl = telegramApiUrl(token);
  }

  private async call<T>(method: string, body: Record<string, unknown>): Promise<T | null> {
    const res = await fetch(`${this.baseUrl}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as TelegramApiResponse<T>;
    if (!data.ok) {
      console.error(`Telegram API error [${method}]:`, data.description);
      return null;
    }
    return data.result ?? null;
  }

  async sendMessage(
    chatId: number | string,
    text: string,
    replyMarkup?: TelegramInlineKeyboardMarkup,
    parseMode: string = 'HTML',
  ): Promise<TelegramMessage | null> {
    return this.call<TelegramMessage>('sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: parseMode,
      reply_markup: replyMarkup,
    });
  }

  async editMessageText(
    chatId: number | string,
    messageId: number | string,
    text: string,
    replyMarkup?: TelegramInlineKeyboardMarkup,
    parseMode: string = 'HTML',
  ): Promise<TelegramMessage | null> {
    return this.call<TelegramMessage>('editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: parseMode,
      reply_markup: replyMarkup,
    });
  }

  async answerCallbackQuery(
    callbackQueryId: string,
    text?: string,
    showAlert: boolean = false,
  ): Promise<boolean | null> {
    return this.call<boolean>('answerCallbackQuery', {
      callback_query_id: callbackQueryId,
      text,
      show_alert: showAlert,
    });
  }

  async getChatMember(chatId: number | string, userId: number): Promise<TelegramChatMember | null> {
    return this.call<TelegramChatMember>('getChatMember', {
      chat_id: chatId,
      user_id: userId,
    });
  }

  async getChatAdministrators(chatId: number | string): Promise<TelegramChatMember[] | null> {
    return this.call<TelegramChatMember[]>('getChatAdministrators', {
      chat_id: chatId,
    });
  }

  async deleteMessage(chatId: number | string, messageId: number | string): Promise<boolean | null> {
    return this.call<boolean>('deleteMessage', {
      chat_id: chatId,
      message_id: messageId,
    });
  }

}
