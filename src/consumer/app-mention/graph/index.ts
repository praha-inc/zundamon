import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { toolsCondition } from '@langchain/langgraph/prebuilt';
import { tools } from '@langchain/openai';

import { createAgentNode } from './node/agent-node';
import { createToolNode } from './node/tool-node';
import { createZundanizeNode } from './node/zundanize-node';
import { createModel } from '../helper/create-model';
import { createSlackSearchTool } from '../tool/slack-search-tool';

import type { GraphChannels } from './type/graph-channels';
import type { Env } from '../../../type/env';
import type { Reply } from '../type/reply';
import type { BaseMessage } from '@langchain/core/messages';
import type { ServerTool, StructuredTool } from '@langchain/core/tools';
import type { SlackAPIClient } from 'slack-edge';

export type CreateGraphParameters = {
  env: Env;
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
  env,
  slackClient,
  channel,
  threadTs,
  actionToken,
  replies,
}: CreateGraphParameters): Graph => {
  const mediumModel = createModel(env, env.OPENAI_MEDIUM_MODEL_NAME);
  const smallModel = createModel(env, env.OPENAI_SMALL_MODEL_NAME);

  const clientTools: StructuredTool[] = [
    createSlackSearchTool({ model: smallModel, slackClient, actionToken, channel, threadTs }),
  ];

  const serverTools: ServerTool[] = [
    tools.webSearch(),
    tools.codeInterpreter(),
  ];

  const agentNode = createAgentNode({ model: mediumModel, tools: [...clientTools, ...serverTools], replies });
  const toolNode = createToolNode({ tools: clientTools });
  const zundanizeNode = createZundanizeNode({ model: smallModel });

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
