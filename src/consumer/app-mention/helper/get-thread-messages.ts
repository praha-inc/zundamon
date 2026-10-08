import type { SlackAPIClient } from 'slack-edge';

export type ThreadMessage = {
  userId: string;
  text: string;
};

export const getThreadMessages = async (
  client: SlackAPIClient,
  channel: string,
  threadTs: string,
): Promise<ThreadMessage[]> => {
  const replies = await client.conversations.replies({
    channel: channel,
    ts: threadTs,
    limit: 50,
  });

  return (replies.messages ?? []).map((message) => ({
    userId: message.user ?? '',
    text: message.text ?? '',
  }));
};
