const express = require('express');
const bodyParser = require('body-parser');
const utils = require('./utils');

const app = new express();

app.use(bodyParser.urlencoded({extended: false}));
app.use(bodyParser.json());

app.get('/', (req, res) => {
  // replace with your own implementation
  res.redirect('https://github.com/Chieze-Franklin/copy-cat');
});

app.post('/delete', async (req, res) => {
  try {
    const payload = JSON.parse(req.body.payload);
    const value = JSON.parse(payload.actions[0].value);
    let channel = value.channel || payload.channel.id;
    if (value.threaded_message_ts) {
      utils.deleteMessage(value.threaded_message_ts, channel)
    }
    const ok = await utils.deleteMessage(value.message_ts, channel);
    if (ok) {
      return res.status(200).send('Duplicate message deleted!');
    }
    return res.status(200).send(
      'Could not delete duplicate message!\n' +
      'This may happen if CopyCat was installed\n' +
      'by a user who is not an Admin of this workspace.'
    );
  } catch (error) {
    return res.status(500).json(error);
  }
})

app.post('/message', async (req, res) => {
  res.header('Content-Type', 'application/x-www-form-urlencoded');
  // if Slack is "challenging" our URL in order to verify it
  if (req.body.challenge) {
    return res.status(200).json({ challenge: req.body.challenge });
  }
  return res.status(200).json({});
})

app.use('/redirect', (req, res) => {
  console.log('redirect url');
});

let server = app.listen(process.env.PORT || 5000, () => {
  let port = server.address().port;
  console.log(`Server started on port ${port}`)
})
