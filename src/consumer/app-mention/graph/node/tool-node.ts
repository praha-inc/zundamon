import { FunctionMessage } from '@langchain/core/messages';
import { ToolExecutor } from '@langchain/langgraph/prebuilt';

import type { GraphNode } from '../type/graph-node';
import type { AgentAction } from '@langchain/core/agents';
import type { BaseMessage } from '@langchain/core/messages';
import type { StructuredTool } from '@langchain/core/tools';

const getAction = (messages: BaseMessage[]): AgentAction => {
  const lastMessage = messages.at(-1);
  if (!lastMessage) {
    throw new Error('No message found');
  }

  if (!lastMessage.additional_kwargs.function_call) {
    throw new Error('No function call found');
  }

  return {
    log: '',
    tool: lastMessage.additional_kwargs.function_call.name,
    // oxlint-disable-next-line @typescript-eslint/no-unsafe-assignment
    toolInput: JSON.parse(lastMessage.additional_kwargs.function_call.arguments),
  };
};

export type CreateToolNodeParameters = {
  tools: StructuredTool[];
};

export const createToolNode = ({
  tools,
}: CreateToolNodeParameters): GraphNode => {
  const toolExecutor = new ToolExecutor({
    tools,
  });

  return {
    name: 'tool',
    action: async ({ messages }, config) => {
      const action = getAction(messages);
      // oxlint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const response = await toolExecutor.invoke(action, config);

      return {
        messages: [
          new FunctionMessage({
            // oxlint-disable-next-line @typescript-eslint/no-unsafe-assignment
            content: response,
            name: action.tool,
          }),
        ],
      };
    },
  };
};
