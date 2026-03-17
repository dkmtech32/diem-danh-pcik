import { MemberRepo } from '../repositories/member-repo';
import type { Member } from '../types/domain';

export class MemberService {
  constructor(private memberRepo: MemberRepo) {}

  async getByTelegramUserId(telegramUserId: string): Promise<Member | null> {
    return this.memberRepo.getByTelegramUserId(telegramUserId);
  }

  async getById(id: number): Promise<Member | null> {
    return this.memberRepo.getById(id);
  }
}
