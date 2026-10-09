import { Buffer } from 'node:buffer';

import { createGraph } from './graph';
import { createMessages } from './helper/create-messages';
import { createReply } from './helper/create-reply';
import { createSlackClient } from './helper/create-slack-client';
import { getThreadMessages } from './helper/get-thread-messages';
import { isRetryableError } from './helper/is-retryable-error';

import type { AppMentionEvent } from './event';
import type { Env } from '../../type/env';

// wrangler.tomlのmax_retriesと合わせる
const MAX_RETRIES = 3;

// 再試行の間隔は10秒、20秒、40秒と倍にしていく
const RETRY_BASE_DELAY_SECONDS = 10;

const THINKING_STATUS = '考え中なのだ…';

const RETRYING_STATUS = 'うまくいかなかったので、少し待ってからやり直すのだ…';

const TOOL_STATUSES: Record<string, string> = {
  slack_search: 'Slackを検索中なのだ…',
  web_search: 'Webを検索中なのだ…',
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
    const graph = createGraph({
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

    const [history, images] = await Promise.all([
      getThreadMessages(slackClient, {
        channel: message.body.context.channel,
        threadTs: message.body.context.threadTs,
        latest: message.body.context.replyTs,
      }),
      Promise.all(message.body.payload.images.map(async (image) => {
        const response = await fetch(image.url, {
          headers: {
            Authorization: `Bearer ${message.body.context.token}`,
          },
        });
        const buffer = await response.arrayBuffer();
        const base64 = Buffer.from(buffer).toString('base64');
        return `data:${image.mimetype};base64,${base64}`;
      })),
    ]);

    const messages = await createMessages({
      botUserId: message.body.context.bot,
      history: history,
      mention: {
        ts: message.body.payload.ts,
        userId: message.body.payload.user,
        text: message.body.payload.text,
        images: images,
      },
    });

    const result = await graph.invoke({ messages }, {
      context: {
        botUserId: message.body.context.bot,
      },
    });

    await reply.complete(result.messages.at(-1)?.text ?? '');

    message.ack();
  } catch (error) {
    console.error('Failed to answer the mention.', error);

    if (isRetryableError(error) && message.attempts <= MAX_RETRIES) {
      await reply.fail(RETRYING_STATUS);
      message.retry({ delaySeconds: RETRY_BASE_DELAY_SECONDS * 2 ** (message.attempts - 1) });
      return;
    }

    await reply.fail('エラーが発生したっぽいのだ。。。');
    message.ack();
  }
};
