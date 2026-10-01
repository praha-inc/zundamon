import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import dedent from 'dedent';

import { repliesToText } from '../../helper/replies-to-history';

import type { Reply } from '../../type/reply';
import type { GraphNode } from '../type/graph-node';
import type { StructuredTool } from '@langchain/core/tools';
import type { ChatOpenAI } from '@langchain/openai';

export type CreateAgentNodeParameters = {
  chatModel: ChatOpenAI;
  tools: StructuredTool[];
  replies: Reply[];
};

export const createAgentNode = ({
  chatModel,
  tools,
  replies,
}: CreateAgentNodeParameters): GraphNode => {
  const model = chatModel.bindTools(tools);

  return {
    name: 'agent',
    action: async ({ context, messages }, config) => {
      const response = await model.invoke([
        new SystemMessage(dedent`
          Assistant is a large language model trained by OpenAI.
          Assistant is designed to be able to assist with a wide range of tasks, from answering simple questions to providing in-depth explanations and discussions on a wide range of topics. As a language model, Assistant is able to generate human-like text based on the input it receives, allowing it to engage in natural-sounding conversations and provide responses that are coherent and relevant to the topic at hand.
          Assistant is constantly learning and improving, and its capabilities are constantly evolving. It is able to process and understand large amounts of text, and can use this knowledge to provide accurate and informative responses to a wide range of questions. Additionally, Assistant is able to generate its own text based on the input it receives, allowing it to engage in discussions and provide explanations and descriptions on a wide range of topics.
          Overall, Assistant is a powerful tool that can help with a wide range of tasks and provide valuable insights and information on a wide range of topics. Whether you need help with a specific question or just want to have a conversation about a particular topic, Assistant is here to assist.

          Constraints:
            - Please respond in Japanese.
            - Please use markdown format text decoration.
            - The chatbot's UserId is ${context.botUserId}.

          Previous conversation history (for last few only):
          ${repliesToText(replies.slice(-5))}

          New input from user:
          Human [UserId: ${context.replyUserId}]
          ${context.replyUserText}
        `),
        ...(context.images.length
          ? [new HumanMessage({
              content: context.images.map((base64) => ({
                type: 'image_url',
                image_url: {
                  url: base64,
                  detail: 'high',
                },
              })),
            })]
          : []),
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
