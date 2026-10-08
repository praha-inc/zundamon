import { AIMessage, HumanMessage, SystemMessage, trimMessages } from '@langchain/core/messages';
import dedent from 'dedent';

import type { Reply } from '../../type/reply';
import type { GraphNode } from '../type/graph-node';
import type { BindToolsInput } from '@langchain/core/language_models/chat_models';
import type { BaseMessage } from '@langchain/core/messages';
import type { ChatOpenAI } from '@langchain/openai';

// GPT-6.1は入力が272Kトークンを超えるとリクエスト全体が割増料金になるため、
// システムプロンプトや画像、ツールの実行結果を含めても超えないように余裕を持たせる
const MAX_HISTORY_TOKENS = 200_000;

// tiktokenで数えるとWorkersのメモリとCPU時間を大きく消費するため、文字数をトークン数の近似値として使う
// 日本語は1文字あたり1トークン未満になることが多いため、トークン数は多めに見積もられる
const countTokens = (messages: BaseMessage[]): number => {
  return messages.reduce((sum, message) => sum + message.text.length, 0);
};

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
        ...await trimMessages(replies.map((reply) => {
          if (reply.type === 'AI') {
            return new AIMessage(reply.content);
          }

          return new HumanMessage(`[UserId: ${reply.userId}]\n${reply.content}`);
        }), {
          maxTokens: MAX_HISTORY_TOKENS,
          tokenCounter: countTokens,
          strategy: 'last',
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
