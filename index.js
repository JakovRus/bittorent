const tracker = require('./src/tracker');
const torrentParser = require('./src/torrent-parser');
const BN = require('bn.js');


// const torrent = torrentParser.open('big-buck-bunny.torrent');
const torrent = torrentParser.open('puppy.torrent');

tracker.getPeers(torrent, peers => {
  console.log('list of peers: ', peers);
});