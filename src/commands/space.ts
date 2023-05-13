import { MatrixClient, MentionPill, MessageEvent, type MessageEventContent } from 'matrix-bot-sdk';

export async function runSpaceCommand(roomId: string, event: MessageEvent<MessageEventContent>, client: MatrixClient) {
  interface MyMessageEventContent extends MessageEventContent {
    'm.relates_to'?: {
      event_id: string;
      is_falling_back: boolean;
      'm.in_reply_to': { event_id: string };
      rel_type: string;
    };
  }

  const fullContent: MyMessageEventContent = event.content;
  let isThread = false;

  if (fullContent['m.relates_to']?.rel_type === 'm.thread') isThread = true;
  if (!isThread) client.setTyping(roomId, true);
  const gateBotRoom = await MentionPill.forRoom('#gatebot:matrix.org', client);

  if (isThread)
    await client.sendMessage(roomId, {
      msgtype: 'm.notice',
      body: `Join our space here: ${gateBotRoom.html}`,
      format: 'org.matrix.custom.html',
      formatted_body: `<p>Join our space here: ${gateBotRoom.html}</p>`,
      'm.relates_to': {
        event_id: fullContent['m.relates_to']?.event_id,
        rel_type: 'm.thread'
      }
    });
  else await client.replyHtmlNotice(roomId, event, `<p>Join our space here: ${gateBotRoom.html}</p>`);
  if (!isThread) return client.setTyping(roomId, false);
}
