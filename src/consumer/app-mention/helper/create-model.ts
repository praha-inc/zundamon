import { ChatOpenAI } from '@langchain/openai';

import type { Env } from '../../../type/env';

export const createModel = (env: Env, model: string) => {
  return new ChatOpenAI({
    model,
    verbose: true,
    zdrEnabled: true,
    useResponsesApi: true,
    apiKey: env.OPENAI_API_KEY,
    configuration: {
      baseURL: env.OPENAI_BASE_URL,
    },
  });
};
