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

app.post('/', (req, res) => {

  console.log('/message:', req.body);
})

app.post('/message', (req, res) => {
  res.header('Content-Type', 'application/x-www-form-urlencoded');

  // if Slack is "challenging" our URL in order to verify it
  if (req.body.challenge) {
    return res.status(200).json({ challenge: req.body.challenge });
  }

  if (req.body.event && req.body.event.type === 'message' && !req.body.event.thread_ts && req.body.event.text) {
    // fetch all (text) messages from channel
    utils.fetchMessagesFromChannel(req.body.event.channel, req.body.event.channel_type)
    .then((response) => {
      if (response.data && response.data.ok && response.data.messages) {
        const newMessage = response.data.messages[0];
        const oldMessages = response.data.messages.slice(1); // ignore first message
        const matches = oldMessages.filter((msg) => 
          req.body.event.text.toLowerCase() === msg.text.toLowerCase());
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
                    text: response3.data.permalink
                  }]
                }
              );
            })
            .catch((err3) => {
              return res.status(500).json(err3);
            })
          })
          .catch((err2) => {
            return res.status(500).json(err2);
          })
        }
      }
      return res.status(200).send();
    })
    .catch((err) => {
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
  console.log('message:', data);
});

// little hack to prevent app from sleeping on heroku
// https://quickleft.com/blog/6-easy-ways-to-prevent-your-heroku-node-app-from-sleeping/
if (process.env.NODE_ENV === 'production') {
  const https = require("https");
  setInterval(function() {
    https.get("https://copy-cat.herokuapp.com");
  }, 300000); // every 5 minutes
}
