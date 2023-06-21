import config from '../config.json' assert { type: 'json' };
import './utils/setup.js';

declare module '@skyra/env-utilities' {
  interface Env {
    ACCESS_TOKEN: string;
  }
}

interface IConfig {
  homeserverUrl: string;
  usersWithPerms: string[];
  prefix: string;
  autoJoin: boolean;
  dataPath: string;
  developerMode: boolean;
  encryption: boolean;
}

export default <IConfig>config;
