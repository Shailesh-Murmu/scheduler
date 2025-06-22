const crypto = require('crypto');

module.exports = {
  generateToken: () => {
    return crypto.randomBytes(32).toString('hex');
  },
  setExpiration: () => {
    return Date.now() + 24 * 60 * 60 * 1000; // 24 hours
  }
};
