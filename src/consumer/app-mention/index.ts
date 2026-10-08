import { Buffer } from 'node:buffer';

import { markdownToBlocks } from '@tryfabric/mack';

import { createGraph } from './graph';
import { createSlackClient } from './helper/create-slack-client';

import type { AppMentionEvent } from './event';
import type { Env } from '../../type/env';
import type { AnyMessageBlock } from 'slack-edge';

export const appMentionEventHandler = async (
  env: Env,
  message: Message<AppMentionEvent>,
) => {
  const slackClient = createSlackClient(env);

  try {
    const graph = await createGraph({
      env,
      slackClient,
      event: message.body,
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

    const text = result.messages.at(-1)?.text ?? '';
    await slackClient.chat.update({
      channel: message.body.context.channel,
      ts: message.body.context.replyTs,
      text: text,
      blocks: await markdownToBlocks(text) as AnyMessageBlock[],
    });

    message.ack();
  } catch (error) {
    await slackClient.chat.update({
      channel: message.body.context.channel,
      ts: message.body.context.replyTs,
      text: 'エラーが発生したっぽいのだ。。。',
    });

    message.retry();
    throw error;
  }
};
