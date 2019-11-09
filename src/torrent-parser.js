const fs = require('fs');
const bencode = require('bencode');
const crypto = require('crypto');
const BN = require('bn.js');

module.exports.open = (filepath) => {
  return bencode.decode(fs.readFileSync(filepath));
};

module.exports.size = torrent => {
  const size = torrent.info.files ?
    torrent.info.files.map(file => file.length)
      .reduce((a, b) => a + b, 0) :
    torrent.info.length;

  return new BN(size.toString(), 10).toBuffer('be', 8);
};

module.exports.infoHash = torrent => {
  const info = bencode.encode(torrent.info);
  return crypto.createHash('sha1').update(info).digest();
};