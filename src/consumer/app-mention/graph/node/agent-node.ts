import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import dedent from 'dedent';

import type { Reply } from '../../type/reply';
import type { GraphNode } from '../type/graph-node';
import type { BindToolsInput } from '@langchain/core/language_models/chat_models';
import type { ChatOpenAI } from '@langchain/openai';

export type CreateAgentNodeParameters = {
  model: ChatOpenAI;
  tools: BindToolsInput[];
  replies: Reply[];
};

export const createAgentNode = ({
  model,
  tools,
  replies,
}: CreateAgentNodeParameters): GraphNode => {
  const modelWithTools = model.bindTools(tools, {
    include: ['code_interpreter_call.outputs'],
  });

  return {
    name: 'agent',
    action: async ({ context, messages }, config) => {
      const response = await modelWithTools.invoke([
        new SystemMessage(dedent`
          Constraints:
            - Please respond in Japanese.
            - Please use markdown format text decoration.
            - The chatbot's UserId is ${context.botUserId}.
            - Each user message begins with the sender's UserId in the form "[UserId: Uxxxxxxxx]".
        `),
        ...replies.slice(-5).map((reply) => {
          if (reply.type === 'AI') {
            return new AIMessage(reply.content);
          }

          return new HumanMessage(`[UserId: ${reply.userId}]\n${reply.content}`);
        }),
        new HumanMessage({
          content: [
            {
              type: 'text',
              text: `[UserId: ${context.replyUserId}]\n${context.replyUserText}`,
            },
            ...context.images.map((base64) => ({
              type: 'image_url',
              image_url: {
                url: base64,
                detail: 'high',
              },
            })),
          ],
        }),
        ...messages,
      ], config);

      return {
        messages: [
          response,
        ],
      };
    },
  };
};
