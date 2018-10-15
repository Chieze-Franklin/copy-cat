const crypto = require('crypto');
const fs = require('fs');
const request = require('request-promise-native');

const algorithm = 'sha1';

const utils = {
  compareNewMessageToOldMessages: function(response) {
    return new Promise((resolve) => {
      let matches = [];
      if (response.data && response.data.ok && response.data.messages) {
        const newMessage = response.data.messages[0];
        // get old messages
        // .filter(msg => (!msg.thread_ts && !msg.bot_id)): ignore threads and messages by bots
        // .slice(1): ignore the first message (which should be the new message)
        const oldMessages = response.data.messages.filter(msg => (!msg.thread_ts && !msg.bot_id)).slice(1);
        matches = oldMessages.filter((msg) => {
          // compare message text
          let match = (newMessage.text || '').toLowerCase() === (msg.text || '').toLowerCase();
          // compare metadata of message file
          if (newMessage.files && msg.files && match) { // no need entering this block if match is false
            // compare the metadata of their first files
            match = (newMessage.files[0].mimetype === msg.files[0].mimetype) &&
              (newMessage.files[0].size === msg.files[0].size) &&
              (newMessage.files[0].original_w === msg.files[0].original_w) &&
              (newMessage.files[0].original_h === msg.files[0].original_h);
          }
          // if (newMessage.files && match) { // no need entering this block if match is false
          //   // compare the hashes of the files
          //   match = newMessage.files[0].url_private === msg.files[0].url_private;
          // }
          return match;
        });
        resolve({ matches, bot: response.bot, event: response.event });
      } else {
        resolve({ matches, bot: response.bot, event: response.event });
      }
    });
  },
  deleteMessage: function(message_ts, channel) {
    return new Promise((resolve, reject) => {
      let url = 'https://slack.com/api/chat.delete';
      request({
        url: url,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        formData: {
          token: process.env.SLACK_USER_TOKEN,
          channel: channel,
          ts: message_ts
        },
        resolveWithFullResponse: true
      })
      .then((response) => {
        const data = JSON.parse(response.body);
        resolve({ data });
      })
      .catch((error) => {
        resolve({ error })
      })
    });
  },
  fetchMessagesFromChannel: function(input) {
    return new Promise((resolve, reject) => {
      let url = 'https://slack.com/api/channels.history';
      if (input.event.channel_type === 'group') {
        url = 'https://slack.com/api/groups.history';
      }
      url += '?channel=' + input.event.channel;
      url += '&token=' + process.env.SLACK_USER_TOKEN;
      request({
        url: url,
        method: 'GET',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        resolveWithFullResponse: true
      })
      .then((response) => {
        const data = JSON.parse(response.body);
        resolve({ data, bot: input.bot, event: input.event });
      })
    });
  },
  findUserById: function(id) {
    return new Promise((resolve, reject) => {
      let url = 'https://slack.com/api/users.info';
      url += '?user=' + id;
      url += '&token=' + process.env.SLACK_USER_TOKEN;
      request({
        url: url,
        method: 'GET',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        resolveWithFullResponse: true
      })
      .then((response) => {
        const data = JSON.parse(response.body);
        resolve({ data });
      })
      .catch((error) => {
        resolve({ error })
      })
    });
  },
  getMessagePermalink: function(message, response) {
    return new Promise((resolve) => {
      let url = 'https://slack.com/api/chat.getPermalink';
      url += '?channel=' + response.event.channel;
      url += '&token=' + process.env.SLACK_BOT_TOKEN;
      url += '&message_ts=' + message.ts;
      request({
        url: url,
        method: 'GET',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        resolveWithFullResponse: true
      })
      .then((linkRes) => {
        const data = JSON.parse(linkRes.body);
        resolve({ data, bot: response.bot, event: response.event });
      })
    });
  },
  hashString: function(input) {
    const shasum = crypto.createHash(algorithm);
    shasum.update(input);
    const hash = shasum.digest('hex')
    return hash;
  },
  reportDuplicateInChannel: function(response) {
    const matches = response.matches;
    return new Promise((resolve, reject) => {
      if (matches.length > 0) {
        // calculate permalink to original message
        const originalMsg = matches[0];
        utils.getMessagePermalink(originalMsg, response)
        .then(utils.reportDuplicateInChannelAsThread)
        .then(utils.reportDuplicateInChannelAsEphemeral, utils.reportDuplicateInChannelAsEphemeral)
        .catch(utils.reportDuplicateToUser);
      } else {
        resolve({ bot: response.bot, event: response.event });
      }
    });
  },
  reportDuplicateInChannelAsEphemeral: function(response) {
    return new Promise((resolve, reject) => {
      // calculate permalink to new (copy) message
      utils.getMessagePermalink(response.event, response)
      .then((copyRes) => {
        // post ephemeral message in channel, visible only to user
        response.bot.postEphemeral(response.event.channel, response.event.user,
          "The message you just posted is a copy of a recent message in this channel!",
          {
            attachments: [{
              title: 'original post',
              // title_link: response.linkToOriginal,
              text: response.linkToOriginal
            }, {
              title: 'copy',
              // title_link: copyRes.data.permalink,
              text: copyRes.data.permalink,
              fallback: 'Could not delete duplicate post.',
              callback_id: 'delete_copy',
              actions: [{
                name: 'copy',
                text: 'Delete Copy',
                style: 'danger',
                type: 'button',
                value: JSON.stringify({ message_ts: response.event.ts, threaded_message_ts: (response.threadedMessage ? response.threadedMessage.ts : null)})
              }]
            }]
          }
        )
        .then((res) => {
          resolve({ bot: response.bot, event: response.event });
        })
        .catch((error) => {
          reject({ error, bot: response.bot, event: response.event, linkToOriginal: response.linkToOriginal, linkToCopy: copyRes.data.permalink });
        });
      });
    });
  },
  reportDuplicateInChannelAsThread: function(response) {
    return new Promise((resolve, reject) => {
      // post threaded message to copy message //******delete this too */
      response.bot.postMessage(
        response.event.channel,
        "This message is a copy of a recent message in this channel!",
        { 
          thread_ts: response.event.ts,
          attachments: [{
            title: 'original post',
            // title_link: response.data.permalink,
            text: response.data.permalink
          }]
        }
      )
      .then((res) => {
        resolve({ bot: response.bot, event: response.event, linkToOriginal: response.data.permalink, threadedMessage: res.message });
      })
      .catch((error) => {
        reject({ error, bot: response.bot, event: response.event, linkToOriginal: response.data.permalink });
      })
    });
  },
  reportDuplicateToUser: function(response) {
    return new Promise((resolve) => {
      utils.findUserById(response.event.user)
      .then((userRes) => {
        if (userRes.data.user) {
          const username = userRes.data.user.name;
          response.bot.postMessageToUser(username, 
            "The message you just posted is a copy of a recent message in the channel!",
            {
              attachments: [{
                title: 'original post',
                // title_link: response.linkToOriginal,
                text: response.linkToOriginal
              }, {
                title: 'copy',
                // title_link: response.linkToCopy,
                text: response.linkToCopy,
                fallback: 'Could not delete duplicate post.',
                callback_id: 'delete_copy',
                actions: [{
                  name: 'copy',
                  text: 'Delete Copy',
                  style: 'danger',
                  type: 'button',
                  value: JSON.stringify({ channel: response.event.channel, message_ts: response.event.ts, threaded_message_ts: (response.threadedMessage ? response.threadedMessage.ts : null)})
                }]
              }]
            }
          );
        }

        resolve();
      });
    });
  }
}

module.exports = utils;
