import { getRetryable } from '@langchain/core/errors';
import { SlackAPIConnectionError, SlackAPIError } from 'slack-edge';

// Slackが一時的な障害の時に返すエラーコード
const TRANSIENT_SLACK_ERRORS = new Set([
  'ratelimited',
  'internal_error',
  'fatal_error',
  'service_unavailable',
]);

const isTransientStatus = (status: number): boolean => {
  return status === 408 || status === 429 || 500 <= status;
};

// 何度実行しても失敗するエラーでモデルを呼び直さないように、時間を置けば解消する可能性のある障害だけを再試行の対象にする
// GraphRecursionErrorやコンテキスト長の超過、Slackのブロックの上限超過などはここに該当しないため再試行しない
export const isRetryableError = (error: unknown): boolean => {
  // ChatOpenAIは内部で再試行した上で、レート制限やタイムアウトなど再試行で解消するエラーかどうかの印を付けている
  const retryable = getRetryable(error);
  if (retryable !== undefined) return retryable;

  // 通信自体に失敗した場合はstatusが-1になる
  if (error instanceof SlackAPIConnectionError) {
    return error.status === -1 || isTransientStatus(error.status);
  }

  if (error instanceof SlackAPIError) {
    return TRANSIENT_SLACK_ERRORS.has(error.error);
  }

  // OpenAIのAPIErrorのようにHTTPのステータスコードを持つエラー
  if (error instanceof Error && 'status' in error && typeof error.status === 'number') {
    return isTransientStatus(error.status);
  }

  return false;
};
