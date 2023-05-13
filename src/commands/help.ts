import type { MatrixClient, MessageEvent, MessageEventContent } from 'matrix-bot-sdk';
import { COMMAND_PREFIX } from '../handler.js';

export async function runHelpCommand(roomId: string, event: MessageEvent<MessageEventContent>, client: MatrixClient) {
  interface MyMessageEventContent extends MessageEventContent {
    'm.relates_to'?: {
      event_id: string;
      is_falling_back: boolean;
      'm.in_reply_to': { event_id: string };
      rel_type: string;
    };
  }

  function escapeHtml(string: string) {
    var str = '' + string;
    var match = RegExp(/["'&<>]/).exec(str);

    if (!match) {
      return str;
    }

    var escape;
    var html = '';
    var index = 0;
    var lastIndex = 0;

    for (index = match.index; index < str.length; index++) {
      switch (str.charCodeAt(index)) {
        case 34: // "
          escape = '&quot;';
          break;
        case 38: // &
          escape = '&amp;';
          break;
        case 39: // '
          escape = '&#39;';
          break;
        case 60: // <
          escape = '&lt;';
          break;
        case 62: // >
          escape = '&gt;';
          break;
        default:
          continue;
      }

      if (lastIndex !== index) {
        html += str.substring(lastIndex, index);
      }

      lastIndex = index + 1;
      html += escape;
    }

    return lastIndex !== index ? html + str.substring(lastIndex, index) : html;
  }

  const fullContent: MyMessageEventContent = event.content;
  let isThread = false;

  if (fullContent['m.relates_to']?.rel_type === 'm.thread') isThread = true;
  if (!isThread) client.setTyping(roomId, true);

  if (isThread)
    await client.sendMessage(roomId, {
      msgtype: 'm.notice',
      body: `Commands: \`\`\`\n\n\`${COMMAND_PREFIX} help - Displays this menu.\`\n\`${COMMAND_PREFIX} ping - Pings the bot and gives uptime.\`\n${COMMAND_PREFIX} space - Provides a link to join the Gate Bot space.\` \`\`\``,
      format: 'org.matrix.custom.html',
      formatted_body: `<h3>Commands</h3> <pre><code>${COMMAND_PREFIX} help - Displays this menu<br>${COMMAND_PREFIX} ping - Pings the bot and gives uptime.<br>${COMMAND_PREFIX} space - Provides a link to join the Gate Bot space.</code></pre>`,
      'm.relates_to': {
        event_id: fullContent['m.relates_to']?.event_id,
        rel_type: 'm.thread'
      }
    });
  else
    await client.replyHtmlNotice(
      roomId,
      event,
      `<h3>Commands</h3> <pre><code>${escapeHtml(
        `${COMMAND_PREFIX} help - Displays this menu.\n${COMMAND_PREFIX} ping - Pings the bot and gives uptime.\n${COMMAND_PREFIX} space - Provides a link to join the Gate Bot space.`
      )}</code></pre>`
    );
  if (!isThread) return client.setTyping(roomId, false);
}
