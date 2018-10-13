const Express = require('express');
const bodyParser = require('body-parser');
const request = require('request-promise-native');
const SlackBot = require('slackbots');
const utils = require('./utils');

const bot = new SlackBot({
  token: 'xoxb-258316641222-456717969239-941OPgyqXKXg8F0D13LFJRR0', 
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

  let hash = '';

  // create a hash of the just-posted message (if message is text)
  if (req.body.event && req.body.event.type === 'message' && req.body.event.text) {
    hash = utils.hashString(req.body.event.text);
    console.log(req.body.event.text, ': ', hash);
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
