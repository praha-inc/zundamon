import type { QueueMessageBody } from './queue-message-body';
import type { SlackEdgeAppEnv } from 'slack-edge';

export type Env = SlackEdgeAppEnv & {
  OPENAI_API_KEY: string;
  OPENAI_CHAT_MODEL_NAME: string;
  OPENAI_SUMMARY_MODEL_NAME: string;
  OPENAI_ZUNDANIZE_MODEL_NAME: string;
  OPENAI_BASE_URL: string;
  QUEUE: Queue<QueueMessageBody>;
};
