import { GroupRepo } from '../repositories/group-repo';
import { MemberRepo } from '../repositories/member-repo';
import type { Group, Member } from '../types/domain';
import type { TelegramUser, TelegramChat } from '../types/telegram';

export class GroupService {
  constructor(
    private groupRepo: GroupRepo,
    private memberRepo: MemberRepo,
  ) {}

  /**
   * Ensure group and member records exist; returns both.
   * Called on every incoming update to keep records fresh.
   */
  async ensureGroupAndMember(
    chat: TelegramChat,
    user: TelegramUser,
  ): Promise<{ group: Group; member: Member }> {
    const group = await this.groupRepo.upsert(
      String(chat.id),
      chat.title ?? null,
    );

    const member = await this.memberRepo.upsert(
      String(user.id),
      user.username ?? null,
      user.first_name ?? null,
      user.last_name ?? null,
    );

    // Ensure group_member link exists
    await this.memberRepo.upsertGroupMember(group.id, member.id);

    return { group, member };
  }
}
