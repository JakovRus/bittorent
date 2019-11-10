const torrentParser = require('./src/torrent-parser');
const download = require('./src/download');

// const torrent = torrentParser.open('big-buck-bunny.torrent');
const torrent = torrentParser.open('garden.torrent');
download(torrent, torrent.info.name);