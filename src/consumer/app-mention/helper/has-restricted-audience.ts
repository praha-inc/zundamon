import type { SlackAPIClient } from 'slack-edge';

const getChannelMemberIds = async (client: SlackAPIClient, channel: string): Promise<Set<string>> => {
  const memberIds = new Set<string>();
  let cursor: string | undefined;

  do {
    const response = await client.conversations.members({
      channel: channel,
      limit: 1000,
      ...cursor ? { cursor } : {},
    });
    for (const memberId of response.members ?? []) {
      memberIds.add(memberId);
    }
    cursor = response.response_metadata?.next_cursor || undefined;
  } while (cursor);

  return memberIds;
};

const getGuestUserIds = async (client: SlackAPIClient): Promise<Set<string>> => {
  const guestUserIds = new Set<string>();
  let cursor: string | undefined;

  do {
    const response = await client.users.list({
      limit: 1000,
      ...cursor ? { cursor } : {},
    });
    for (const member of response.members ?? []) {
      if (member.id && !member.deleted && (member.is_restricted || member.is_ultra_restricted)) {
        guestUserIds.add(member.id);
      }
    }
    cursor = response.response_metadata?.next_cursor || undefined;
  } while (cursor);

  return guestUserIds;
};

// ゲストや社外のメンバーは参加していないチャンネルの内容を閲覧できないため、
// そのようなメンバーがいるチャンネルではSlackの検索結果を回答に含めないようにする
export const hasRestrictedAudience = async (client: SlackAPIClient, channel: string): Promise<boolean> => {
  try {
    const { channel: info } = await client.conversations.info({ channel });
    if (!info || info.is_ext_shared || info.is_pending_ext_shared || info.is_shared || info.is_org_shared) {
      return true;
    }

    const [memberIds, guestUserIds] = await Promise.all([
      getChannelMemberIds(client, channel),
      getGuestUserIds(client),
    ]);

    return [...memberIds].some((memberId) => guestUserIds.has(memberId));
  } catch (error) {
    // 判定できない場合は情報漏洩を防ぐために制限付きとして扱う
    console.error('Failed to check the audience of the channel.', error);
    return true;
  }
};
