const crypto = require('crypto');
const fs = require('fs');
const request = require('request-promise-native');

const algorithm = 'sha1';

module.exports = {
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
  fetchMessagesFromChannel: function(channel, channel_type) {
    return new Promise((resolve, reject) => {
      let url = 'https://slack.com/api/channels.history';
      if (channel_type === 'group') {
        url = 'https://slack.com/api/groups.history';
      }
      url += '?channel=' + channel;
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
  getMessagePermalink: function(message, channel) {
    return new Promise((resolve, reject) => {
      let url = 'https://slack.com/api/chat.getPermalink';
      url += '?channel=' + channel;
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
      .then((response) => {
        const data = JSON.parse(response.body);
        resolve({ data });
      })
      .catch((error) => {
        resolve({ error })
      })
    });
  },
  hashString: function(input) {
    const shasum = crypto.createHash(algorithm);
    shasum.update(input);
    const hash = shasum.digest('hex')
    return hash;
  }
}