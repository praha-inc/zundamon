import { AIMessage, HumanMessage, SystemMessage, trimMessages } from '@langchain/core/messages';
import { concat } from '@langchain/core/utils/stream';
import dedent from 'dedent';
import { z } from 'zod';

import type { ThreadMessage } from '../../helper/get-thread-messages';
import type { GraphNode } from '../type/graph-node';
import type { GraphProgressListener } from '../type/graph-progress';
import type { BindToolsInput } from '@langchain/core/language_models/chat_models';
import type { AIMessageChunk, BaseMessage } from '@langchain/core/messages';
import type { ChatOpenAI } from '@langchain/openai';

// GPT-6.1は入力が272Kトークンを超えるとリクエスト全体が割増料金になるため、
// システムプロンプトや画像、ツールの実行結果を含めても超えないように余裕を持たせる
const MAX_HISTORY_TOKENS = 200_000;

// tiktokenで数えるとWorkersのメモリとCPU時間を大きく消費するため、文字数をトークン数の近似値として使う
// 日本語は1文字あたり1トークン未満になることが多いため、トークン数は多めに見積もられる
const countTokens = (messages: BaseMessage[]): number => {
  return messages.reduce((sum, message) => sum + message.text.length, 0);
};

// Web検索はOpenAIのサーバー側で実行されてtool_callsに現れないため、ストリーミング中の進捗イベントから検知する
// @langchain/openaiは進捗イベントをresponse_metadata.tool_outputsに { type, status } の形で渡してくる
const WebSearchProgressSchema = z.object({
  type: z.literal('web_search_call'),
  status: z.string(),
});

export type CreateAgentNodeParameters = {
  model: ChatOpenAI;
  tools: BindToolsInput[];
  replies: ThreadMessage[];
  onProgress: GraphProgressListener;
};

export const createAgentNode = ({
  model,
  tools,
  replies,
  onProgress,
}: CreateAgentNodeParameters): GraphNode => {
  const modelWithTools = model.bindTools(tools, {
    include: ['code_interpreter_call.outputs'],
  });

  return {
    name: 'agent',
    action: async ({ context, messages }, config) => {
      await onProgress({ type: 'thinking' });

      const stream = await modelWithTools.stream([
        new SystemMessage(dedent`
          Constraints:
            - Please respond in Japanese.
            - Please use markdown format text decoration.
            - The chatbot's UserId is ${context.botUserId}.
            - Each user message begins with the sender's UserId in the form "[UserId: Uxxxxxxxx]".
        `),
        ...await trimMessages(replies.map((reply) => {
          if (reply.userId === context.botUserId) {
            return new AIMessage(reply.text);
          }

          return new HumanMessage(`[UserId: ${reply.userId}]\n${reply.text}`);
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

      let response: AIMessageChunk | undefined;
      for await (const chunk of stream) {
        const webSearch = WebSearchProgressSchema.safeParse(chunk.response_metadata['tool_outputs']);
        if (webSearch.success) {
          await onProgress(webSearch.data.status === 'completed'
            ? { type: 'thinking' }
            : { type: 'tool-call', name: 'web_search' });
        }
        response = response ? concat(response, chunk) : chunk;
      }

      if (!response) {
        throw new Error('No response from the model');
      }

      for (const toolCall of response.tool_calls ?? []) {
        await onProgress({ type: 'tool-call', name: toolCall.name });
      }

      return {
        messages: [
          response,
        ],
      };
    },
  };
};
