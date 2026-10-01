import { MemoryVectorStore } from '@langchain/classic/vectorstores/memory';
import { Document } from '@langchain/core/documents';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod/v4';

import { createMapReduceSummarizationChain } from '../chain/map-reduce-summarization-chain';

import type { Reply } from '../type/reply';
import type { Embeddings } from '@langchain/core/embeddings';
import type { BaseLanguageModel } from '@langchain/core/language_models/base';
import type { ToolParams } from '@langchain/core/tools';

export interface ThreadSummaryToolParameters extends ToolParams {
  summaryModel: BaseLanguageModel;
  embeddingsModel: Embeddings;
  replies: Reply[];
}

export const createThreadSummaryTool = ({
  summaryModel,
  embeddingsModel,
  replies,
  ...parameters
}: ThreadSummaryToolParameters) => new DynamicStructuredTool({
  ...parameters,
  name: 'thread-summary',
  description: 'Useful for when you need to find something on or summarize a current thread.',
  schema: z.object({
    query: z.string().nullish().describe('What you want to find in the thread.'),
  }),
  func: async ({ query }, runManager) => {
    let documents = replies.map((reply) => new Document({
      pageContent: reply.content,
    }));

    if (query) {
      const vectorStore = await MemoryVectorStore.fromDocuments(documents, embeddingsModel);
      documents = await vectorStore.similaritySearch(
        query,
        4,
        undefined,
        runManager?.getChild('vectorstore'),
      );
    }

    const chain = createMapReduceSummarizationChain(summaryModel);

    const result = await chain.call({
      input_documents: documents,
    }, runManager?.getChild());

    return result['text'] as string;
  },
});
