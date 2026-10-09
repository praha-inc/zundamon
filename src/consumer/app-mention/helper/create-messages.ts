import { AIMessage, HumanMessage, trimMessages } from '@langchain/core/messages';

import type { ThreadMessage } from './get-thread-messages';
import type { BaseMessage } from '@langchain/core/messages';

// GPT-6.1は入力が272Kトークンを超えるとリクエスト全体が割増料金になるため、
// システムプロンプトや画像、ツールの実行結果を含めても超えないように余裕を持たせる
const MAX_HISTORY_TOKENS = 200_000;

// tiktokenで数えるとWorkersのメモリとCPU時間を大きく消費するため、文字数をトークン数の近似値として使う
// 日本語は1文字あたり1トークン未満になることが多いため、トークン数は多めに見積もられる
const countTokens = (messages: BaseMessage[]): number => {
  return messages.reduce((sum, message) => sum + message.text.length, 0);
};

export type CreateMessagesParameters = {
  botUserId: string;
  history: ThreadMessage[];
  mention: {
    ts: string;
    userId: string;
    text: string;
    images: string[];
  };
};

// スレッドの会話履歴と今回のメンションから、グラフに最初に渡すメッセージを組み立てる
export const createMessages = async ({
  botUserId,
  history,
  mention,
}: CreateMessagesParameters): Promise<BaseMessage[]> => {
  const replies = history
    // 今回のメンションは画像と合わせて別のメッセージとして渡すため、会話履歴からは除外する
    .filter((message) => message.ts !== mention.ts)
    .map((message) => {
      if (message.userId === botUserId) {
        return new AIMessage(message.text);
      }

      return new HumanMessage(`[UserId: ${message.userId}]\n${message.text}`);
    });

  return [
    ...await trimMessages(replies, {
      maxTokens: MAX_HISTORY_TOKENS,
      tokenCounter: countTokens,
      strategy: 'last',
    }),
    new HumanMessage({
      content: [
        {
          type: 'text',
          text: `[UserId: ${mention.userId}]\n${mention.text}`,
        },
        ...mention.images.map((base64) => ({
          type: 'image_url',
          image_url: {
            url: base64,
            detail: 'high',
          },
        })),
      ],
    }),
  ];
};
