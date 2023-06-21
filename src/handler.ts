import {
  LogService,
  MatrixClient,
  MembershipEvent,
  MentionPill,
  MessageEvent,
  PowerLevelAction,
  RoomEvent,
  UserID
} from 'matrix-bot-sdk';
import mongoose from 'mongoose';
import svgCaptcha from 'svg-captcha';
import svg2png from 'svg2png';
import { runHelpCommand } from './commands/help.js';
import { runPingCommand } from './commands/ping.js';
import { runSpaceCommand } from './commands/space.js';
import config from './lib/config.js';
import { model as verifyingData } from './lib/schemas/verifying.js';

// The prefix required to trigger the bot. The bot will also respond
// to being pinged directly.
export const COMMAND_PREFIX = config.prefix ?? '!gate';

await mongoose.connect(process.env.MONGO_URI);

// This is where all of our commands will be handled
export default class CommandHandler {
  // Just some variables so we can cache the bot's display name and ID
  // for command matching later.
  private displayName: string | undefined;
  private userId: string | undefined;
  private localpart: string | undefined;

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

  private async onRoomEvent(roomId: string, ev: any) {
    if (ev.content.membership === 'leave') {
      // leave room if user has left and bot is the only one left
      const roomMembersCount = (await this.client.getRoomMembers(roomId)).length;
      if (roomMembersCount <= 2) await this.client.leaveRoom(roomId);
      const data = await verifyingData.findOne({
        verificationRoomId: roomId
      });
      if (data) {
        data.verificationRoomId = undefined;
        await data.save();
      }
      return;
    } else if (ev.content.membership === 'join') {
      const event = new MembershipEvent(ev);
      if (event.sender !== this.userId) {
        const data = await verifyingData.findOne({
          verificationRoomId: roomId
        });
        if (data?.verificationRoomId) {
          // user has joined verification room, create captcha
          const captchaWidth = 300;
          const captchaHeight = 100;
          const captchaChars = 7;

          const localCaptcha = svgCaptcha.create({
            size: captchaChars,
            background: '#d5fcc5',
            width: captchaWidth,
            height: captchaHeight,
            noise: 2
          });
          const captchaImageBuffer = await svg2png(Buffer.from(localCaptcha.data));
          const captchaSolution = localCaptcha.text;
          const captchaImageURL = await this.client.uploadContent(captchaImageBuffer, 'image/png');

          const mainRoomPill = await MentionPill.forRoom(data.mainRoomId, this.client);

          await this.client.sendHtmlNotice(
            data.verificationRoomId,
            `<h3>Please solve the following captcha to gain access to ${mainRoomPill.html}.</h3>`
          );

          const captchaImageJSON = {
            info: {
              mimetype: 'image/png',
              size: 0,
              w: captchaWidth,
              h: captchaHeight
              // 'xyz.amorgan.blurhash': 'L5Kn#htRo}s;xakCtQMy_Mt6RPRj'
            },
            msgtype: 'm.image',
            body: 'image.png',
            url: captchaImageURL
          };

          await this.client.sendRawEvent(data.verificationRoomId, 'm.room.message', captchaImageJSON);

          data.captchaAnswer = captchaSolution;
          await data.save();
        } else if (!data) {
          // user has joined main room, create verification room
          const preExistingData = await verifyingData.findOne({
            userId: event.sender,
            mainRoomId: roomId
          });
          if (preExistingData) {
            if (preExistingData?.verificationRoomId) {
              const joinedRooms = await this.client.getJoinedRooms();
              if (joinedRooms.includes(preExistingData.verificationRoomId))
                await this.client.leaveRoom(preExistingData.verificationRoomId);
            }
            preExistingData.deleteOne();
          }
          const data = new verifyingData({
            userId: event.sender,
            mainRoomId: roomId
          });
          await data.save();

          const permissionToSendMessage = await this.client.userHasPowerLevelFor(
            event.sender,
            roomId,
            'm.room.message',
            false
          );
          const powerLevelChange = await this.client.calculatePowerLevelChangeBoundsOn(event.sender, roomId);

          const powerLevelsEvent = await this.client.getRoomStateEvent(roomId, 'm.room.power_levels', undefined);
          if (!powerLevelsEvent) return LogService.error('power-levels', 'Room has no power levels event...');

          let requiredPower = 0;
          if (Number.isFinite(powerLevelsEvent['events_default'])) requiredPower = powerLevelsEvent['events_default'];
          if (Number.isFinite(powerLevelsEvent['events']?.['m.room.message']))
            requiredPower = powerLevelsEvent['events']['m.room.message'];

          if (powerLevelChange.canModify && permissionToSendMessage)
            await this.client
              .setUserPowerLevel(event.sender, roomId, requiredPower - 1)
              .catch(e => LogService.error('power', e));

          let mainRoomAlias = await this.client.getPublishedAlias(roomId);
          if (!mainRoomAlias)
            mainRoomAlias = (await this.client.getRoomState(roomId)).find(state => state.type == 'm.room.name')[
              'content'
            ]['name'];

          const verificationRoomId = await this.client
            .createRoom({
              name: `Verification | ${mainRoomAlias}`,
              is_direct: true,
              power_level_content_override: {
                invite: 100
              }
            })
            .catch(e => {
              LogService.error('verification-room', e);
            });
          // const verificationRoomId = await this.client.dms.getOrCreateDm(mainRoomEvent.sender);
          if (!verificationRoomId)
            return LogService.error(
              'verification-room',
              'A verification room was not created and so it does not exist.'
            );

          const inviteUserSuccess = await this.client.inviteUser(event.sender, verificationRoomId).catch(async e => {
            LogService.error('unable-to-invite-user-to-room', e);
            await this.client.leaveRoom(verificationRoomId);
            return false;
          });
          if (inviteUserSuccess === false) return;

          data.verificationRoomId = verificationRoomId;
          await data.save();

          return this.client.sendHtmlNotice(verificationRoomId, '<h3>Generating Captcha...</h3>');
        }
      }
    }

    if (ev.type === 'm.room.message' && ev.content.body && ev.sender !== this.userId) {
      const event = new MessageEvent(ev);
      const data = await verifyingData.findOne({
        userId: event.sender,
        verificationRoomId: roomId
      });
      if (data?.captchaAnswer) {
        // user has attempted captcha
        await this.client.sendReadReceipt(roomId, event.eventId);
        if (data.captchaAnswer === event.content.body) {
          const mainRoomPill = await MentionPill.forRoom(data.mainRoomId, this.client);
          const powerLevelChange = await this.client.calculatePowerLevelChangeBoundsOn(data.userId, data.mainRoomId);
          const powerLevelsEvent = await this.client.getRoomStateEvent(
            data.mainRoomId,
            'm.room.power_levels',
            undefined
          );
          if (!powerLevelsEvent) return LogService.error('power-levels', 'Room has no power levels event...');
          let requiredPower = 0;
          if (Number.isFinite(powerLevelsEvent['events_default'])) requiredPower = powerLevelsEvent['events_default'];
          if (Number.isFinite(powerLevelsEvent['events']?.['m.room.message']))
            requiredPower = powerLevelsEvent['events']['m.room.message'];
          await this.client.sendHtmlNotice(
            roomId,
            `<h3>Verification Complete</h3>You have been given access to ${mainRoomPill.html}. You may now leave this room.`
          );

          const permissionToSendMessage = await this.client.userHasPowerLevelFor(
            data.userId,
            data.mainRoomId,
            'm.room.message',
            false
          );

          // Add power level if statement check
          if (powerLevelChange.canModify && !permissionToSendMessage)
            await this.client
              .setUserPowerLevel(event.sender, data.mainRoomId, requiredPower)
              .catch(e => LogService.error('power', e));

          await this.client.leaveRoom(roomId, 'Verification Complete');
          await data.deleteOne();
          return;
        }
      }

      if (!data) {
        const mainRoomData = await verifyingData.findOne({
          userId: event.sender,
          mainRoomId: roomId
        });
        if (mainRoomData) {
          // user is attempting to talk in main room but has not verified yet
          const userId = this.userId;
          if (!userId) return;
          const permissionToRedact = await this.client.userHasPowerLevelForAction(
            userId,
            mainRoomData.mainRoomId,
            PowerLevelAction.RedactEvents
          );
          if (permissionToRedact)
            await this.client.redactEvent(roomId, event.eventId, 'User has not yet completed verification');
          return;
        }
      }
    }
  }
}
