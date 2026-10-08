// action_tokenはslack-edgeの型定義に含まれていないため、実際のペイロードから読み取る
// 公式ドキュメントではトップレベル、実装例によってはassistant_thread配下に含まれているため両方を確認する
export const getActionToken = (payload: object): string => {
  if ('action_token' in payload && typeof payload.action_token === 'string') {
    return payload.action_token;
  }

  if (
    'assistant_thread' in payload
    && typeof payload.assistant_thread === 'object'
    && payload.assistant_thread !== null
    && 'action_token' in payload.assistant_thread
    && typeof payload.assistant_thread.action_token === 'string'
  ) {
    return payload.assistant_thread.action_token;
  }

  throw new Error('The action_token was not found in the event payload. Make sure "Agents & AI Apps" is enabled for the Slack app.');
};
