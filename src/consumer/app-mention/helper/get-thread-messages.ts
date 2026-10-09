import type { SlackAPIClient } from 'slack-edge';

export type ThreadMessage = {
  userId: string;
  text: string;
  ts: string;
};

export type GetThreadMessagesParameters = {
  channel: string;
  threadTs: string;
  latest?: string;
  limit?: number;
};

export const getThreadMessages = async (
  client: SlackAPIClient,
  {
    channel,
    threadTs,
    latest,
    limit,
  }: GetThreadMessagesParameters,
): Promise<ThreadMessage[]> => {
  const replies = await client.conversations.replies({
    channel: channel,
    ts: threadTs,
    ...latest ? { latest } : {},
    ...limit ? { limit } : {},
  });

  return (replies.messages ?? []).map((message) => ({
    ts: message.ts ?? '',
    userId: message.user ?? '',
    text: message.text ?? '',
  }));
};
