import {
  AutojoinRoomsMixin,
  AutojoinUpgradedRoomsMixin,
  LogLevel,
  LogService,
  MatrixClient,
  RichConsoleLogger,
  RustSdkCryptoStorageProvider,
  SimpleFsStorageProvider,
  SimpleRetryJoinStrategy
} from 'matrix-bot-sdk';
import path from 'path';
import CommandHandler from './handler.js';
import config from './lib/config.js';
import './lib/utils/setup.js';

// First things first: let's make the logs a bit prettier.
LogService.setLogger(new RichConsoleLogger());

// For now let's also make sure to log everything (for debugging)
if (config.developerMode) LogService.setLevel(LogLevel.DEBUG);

// Also let's mute Metrics, so we don't get *too* much noise
LogService.muteModule('Metrics');

// Print something so we know the bot is working
LogService.info('index', 'Bot starting...');

// This is the startup closure where we give ourselves an async context
(async function () {
  // Prepare the storage system for the bot
  const storage = new SimpleFsStorageProvider(path.join(config.dataPath, 'bot.json'));

  // Prepare a crypto store if we need that
  let cryptoStore;
  if (config.encryption) {
    cryptoStore = new RustSdkCryptoStorageProvider(path.join(config.dataPath, 'encrypted'));
  }

  // Now create the client
  const client = new MatrixClient(config.homeserverUrl, process.env.ACCESS_TOKEN, storage, cryptoStore);

  // Set join strategy
  client.setJoinStrategy(new SimpleRetryJoinStrategy());

  // Autojoin upgraded room
  AutojoinUpgradedRoomsMixin.setupOnClient(client);

  // Setup the autojoin mixin (if enabled)
  if (config.autoJoin) {
    AutojoinRoomsMixin.setupOnClient(client);
  }

  // Prepare the command handler
  const commands = new CommandHandler(client);
  await commands.start();

  LogService.info('index', 'Starting sync...');
  await client.start(); // This blocks until the bot is killed
})();
