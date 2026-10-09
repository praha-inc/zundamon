import { SlackAPIError } from 'slack-edge';

import type { SlackAPIClient } from 'slack-edge';

// chat.appendStreamは毎分100回程度に制限されているため、生成されたテキストをまとめてから送る
// WorkersのDate.now()はI/Oが発生した時にしか進まず経過時間では間引けないため、Slack公式SDKのデフォルトに合わせて文字数で区切る
const APPEND_BUFFER_SIZE = 256;

// stopped: ユーザーがSlack上でストリーミングを停止した
// unavailable: ストリーミングできなかったため、回答は最後にプレースホルダーを更新して送る
type StreamState
  = | { type: 'idle' }
    | { type: 'streaming'; ts: string }
    | { type: 'stopped' }
    | { type: 'unavailable' };

const isStoppedByUser = (error: unknown): boolean => {
  return error instanceof SlackAPIError && error.error === 'stopped_by_user';
};

export type CreateReplyParameters = {
  channel: string;
  threadTs: string;
  placeholderTs: string;
  recipientUserId: string;
  recipientTeamId: string;
};

export type Reply = {
  update: (status: string) => Promise<void>;
  append: (delta: string) => Promise<void>;
  complete: (text: string) => Promise<void>;
  fail: (text: string) => Promise<void>;
};

// 回答が始まるまではプレースホルダーのメッセージで進捗を伝え、回答はストリーミングで新しいメッセージとして送る
export const createReply = (
  client: SlackAPIClient,
  {
    channel,
    threadTs,
    placeholderTs,
    recipientUserId,
    recipientTeamId,
  }: CreateReplyParameters,
): Reply => {
  let status: string | undefined;
  let state: StreamState = { type: 'idle' };
  let buffer = '';

  const deletePlaceholder = async () => {
    try {
      await client.chat.delete({ channel, ts: placeholderTs });
    } catch (error) {
      console.error('Failed to delete the placeholder message.', error);
    }
  };

  // 途中までしか送れていない回答が残らないように、ストリーミングを終了してから削除する
  // 削除に失敗した場合でも途中で途切れていることが分かるように、終了時に注記を付けておく
  const discardStream = async (ts: string) => {
    try {
      await client.chat.stopStream({ channel, ts, markdown_text: '\n\n（回答が途中で途切れてしまったのだ…）' });
    } catch (error) {
      console.error('Failed to stop the partial answer.', error);
    }

    try {
      await client.chat.delete({ channel, ts });
    } catch (error) {
      console.error('Failed to delete the partial answer.', error);
    }
  };

  const flush = async () => {
    const text = buffer;
    buffer = '';

    try {
      if (state.type === 'streaming') {
        await client.chat.appendStream({ channel, ts: state.ts, markdown_text: text });
        return;
      }

      // チャンネルでストリーミングする場合は受信するユーザーとそのチームの指定が必須になる
      const response = await client.chat.startStream({
        channel: channel,
        thread_ts: threadTs,
        recipient_user_id: recipientUserId,
        recipient_team_id: recipientTeamId,
        markdown_text: text,
      });
      if (!response.ts) {
        throw new Error('The ts of the streaming message was not returned.');
      }
      state = { type: 'streaming', ts: response.ts };
    } catch (error) {
      if (isStoppedByUser(error)) {
        state = { type: 'stopped' };
        return;
      }

      // ストリーミングに失敗しても回答の全文は最後に受け取れるため、従来通りプレースホルダーの更新に切り替える
      console.error('Failed to stream the answer. Falling back to updating the placeholder message.', error);
      if (state.type === 'streaming') {
        await discardStream(state.ts);
      }
      state = { type: 'unavailable' };
    }
  };

  return {
    update: async (text) => {
      if (text === status) return;
      status = text;

      // 進捗の表示は補助的なものなので、失敗しても回答の生成は続ける
      try {
        await client.chat.update({ channel, ts: placeholderTs, text });
      } catch (error) {
        console.error('Failed to update the status.', error);
      }
    },
    append: async (delta) => {
      if (state.type === 'stopped' || state.type === 'unavailable') return;

      buffer += delta;
      // 回答が始まったことがすぐに伝わるように、最初の部分だけは溜めずにストリーミングを開始する
      if (state.type === 'streaming' && buffer.length < APPEND_BUFFER_SIZE) return;

      await flush();
    },
    complete: async (text) => {
      if (state.type === 'stopped') {
        await deletePlaceholder();
        return;
      }

      if (state.type === 'streaming') {
        try {
          await client.chat.stopStream({ channel, ts: state.ts, ...buffer ? { markdown_text: buffer } : {} });
          await deletePlaceholder();
          return;
        } catch (error) {
          if (isStoppedByUser(error)) {
            await deletePlaceholder();
            return;
          }

          console.error('Failed to complete the answer. Falling back to updating the placeholder message.', error);
          await discardStream(state.ts);
        }
      }

      await client.chat.update({
        channel: channel,
        ts: placeholderTs,
        text: text,
        blocks: [{ type: 'markdown', text }],
      });
    },
    fail: async (text) => {
      if (state.type === 'streaming') {
        await discardStream(state.ts);
      }

      try {
        await client.chat.update({ channel, ts: placeholderTs, text });
      } catch (error) {
        console.error('Failed to update the error message.', error);
      }
    },
  };
};
