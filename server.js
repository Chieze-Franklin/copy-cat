const dotenv = require('dotenv');
const Express = require('express');
const bodyParser = require('body-parser');
const SlackBot = require('slackbots');
const utils = require('./utils');

dotenv.config();

const bot = new SlackBot({
  token: process.env.SLACK_BOT_TOKEN, 
  name: 'copy-cat'
});

const app = new Express();

app.use(bodyParser.urlencoded({extended: false}));
app.use(bodyParser.json());

app.post('/delete', (req, res) => {
  const payload = JSON.parse(req.body.payload);
  const value = payload.actions[0].value;
  let message_ts = value;
  let channel = payload.channel.id;
  if (value.indexOf('|') > -1) {
    channel = value.split('|')[0];
    message_ts = value.split('|')[1];
  }
  utils.deleteMessage(message_ts, channel)
  .then((response) => {
    if (response.data.ok) {
      return res.status(200).send('Duplicate message deleted!');
    }

    return res.status(200).send('Could not delete duplicate message!');
  })
  .catch((err) => {
    return res.status(500).json(err);
  })
})

app.post('/message', (req, res) => {
  res.header('Content-Type', 'application/x-www-form-urlencoded');

  // if Slack is "challenging" our URL in order to verify it
  if (req.body.challenge) {
    return res.status(200).json({ challenge: req.body.challenge });
  }

  if (req.body.event && req.body.event.type === 'message' && !req.body.event.thread_ts) {
    // fetch all (text) messages from channel
    utils.fetchMessagesFromChannel(req.body.event.channel, req.body.event.channel_type)
    .then((response) => {
      if (response.data && response.data.ok && response.data.messages) {
        const newMessage = response.data.messages[0];
        const oldMessages = response.data.messages.filter(msg => !msg.thread_ts).slice(1); // ignore first message
        const matches = oldMessages.filter((msg) => {
          let match = (req.body.event.text || '').toLowerCase() === (msg.text || '').toLowerCase();
          console.log('1:', match);
          console.log('req.body.event.files && msg.files && match:', (req.body.event.files && msg.files && match));
          if (req.body.event.files && msg.files && match) { // no need entering this block if match is false
            // compare the metadata of their first files
            match = (req.body.event.files[0].mimetype === msg.files[0].mimetype) &&
              (req.body.event.files[0].size === msg.files[0].size) &&
              (req.body.event.files[0].original_w === msg.files[0].original_w) &&
              (req.body.event.files[0].original_h === msg.files[0].original_h);console.log('2:', match);
          }
          // if (req.body.event.files && match) { // no need entering this block if match is false
          //   // compare the hashes of the files
          //   match = req.body.event.files[0].url_private === msg.files[0].url_private;
          // }
          return match;
        });
        if (matches.length > 0) {
          // calculate permalink to original message
          const msg = matches[0];
          utils.getMessagePermalink(msg, req.body.event.channel)
          .then((response2) => {
            // post threaded message to copy message
            bot.postMessage(
              req.body.event.channel,
              "This message is a copy of a recent message in this channel!",
              { 
                thread_ts: newMessage.ts,
                attachments: [{
                  title: 'original post',
                  // title_link: response2.data.permalink,
                  text: response2.data.permalink
                }]
              }
            );

            // calculate permalink to new (copy) message
            utils.getMessagePermalink(newMessage, req.body.event.channel)
            .then((response3) => {
              // post ephemeral message to user
              bot.postEphemeral(req.body.event.channel, newMessage.user,
                "The message you just posted is a copy of a recent message in this channel!",
                {
                  attachments: [{
                    title: 'original post',
                    // title_link: response2.data.permalink,
                    text: response2.data.permalink
                  }, {
                    title: 'copy',
                    // title_link: response3.data.permalink,
                    text: response3.data.permalink,
                    fallback: 'Could not delete duplicate post.',
                    callback_id: 'delete_copy',
                    actions: [{
                      name: 'copy',
                      text: 'Delete Copy',
                      style: 'danger',
                      type: 'button',
                      value: newMessage.ts
                    }]
                  }]
                }
              )
              .then((response4) => {})
              .catch((err4) => {
                // if the bot could not post in the channel, send a DM to the user
                utils.findUserById(newMessage.user)
                .then((response5) => {
                  const username = response5.data.user.name;
                  bot.postMessageToUser(username, 
                    "The message you just posted is a copy of a recent message in the channel!",
                    {
                      attachments: [{
                        title: 'original post',
                        // title_link: response2.data.permalink,
                        text: response2.data.permalink
                      }, {
                        title: 'copy',
                        // title_link: response3.data.permalink,
                        text: response3.data.permalink,
                        fallback: 'Could not delete duplicate post.',
                        callback_id: 'delete_copy',
                        actions: [{
                          name: 'copy',
                          text: 'Delete Copy',
                          style: 'danger',
                          type: 'button',
                          value: req.body.event.channel + '|' + newMessage.ts
                        }]
                      }]
                    }
                  );
                })
                .catch((err5) => {console.log('err5:', err5)
                  return res.status(500).json(err5);
                })
              })
            })
            .catch((err3) => {console.log('err3:', err3)
              return res.status(500).json(err3);
            })
          })
          .catch((err2) => {console.log('err2:', err2)
            return res.status(500).json(err2);
          })
        }
      }
      //return res.status(200).send();
    })
    .catch((err) => {console.log('err:', err)
      return res.status(500).json(err);
    })
  }

  res.status(200).json({});
})

app.use('*', (req, res) => {
  res.redirect('https://github.com/Chieze-Franklin/copy-cat');
});

let server = app.listen(process.env.PORT || 5000, () => {
  let port = server.address().port;
  console.log(`Server started on port ${port}`)
})

bot.on('start', function() {
  var params = {
    icon_emoji: ':cat:'
  };

  // bot.postMessageToChannel('general', 'meow!');
});

bot.on('message', function(data) {
  // all ingoing events https://api.slack.com/rtm
});

// little hack to prevent app from sleeping on heroku
// https://quickleft.com/blog/6-easy-ways-to-prevent-your-heroku-node-app-from-sleeping/
if (process.env.NODE_ENV === 'production') {
  const https = require("https");
  setInterval(function() {
    https.get("https://copy-cat.herokuapp.com");
  }, 300000); // every 5 minutes
}
