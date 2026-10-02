import { DynamicStructuredTool } from 'langchain/tools';
import { z } from 'zod';

import { createStuffSummarizationChain } from '../chain/stuff-summarization-chain';

import type { BaseLanguageModel } from 'langchain/base_language';
import type { ToolParams } from 'langchain/tools';
import type { VectorStore } from 'langchain/vectorstores/base';

export interface ConversationSearchToolParameters extends ToolParams {
  summaryModel: BaseLanguageModel;
  conversationVectorStore: VectorStore;
  threshold?: number;
}

export const createConversationSearchTool = ({
  summaryModel,
  conversationVectorStore,
  threshold = 0.25,
  ...parameters
}: ConversationSearchToolParameters) => new DynamicStructuredTool({
  ...parameters,
  name: 'conversation-summary',
  description: 'Useful for searching unfamiliar words or past conversation history.',
  schema: z.object({
    query: z.string().describe('A statement of the question about the information you want.'),
  }),
  func: async ({ query }, runManager) => {
    const documentWithScores = await conversationVectorStore.similaritySearchWithScore(
      query,
      10,
      undefined,
      runManager?.getChild('vectorstore'),
    );

    const documents = documentWithScores
      .filter(([, score]) => threshold < score)
      .map(([document]) => document);

    const chain = createStuffSummarizationChain(summaryModel);

    const result = await chain.invoke({
      input_documents: documents,
    }, runManager?.getChild());

    return result['text'] as string;
  },
});
