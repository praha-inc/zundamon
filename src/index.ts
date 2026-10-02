import { SlackApp } from 'slack-edge';

import { appMentionEventHandler } from './consumer/app-mention';
import { appMentionHandler } from './event/app-mention';

import type { Env } from './type/env';
import type { QueueMessageBody } from './type/queue-message-body';

// oxlint-disable-next-line import/no-anonymous-default-export
export default {
  async fetch(
    request: Request,
    env: Env,
    context: ExecutionContext,
  ): Promise<Response> {
    const app = new SlackApp({ env });

    app.event('app_mention', appMentionHandler);

    return await app.run(request, context);
  },
  async queue(
    batch: MessageBatch<QueueMessageBody>,
    env: Env,
  ): Promise<void> {
    await Promise.all(batch.messages.map(async (message) => {
      switch (message.body.type) {
        case 'app-mention': {
          await appMentionEventHandler(env, message);
          break;
        }
      }
    }));
  },
};
