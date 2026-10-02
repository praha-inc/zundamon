import { ChatOpenAI } from '@langchain/openai';

import type { Env } from '../../../type/env';

export const createSummaryModel = (env: Env) => {
  return new ChatOpenAI({
    verbose: true,
    model: env.OPENAI_SUMMARY_MODEL_NAME,
    apiKey: env.OPENAI_API_KEY,
    configuration: {
      baseURL: env.OPENAI_BASE_URL,
    },
  });
};
