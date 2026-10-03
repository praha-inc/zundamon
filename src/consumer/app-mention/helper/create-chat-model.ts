import { ChatOpenAI } from '@langchain/openai';

import type { Env } from '../../../type/env';

export const createChatModel = (env: Env) => {
  return new ChatOpenAI({
    verbose: true,
    useResponsesApi: true,
    model: env.OPENAI_CHAT_MODEL_NAME,
    apiKey: env.OPENAI_API_KEY,
    configuration: {
      baseURL: env.OPENAI_BASE_URL,
    },
  });
};
