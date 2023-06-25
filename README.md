# Gate Bot ([Matrix](https://matrix.org) Bot) 🛡

Gate Bot is a [Matrix](https://matrix.org) bot that enables Matrix room owners to establish a gate between new users and their community. Upon joining, users are unable to send messages in the room and are instead directed to solve a captcha in a separate direct message created by the bot. Once they have successfully solved the captcha, they are granted permission to communicate in the room and are considered verified. Gate Bot is an excellent tool for mitigating spam bots, as it adds an extra step for potential attackers before they can spam or raid a room.

![Gate Bot Demo (Gate Bot verifying a user via captcha)](https://i.imgur.com/omcxXGW.gif)

## Inviting 

Invite `@gatebot:matrix.org` to the room.

## Setup

After inviting Gate Bot to your room, it is important to grant it specific permissions to ensure its proper functioning. If you want Gate Bot to be able to delete messages from unverified users, you will need to authorize it to remove messages sent by others. Similarly, if you want Gate Bot to have the ability to mute or unmute users, you will need to grant it permission to modify user permissions.

To prevent new joining members from sending messages in a room, you can set the default send messages permission to a power level higher than the default (e.g., 1). This will make it so joining users are immediately muted on arrival. Once Gate Bot has the necessary permission to modify permissions, it can unmute users once they have completed the verification process. Alternatively, you can skip this step, and Gate Bot will handle muting or deleting messages from incoming users. However, please note that there may be a minor delay in this process.

## Discussion

- Matrix Space: [`#gatebot:matrix.org`](https://matrix.to/#/#gatebot:matrix.org)
- Support Room: [`#gatebotsupport:matrix.org`](https://matrix.to/#/#gatebotsupport:matrix.org)
- Meta/Discussion Room: [`#gatebotmeta:matrix.org`](https://matrix.to/#/#gatebotmeta:matrix.org)

> **Warning**
>
> Currently, the public version of Gate Bot under the `@gatebot:matrix.org` account does not work in encrypted rooms.