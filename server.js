const dotenv = require('dotenv');
const Express = require('express');
const bodyParser = require('body-parser');
const SlackBot = require('slackbots');
const utils = require('./utils');

dotenv.config();

const bot = new SlackBot({
  token: process.env.SLACK_BOT_TOKEN, 
  name: 'CopyCat'
});

const app = new Express();

app.use(bodyParser.urlencoded({extended: false}));
app.use(bodyParser.json());

app.post('/delete', (req, res) => {
  const payload = JSON.parse(req.body.payload);
  const value = JSON.parse(payload.actions[0].value);
  let channel = value.channel || payload.channel.id;
  if (value.threaded_message_ts) {
    utils.deleteMessage(value.threaded_message_ts, channel)
  }
  utils.deleteMessage(value.message_ts, channel)
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

  if (req.body.event && req.body.event.type === 'message' && !req.body.event.thread_ts && !req.body.event.bot_id) {
    // fetch all (text) messages from channel
    utils.fetchMessagesFromChannel({ bot, event: req.body.event })
    .then(utils.compareNewMessageToOldMessages)
    .then(utils.reportDuplicateInChannel)
  } 
  
  return res.status(200).json({});
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
