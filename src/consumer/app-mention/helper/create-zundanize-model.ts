import { ChatOpenAI } from '@langchain/openai';

import type { Env } from '../../../type/env';

export const createZundanizeModel = (env: Env) => {
  return new ChatOpenAI({
    verbose: true,
    useResponsesApi: true,
    model: env.OPENAI_ZUNDANIZE_MODEL_NAME,
    apiKey: env.OPENAI_API_KEY,
    configuration: {
      baseURL: env.OPENAI_BASE_URL,
    },
  });
};
