import { getActionToken } from './helper/get-action-token';
import { AppMentionEventSchema } from '../../consumer/app-mention/event';

import type { Env } from '../../type/env';
import type { EventLazyHandler } from 'slack-edge';

export const appMentionHandler: EventLazyHandler<'app_mention', Env> = async ({
  env,
  context,
  payload,
}) => {
  if (payload.edited) return;

  const actionToken = getActionToken(payload);
  const response = await context.say({
    text: '考え中なのだ。',
    thread_ts: payload.thread_ts || payload.ts,
  });

  const images = payload.files
    ?.filter((file) => file.mimetype.startsWith('image'))
    .map((file) => ({
      mimetype: file.mimetype,
      url: file.url_private_download,
    })) ?? [];

  await env.QUEUE.send(AppMentionEventSchema.parse({
    type: 'app-mention',
    context: {
      channel: context.channelId,
      threadTs: payload.thread_ts || payload.ts,
      replyTs: response.message?.ts,
      bot: context.botUserId,
      token: context.botToken,
      actionToken: actionToken,
    },
    payload: {
      ts: payload.ts,
      user: payload.user,
      text: payload.text,
      images: images,
    },
  }));
};
