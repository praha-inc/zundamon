import { AIMessage } from '@langchain/core/messages';
import { Annotation, END, START, StateGraph } from '@langchain/langgraph';

import { createAgentNode } from './node/agent-node';
import { createConversationStoreNode } from './node/conversation-store-node';
import { createToolNode } from './node/tool-node';
import { createZundanizeNode } from './node/zundanize-node';
import { createCalculatorTool } from '../tool/calculator-tool';
import { createConversationSearchTool } from '../tool/conversation-search-tool';
import { createThreadSummaryTool } from '../tool/thread-summary-tool';
import { createWebSummaryTool } from '../tool/web-summary-tool';

import type { GraphChannels } from './type/graph-channels';
import type { Reply } from '../type/reply';
import type { Embeddings } from '@langchain/core/embeddings';
import type { BaseMessage } from '@langchain/core/messages';
import type { StructuredTool } from '@langchain/core/tools';
import type { VectorStore } from '@langchain/core/vectorstores';
import type { ChatOpenAI } from '@langchain/openai';

export type CreateGraphParameters = {
  chatModel: ChatOpenAI;
  summaryModel: ChatOpenAI;
  zundanizeModel: ChatOpenAI;
  embeddingsModel: Embeddings;
  conversationVectorStore: VectorStore;
  replies: Reply[];
};

export type Graph = {
  invoke: (input: Partial<GraphChannels>) => Promise<GraphChannels>;
};

export const createGraph = ({
  chatModel,
  summaryModel,
  zundanizeModel,
  embeddingsModel,
  conversationVectorStore,
  replies,
}: CreateGraphParameters): Graph => {
  const tools: StructuredTool[] = [
    createCalculatorTool(),
    createConversationSearchTool({ summaryModel, conversationVectorStore }),
    createThreadSummaryTool({ summaryModel, embeddingsModel, replies }),
    createWebSummaryTool({ summaryModel, embeddingsModel }),
  ];

  const agentNode = createAgentNode({ chatModel, tools, replies });
  const toolNode = createToolNode({ tools });
  const zundanizeNode = createZundanizeNode({ zundanizeModel });
  const conversationStoreNode = createConversationStoreNode({ conversationVectorStore, replies });

  const workflow = new StateGraph(Annotation.Root({
    context: Annotation<GraphChannels['context']>,
    messages: Annotation<BaseMessage[]>({
      reducer: (x, y) => [...x, ...y],
      default: () => [],
    }),
  }))
    .addNode(agentNode.name, agentNode.action)
    .addNode(toolNode.name, toolNode.action)
    .addNode(zundanizeNode.name, zundanizeNode.action)
    .addNode(conversationStoreNode.name, conversationStoreNode.action)
    .addEdge(START, agentNode.name)
    .addConditionalEdges(agentNode.name, ({ messages }: GraphChannels) => {
      const lastMessage = messages.at(-1);
      const hasToolCalls = !!lastMessage && AIMessage.isInstance(lastMessage) && !!lastMessage.tool_calls?.length;
      return hasToolCalls ? toolNode.name : zundanizeNode.name;
    }, {
      [toolNode.name]: toolNode.name,
      [zundanizeNode.name]: zundanizeNode.name,
    })
    .addEdge(toolNode.name, agentNode.name)
    .addEdge(zundanizeNode.name, conversationStoreNode.name)
    .addEdge(conversationStoreNode.name, END);

  return workflow.compile();
};
