import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { toolsCondition } from '@langchain/langgraph/prebuilt';
import { tools } from '@langchain/openai';

import { createAgentNode } from './node/agent-node';
import { createToolNode } from './node/tool-node';
import { createZundanizeNode } from './node/zundanize-node';
import { createSlackSearchTool } from '../tool/slack-search-tool';

import type { GraphChannels } from './type/graph-channels';
import type { Reply } from '../type/reply';
import type { BaseMessage } from '@langchain/core/messages';
import type { ServerTool, StructuredTool } from '@langchain/core/tools';
import type { ChatOpenAI } from '@langchain/openai';
import type { SlackAPIClient } from 'slack-edge';

export type CreateGraphParameters = {
  chatModel: ChatOpenAI;
  summaryModel: ChatOpenAI;
  zundanizeModel: ChatOpenAI;
  slackClient: SlackAPIClient;
  channel: string;
  threadTs: string;
  actionToken: string;
  replies: Reply[];
};

export type Graph = {
  invoke: (input: Partial<GraphChannels>) => Promise<GraphChannels>;
};

export const createGraph = ({
  chatModel,
  summaryModel,
  zundanizeModel,
  slackClient,
  channel,
  threadTs,
  actionToken,
  replies,
}: CreateGraphParameters): Graph => {
  const clientTools: StructuredTool[] = [
    createSlackSearchTool({ summaryModel, slackClient, actionToken, channel, threadTs }),
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
