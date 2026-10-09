import { Buffer } from 'node:buffer';

import { createGraph } from './graph';
import { createReply } from './helper/create-reply';
import { createSlackClient } from './helper/create-slack-client';

import type { AppMentionEvent } from './event';
import type { Env } from '../../type/env';

const THINKING_STATUS = '考え中なのだ…';

const TOOL_STATUSES: Record<string, string> = {
  'slack-search': 'Slackを検索中なのだ…',
  'web_search': 'Webを検索中なのだ…',
};

export const appMentionEventHandler = async (
  env: Env,
  message: Message<AppMentionEvent>,
) => {
  const slackClient = createSlackClient(env);
  const reply = createReply(slackClient, {
    channel: message.body.context.channel,
    threadTs: message.body.context.threadTs,
    placeholderTs: message.body.context.replyTs,
    recipientUserId: message.body.payload.user,
    recipientTeamId: message.body.payload.team,
  });

  try {
    const graph = await createGraph({
      env,
      slackClient,
      event: message.body,
      onProgress: async (progress) => {
        switch (progress.type) {
          case 'thinking': {
            await reply.update(THINKING_STATUS);
            break;
          }
          case 'tool-call': {
            await reply.update(TOOL_STATUSES[progress.name] ?? THINKING_STATUS);
            break;
          }
          case 'answer': {
            await reply.append(progress.delta);
            break;
          }
        }
      },
    });

    const result = await graph.invoke({
      context: {
        botUserId: message.body.context.bot,
        replyUserId: message.body.payload.user,
        replyUserText: message.body.payload.text,
        images: await Promise.all(message.body.payload.images.map(async (image) => {
          const response = await fetch(image.url, {
            headers: {
              Authorization: `Bearer ${message.body.context.token}`,
            },
          });
          const buffer = await response.arrayBuffer();
          const base64 = Buffer.from(buffer).toString('base64');
          return `data:${image.mimetype};base64,${base64}`;
        })),
      },
    });

    await reply.complete(result.messages.at(-1)?.text ?? '');

    message.ack();
  } catch (error) {
    await reply.fail('エラーが発生したっぽいのだ。。。');

    message.retry();
    throw error;
  }
};
