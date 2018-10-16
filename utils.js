const crypto = require('crypto');
const fs = require('fs');
const request = require('request-promise-native');
const SlackBot = require('slackbots');

const algorithm = 'sha1';
const bot = new SlackBot({
  token: process.env.SLACK_BOT_TOKEN, 
  name: 'CopyCat'
});

const utils = {
  compareNewMessageToOldMessages: async function(messages) {
    let matches = [];
    if (messages.length < 2) {
      return matches;
    }
    const newMessage = messages[0];
    // get old messages
    // .filter(msg => (!msg.thread_ts && !msg.bot_id)): ignore threads and messages by bots
    // .slice(1): ignore the first message (which should be the new message)
    const oldMessages = messages.filter(msg => (!msg.thread_ts && !msg.bot_id)).slice(1);
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
    return matches;
  },
  deleteMessage: async function(message_ts, channel) {
    let url = 'https://slack.com/api/chat.delete';
    const response = await request({
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
    });
    const data = JSON.parse(response.body);
    return data.ok;
  },
  fetchMessagesFromChannel: async function(channel, channel_type) {
    let messages = [];
    let url = 'https://slack.com/api/channels.history';
    if (channel_type === 'group') {
      url = 'https://slack.com/api/groups.history';
    }
    url += '?channel=' + channel;
    url += '&token=' + process.env.SLACK_USER_TOKEN;
    const response = await request({
      url: url,
      method: 'GET',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      resolveWithFullResponse: true
    });
    const data = JSON.parse(response.body);
    if (data.ok && data.messages) {
      messages = data.messages;
    }
    return messages;
  },
  findUserById: async function(id) {
    let url = 'https://slack.com/api/users.info';
    url += '?user=' + id;
    url += '&token=' + process.env.SLACK_USER_TOKEN;
    const response = await request({
      url: url,
      method: 'GET',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      resolveWithFullResponse: true
    });
    const data = JSON.parse(response.body);
    return data.user;
  },
  getMessagePermalink: async function(message, channel) {
    let url = 'https://slack.com/api/chat.getPermalink';
    url += '?channel=' + channel;
    url += '&token=' + process.env.SLACK_BOT_TOKEN;
    url += '&message_ts=' + message.ts;
    const response = await request({
      url: url,
      method: 'GET',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      resolveWithFullResponse: true
    });
    const data = JSON.parse(response.body);
    return data.permalink;
  },
  hashString: function(input) {
    const shasum = crypto.createHash(algorithm);
    shasum.update(input);
    const hash = shasum.digest('hex')
    return hash;
  },
  reportDuplicate: async function(channel, originalMsg, copyMsg, user) {
    const linkToOriginalMsg = await utils.getMessagePermalink(originalMsg, channel);
    const linkToCopyMsg = await utils.getMessagePermalink(copyMsg, channel);
    try {
      const threadedMsg = await utils.reportDuplicateInChannelAsThread(channel, originalMsg, linkToOriginalMsg);
      await utils.reportDuplicateInChannelAsEphemeral(channel, originalMsg, copyMsg, user, linkToOriginalMsg, linkToCopyMsg, threadedMsg);
    } catch (error) {
      console.log('report dup: ', error);
      await utils.reportDuplicateToUser(channel, originalMsg, copyMsg, user, linkToOriginalMsg, linkToCopyMsg);
    }
  },
  reportDuplicateInChannelAsEphemeral: async function(channel, originalMsg, copyMsg, user, linkToOriginalMsg, linkToCopyMsg, threadedMsg) {
    // post ephemeral message in channel, visible only to user
    await bot.postEphemeral(
      channel,
      user,
      "The message you just posted is a copy of a recent message in this channel!",
      {
        attachments: [{
          title: 'original post',
          // title_link: linkToOriginalMsg,
          text: linkToOriginalMsg
        }, {
          title: 'copy',
          // title_link: linkToCopyMsg,
          text: linkToCopyMsg,
          fallback: 'Could not delete duplicate post.',
          callback_id: 'delete_copy',
          actions: [{
            name: 'copy',
            text: 'Delete Copy',
            style: 'danger',
            type: 'button',
            value: JSON.stringify({ message_ts: copyMsg.ts, threaded_message_ts: threadedMsg.ts })
          }]
        }]
      }
    );
  },
  reportDuplicateInChannelAsThread: async function(channel, originalMsg, linkToOriginalMsg) {
    const response = await bot.postMessage(
      channel,
      "This message is a copy of a recent message in this channel!",
      { 
        thread_ts: originalMsg.ts,
        attachments: [{
          title: 'original post',
          // title_link: linkToOriginalMsg,
          text: linkToOriginalMsg
        }]
      }
    );
    return response.message;
  },
  reportDuplicateToUser: async function(channel, originalMsg, copyMsg, userId, linkToOriginalMsg, linkToCopyMsg) {
    const user = await utils.findUserById(userId);
    await bot.postMessageToUser(
      user.name,
      "The message you just posted is a copy of a recent message in the channel!",
      {
        attachments: [{
          title: 'original post',
          // title_link: linkToOriginalMsg,
          text: linkToOriginalMsg
        }, {
          title: 'copy',
          // title_link: linkToCopyMsg,
          text: linkToCopyMsg,
          fallback: 'Could not delete duplicate post.',
          callback_id: 'delete_copy',
          actions: [{
            name: 'copy',
            text: 'Delete Copy',
            style: 'danger',
            type: 'button',
            value: JSON.stringify({ channel: channel, message_ts: copyMsg.ts })
          }]
        }]
      }
    );
  }
}

module.exports = utils;
