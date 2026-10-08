import { z } from 'zod';

import type { SlackAPIClient } from 'slack-edge';

const ContextMessageSchema = z.object({
  text: z.string().optional(),
});

const SearchContextResponseSchema = z.object({
  results: z.object({
    messages: z.array(z.object({
      author_name: z.string().optional(),
      channel_id: z.string(),
      channel_name: z.string().optional(),
      message_ts: z.string(),
      thread_ts: z.string().optional(),
      content: z.string().optional(),
      permalink: z.string(),
      context_messages: z.object({
        before: z.array(ContextMessageSchema).optional(),
        after: z.array(ContextMessageSchema).optional(),
      }).optional(),
    })).optional(),
  }).optional(),
});

export type SlackSearchMessage = {
  authorName: string;
  channelId: string;
  channelName: string;
  messageTs: string;
  threadTs: string | undefined;
  content: string;
  permalink: string;
  contextMessages: string[];
};

export type SearchSlackMessagesParameters = {
  query: string;
  actionToken: string;
  contextChannelId: string;
  after?: number | undefined;
  before?: number | undefined;
};

export const searchSlackMessages = async (
  client: SlackAPIClient,
  {
    query,
    actionToken,
    contextChannelId,
    after,
    before,
  }: SearchSlackMessagesParameters,
): Promise<SlackSearchMessage[]> => {
  // slack-edgeの現行バージョンにはassistant.search.contextの型付きメソッドが無いため汎用のcallを使用する
  const response = await client.call('assistant.search.context', {
    query: query,
    action_token: actionToken,
    context_channel_id: contextChannelId,
    channel_types: ['public_channel'],
    content_types: ['messages'],
    include_context_messages: true,
    limit: 20,
    sort: 'score',
    after: after,
    before: before,
  });

  const { results } = SearchContextResponseSchema.parse(response);

  return (results?.messages ?? []).map((message) => ({
    authorName: message.author_name ?? '',
    channelId: message.channel_id,
    channelName: message.channel_name ?? '',
    messageTs: message.message_ts,
    threadTs: message.thread_ts,
    content: message.content ?? '',
    permalink: message.permalink,
    contextMessages: [
      ...message.context_messages?.before ?? [],
      ...message.context_messages?.after ?? [],
    ].map((context) => context.text ?? ''),
  }));
};
