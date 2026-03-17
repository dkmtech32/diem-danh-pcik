// App configuration and environment bindings

export interface Env {
  DB: D1Database;
  TELEGRAM_BOT_TOKEN: string;
  APP_BASE_URL: string;
  ADMIN_BANK_BIN?: string;
  ADMIN_BANK_ACCOUNT?: string;
  ADMIN_BANK_NAME?: string;
}

export function telegramApiUrl(token: string): string {
  return `https://api.telegram.org/bot${token}`;
}
