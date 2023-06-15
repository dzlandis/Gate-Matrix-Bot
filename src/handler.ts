import {
  LogService,
  MatrixClient,
  MembershipEvent,
  MentionPill,
  MessageEvent,
  RoomEvent,
  UserID
} from 'matrix-bot-sdk';
import { runHelpCommand } from './commands/help.js';
import { runPingCommand } from './commands/ping.js';
import { runSpaceCommand } from './commands/space.js';
import config from './lib/config.js';

// The prefix required to trigger the bot. The bot will also respond
// to being pinged directly.
export const COMMAND_PREFIX = config.prefix ?? '!gate';

// This is where all of our commands will be handled
export default class CommandHandler {
  // Just some variables so we can cache the bot's display name and ID
  // for command matching later.
  private displayName: string | undefined;
  private userId: string | undefined;
  private localpart: string | undefined;
  private verificationRooms = new Set();

  constructor(private client: MatrixClient) {}

  public async start() {
    // Populate the variables above (async)
    await this.prepareProfile();

    // Set up the event handler
    this.client.on('room.message', this.onMessage.bind(this));
    this.client.on('room.event', this.onRoomEvent.bind(this));
    this.client.on('room.join', this.onRoomJoin.bind(this));
  }

  private async prepareProfile() {
    this.userId = await this.client.getUserId();
    this.localpart = new UserID(this.userId).localpart;

    try {
      const profile = await this.client.getUserProfile(this.userId);
      if (profile && profile['displayname']) this.displayName = profile['displayname'];
    } catch (e) {
      // Non-fatal error - we'll just log it and move on.
      LogService.warn('CommandHandler', e);
    }
  }

  private async onRoomJoin(roomId: string, ev: any) {
    const event = new MembershipEvent(ev);
    if (event.sender !== this.userId) return;
    const roomCreateEventRaw = await this.client.getRoomStateEvent(roomId, 'm.room.create', undefined);
    if (!roomCreateEventRaw) return;
    const roomCreateEvent = new RoomEvent(roomCreateEventRaw);
    if (roomCreateEvent.type === 'm.space')
      await this.client.leaveRoom(roomId, 'Spaces are not currently supported. Please invite to a room instead!');
  }

  private async onMessage(roomId: string, ev: any) {
    if (this.verificationRooms.has(roomId)) return;
    const event = new MessageEvent(ev);
    const userId = this.userId;
    if (!userId) return;
    if (event.isRedacted) return; // Ignore redacted events that come through
    if (event.sender === userId) return; // Ignore ourselves
    if (event.messageType !== 'm.text') return; // Ignore non-text messages
    const permissionToSendMessage = await this.client.userHasPowerLevelFor(userId, roomId, 'm.room.message', false);

    // Ensure that the event is a command before going on. We allow people to ping
    // the bot as well as using our COMMAND_PREFIX.
    const prefixes = [COMMAND_PREFIX, `${this.localpart}:`, `${this.displayName}:`, `${userId}:`];
    const prefixUsed = prefixes.find(p => event.textBody.startsWith(p));

    if (!prefixUsed) return; // Not a command (as far as we're concerned)

    // Check to see what the arguments were to the command
    const args = event.textBody.substring(prefixUsed.length).trim().split(' ');

    // Try and figure out what command the user ran, defaulting to help
    try {
      if (args[0] === 'ping' && permissionToSendMessage) return runPingCommand(roomId, event, this.client);
      else if (['space', 'support', 'room'].includes(args[0]) && permissionToSendMessage)
        return runSpaceCommand(roomId, event, this.client);
      else if (args[0] === 'help' && permissionToSendMessage) {
        return runHelpCommand(roomId, event, this.client);
      }
    } catch (e) {
      // Log the error
      LogService.error('CommandHandler', e);

      // Tell the user there was a problem
      const message = 'There was an error processing your command';
      return this.client.replyNotice(roomId, ev, message);
    }
  }

