import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { toolsCondition } from '@langchain/langgraph/prebuilt';
import { tools } from '@langchain/openai';

import { createAgentNode } from './node/agent-node';
import { createToolNode } from './node/tool-node';
import { createZundanizeNode } from './node/zundanize-node';
import { createThreadSummaryTool } from '../tool/thread-summary-tool';

import type { GraphChannels } from './type/graph-channels';
import type { Reply } from '../type/reply';
import type { Embeddings } from '@langchain/core/embeddings';
import type { BaseMessage } from '@langchain/core/messages';
import type { ServerTool, StructuredTool } from '@langchain/core/tools';
import type { ChatOpenAI } from '@langchain/openai';

export type CreateGraphParameters = {
  chatModel: ChatOpenAI;
  summaryModel: ChatOpenAI;
  zundanizeModel: ChatOpenAI;
  embeddingsModel: Embeddings;
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
  replies,
}: CreateGraphParameters): Graph => {
  const clientTools: StructuredTool[] = [
    createThreadSummaryTool({ summaryModel, embeddingsModel, replies }),
  ];

  const serverTools: ServerTool[] = [
    tools.webSearch(),
    tools.codeInterpreter(),
  ];

  const agentNode = createAgentNode({ chatModel, tools: [...clientTools, ...serverTools], replies });
  const toolNode = createToolNode({ tools: clientTools });
  const zundanizeNode = createZundanizeNode({ zundanizeModel });

  return new StateGraph(Annotation.Root({
    context: Annotation<GraphChannels['context']>,
    messages: Annotation<BaseMessage[]>({
      reducer: (x, y) => [...x, ...y],
      default: () => [],
    }),
  }))
    .addNode(agentNode.name, agentNode.action)
    .addNode(toolNode.name, toolNode.action)
    .addNode(zundanizeNode.name, zundanizeNode.action)
    .addEdge(START, agentNode.name)
    .addConditionalEdges(agentNode.name, toolsCondition, {
      tools: toolNode.name,
      [END]: zundanizeNode.name,
    })
    .addEdge(toolNode.name, agentNode.name)
    .addEdge(zundanizeNode.name, END)
    .compile();
};
