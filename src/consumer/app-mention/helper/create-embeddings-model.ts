import { OpenAIEmbeddings } from '@langchain/openai';

import type { Env } from '../../../type/env';

export const createEmbeddingsModel = (env: Env) => {
  return new OpenAIEmbeddings({
    model: env.OPENAI_EMBEDDINGS_MODEL_NAME,
    apiKey: env.OPENAI_API_KEY,
    configuration: {
      baseURL: env.OPENAI_BASE_URL,
    },
  });
};
