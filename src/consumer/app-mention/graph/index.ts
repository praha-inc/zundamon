import { END, MessagesAnnotation, START, StateGraph } from '@langchain/langgraph';
import { toolsCondition } from '@langchain/langgraph/prebuilt';
import { tools } from '@langchain/openai';

import { GraphContextSchema } from './graph-context';
import { createAgentNode } from './node/agent-node';
import { createToolNode } from './node/tool-node';
import { createZundanizeNode } from './node/zundanize-node';
import { createModel } from '../helper/create-model';
import { createSlackSearchTool } from '../tool/slack-search-tool';

import type { GraphContext } from './graph-context';
import type { GraphInput } from './type/graph-input';
import type { GraphProgressListener } from './type/graph-progress';
import type { Env } from '../../../type/env';
import type { AppMentionEvent } from '../event';
import type { ServerTool, StructuredTool } from '@langchain/core/tools';
import type { SlackAPIClient } from 'slack-edge';

export type CreateGraphParameters = {
  env: Env;
  event: AppMentionEvent;
  slackClient: SlackAPIClient;
  onProgress: GraphProgressListener;
};

export type Graph = {
  invoke: (input: GraphInput, options: { context: GraphContext }) => Promise<GraphInput>;
};

export const createGraph = ({
  env,
  event,
  slackClient,
  onProgress,
}: CreateGraphParameters): Graph => {
  const mediumModel = createModel(env, env.OPENAI_MEDIUM_MODEL_NAME);
  const smallModel = createModel(env, env.OPENAI_SMALL_MODEL_NAME);

  const clientTools: StructuredTool[] = [
    createSlackSearchTool({
      model: smallModel,
      slackClient,
      actionToken: event.context.actionToken,
      channel: event.context.channel,
      threadTs: event.context.threadTs,
    }),
  ];

  const serverTools: ServerTool[] = [
    tools.webSearch(),
    tools.codeInterpreter(),
  ];

  const agentNode = createAgentNode({ model: mediumModel, tools: [...clientTools, ...serverTools], onProgress });
  const toolNode = createToolNode({ tools: clientTools });
  const zundanizeNode = createZundanizeNode({ model: smallModel, onProgress });

  return new StateGraph(MessagesAnnotation, GraphContextSchema)
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