  private async onRoomEvent(mainRoomId: string, ev: any) {
    if (this.verificationRooms.has(mainRoomId)) return;
    const mainRoomEvent = new MembershipEvent(ev);
    if (mainRoomEvent.type !== 'm.room.member') return;
    if (mainRoomEvent.sender === this.userId) return;
    if (mainRoomEvent.content.membership !== 'join') return;
    if (!mainRoomEvent.sender) return;
    // await this.client.dms.update();
    // if (this.client.dms.isDm(mainRoomId)) return;

    let verificationComplete = false;

    this.client.on('room.message', async (roomId: string, ev: any) => {
      if (verificationComplete) return;
      if (roomId !== mainRoomId) return;
      const event = new MessageEvent(ev);
      if (event.sender === this.userId) return;
      if (mainRoomEvent.sender !== event.sender) return;

      await this.client.redactEvent(roomId, event.eventId, 'User has not yet completed verification');
    });

    const roomMembersCount = (await this.client.getRoomMembers(mainRoomId)).length;
    if (roomMembersCount <= 2) return;

    const permissionToSendMessage = await this.client.userHasPowerLevelFor(
      mainRoomEvent.sender,
      mainRoomId,
      'm.room.message',
      false
    );
    const powerLevelChange = await this.client.calculatePowerLevelChangeBoundsOn(mainRoomEvent.sender, mainRoomId);

    const powerLevelsEvent = await this.client.getRoomStateEvent(mainRoomId, 'm.room.power_levels', undefined);
    if (!powerLevelsEvent) return LogService.error('power-levels', 'Room has no power levels event...');

    let requiredPower = 0;
    if (Number.isFinite(powerLevelsEvent['events_default'])) requiredPower = powerLevelsEvent['events_default'];
    if (Number.isFinite(powerLevelsEvent['events']?.['m.room.message']))
      requiredPower = powerLevelsEvent['events']['m.room.message'];

    if (powerLevelChange.canModify && permissionToSendMessage)
      await this.client
        .setUserPowerLevel(mainRoomEvent.sender, mainRoomId, requiredPower - 1)
        .catch(e => LogService.error('power', e));

    let mainRoomAlias = await this.client.getPublishedAlias(mainRoomId);
    if (!mainRoomAlias)
      mainRoomAlias = (await this.client.getRoomState(mainRoomId)).find(state => state.type == 'm.room.name')[
        'content'
      ]['name'];

    const mainRoomPill = await MentionPill.forRoom(mainRoomId, this.client);

    const verificationRoomId = await this.client.createRoom({
      name: `Verification | ${mainRoomAlias}`,
      invite: [mainRoomEvent.sender],
      is_direct: true,
      power_level_content_override: {
        invite: 100
      }
    });
    // const verificationRoomId = await this.client.dms.getOrCreateDm(mainRoomEvent.sender);

    this.verificationRooms.add(verificationRoomId);

    this.client.sendHtmlNotice(verificationRoomId, '<h3>Generating Captcha...</h3>');

    this.client.on('room.event', async (roomId: string, ev: any) => {
      if (roomId !== verificationRoomId) return;
      const event = new MembershipEvent(ev);
      if (event.type !== 'm.room.member') return;
      if (event.sender === this.userId) return;
      if (!event.sender) return;
      if (event.sender !== mainRoomEvent.sender) return;
      if (event.content.membership !== 'join') return;

      const captchaWidth = 300;
      const captchaHeight = 100;
      const captchaChars = 7;

      const captchaFetch = await fetch(
        process.env.CAPTCHA_API + `?width=${captchaWidth}&height=${captchaHeight}&chars=${captchaChars}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'image/png',
            'x-captcha-solution': ''
          }
        }
      );
      if (!captchaFetch.ok) return LogService.error('captcha', 'Captcha API Fetch Failed');
      if (!captchaFetch.body) return LogService.error('catpcha', 'No image returned in body of Captcha API');
      const captchaImageArrayBuffer = await captchaFetch.arrayBuffer();
      const captchaImageBuffer = Buffer.from(captchaImageArrayBuffer);
      const captchaSolution = captchaFetch.headers.get('X-Captcha-Solution');
      if (!captchaSolution) return LogService.error('captcha', 'Captcha API did not return a solution to the captcha');

      const captchaImageURL = await this.client.uploadContent(captchaImageBuffer, 'image/png');

      await this.client.sendHtmlNotice(
        verificationRoomId,
        `<h3>Please solve the following captcha to gain access to ${mainRoomPill.html}.</h3>`
      );

      const captchaImageJSON = {
        info: {
          mimetype: 'image/png',
          size: captchaImageArrayBuffer.byteLength,
          w: captchaWidth,
          h: captchaHeight
          // 'xyz.amorgan.blurhash': 'L5Kn#htRo}s;xakCtQMy_Mt6RPRj'
        },
        msgtype: 'm.image',
        body: 'image.png',
        url: captchaImageURL
      };

      await this.client.sendRawEvent(verificationRoomId, 'm.room.message', captchaImageJSON);

      this.client.on('room.message', async (roomId: string, ev: any) => {
        if (roomId !== verificationRoomId) return;
        const event = new MessageEvent(ev);
        if (event.sender === this.userId) return;
        if (event.sender !== mainRoomEvent.sender) return;
        if (event.content.body !== captchaSolution) return;

        await this.client.sendHtmlNotice(
          roomId,
          `<h3>Verification Complete</h3>You have been given access to ${mainRoomPill.html}. You may now leave this room.`
        );

        const permissionToSendMessage = await this.client.userHasPowerLevelFor(
          mainRoomEvent.sender,
          mainRoomId,
          'm.room.message',
          false
        );

        // Add power level if statement check
        if (powerLevelChange.canModify && !permissionToSendMessage)
          await this.client
            .setUserPowerLevel(event.sender, mainRoomId, requiredPower)
            .catch(e => LogService.error('power', e));

        await this.client.leaveRoom(roomId, 'Verification Complete');
        verificationComplete = true;
        this.verificationRooms.delete(verificationRoomId);
      });
    });
  }
}
