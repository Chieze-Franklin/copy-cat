const crypto = require('crypto');
const fs = require('fs');
const algorithm = 'sha1';

module.exports = {
  hashString: function(input) {
    const shasum = crypto.createHash(algorithm);
    shasum.update(input);
    const hash = shasum.digest('hex')
    return hash;
  }
}