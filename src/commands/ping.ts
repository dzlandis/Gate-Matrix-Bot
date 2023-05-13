import type { MatrixClient, MessageEvent, MessageEventContent } from 'matrix-bot-sdk';
import { format } from '../lib/utils/timeFormatter.js';

export async function runPingCommand(roomId: string, event: MessageEvent<MessageEventContent>, client: MatrixClient) {
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
  const latency = Math.round(Date.now() - event.timestamp);

  if (isThread)
    await client.sendMessage(roomId, {
      msgtype: 'm.notice',
      body: `🏓 Pong! Latency is \`${latency}ms\` and my uptime is \`${format(process.uptime() * 1000, true)}\``,
      format: 'org.matrix.custom.html',
      formatted_body: `<p>🏓 Pong! Latency is <code>${latency}ms</code> and my uptime is <code>${format(
        process.uptime() * 1000,
        true
      )}</code></p>`,
      'm.relates_to': {
        event_id: fullContent['m.relates_to']?.event_id,
        rel_type: 'm.thread'
      }
    });
  else
    await client.replyHtmlNotice(
      roomId,
      event,
      `<p>🏓 Pong! Latency is <code>${latency}ms</code> and my uptime is <code>${format(
        process.uptime() * 1000,
        true
      )}</code></p>`
    );
  if (!isThread) return client.setTyping(roomId, false);
}
