import { Document } from '@langchain/core/documents';
import { AIMessage } from '@langchain/core/messages';

import { repliesToText } from '../../helper/replies-to-history';

import type { Reply } from '../../type/reply';
import type { GraphNode } from '../type/graph-node';
import type { VectorStore } from '@langchain/core/vectorstores';

export type CreateAgentNodeParameters = {
  conversationVectorStore: VectorStore;
  replies: Reply[];
};

export const createConversationStoreNode = ({
  conversationVectorStore,
  replies,
}: CreateAgentNodeParameters): GraphNode => {
  return {
    name: 'conversation-store',
    action: async ({ context, messages }) => {
      const lastMessage = messages.at(-1);
      if (!lastMessage || !AIMessage.isInstance(lastMessage)) {
        throw new Error('No message found');
      }

      await conversationVectorStore.addDocuments([
        new Document({
          pageContent: repliesToText([
            ...replies.slice(-5),
            { type: 'Human', userId: context.replyUserId, content: context.replyUserText },
            { type: 'AI', userId: context.botUserId, content: lastMessage.text },
          ]),
        }),
      ]);

      return {};
    },
  };
};
