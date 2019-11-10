const dgram = require('dgram');
const Buffer = require('buffer').Buffer;
const urlParse = require('url').parse;
const crypto = require('crypto');
const torrentParser = require('./torrent-parser');
const util = require('./util');

module.exports.getPeers = (torrent, callback) => {
  const socket = dgram.createSocket('udp4');
  const url = getUdpUrl(torrent);

  udpSend(socket, buildConnReq(), url);

  socket.on('message', response => {
    console.log(response);
    if(respType(response) === 'connect') {
      const connResp = parseConnResp(response);

      const announceReq = buildAnnounceReq(
        connResp.connectionId,
        torrent
      );

      udpSend(socket, announceReq, url);
    } else if(respType(response) === 'announce') {
      const announceResp = parseAnnounceResp(response);
      callback(announceResp.peers);
    }
  });
};

function getUdpUrl(torrent) {
  const list = torrent['announce-list'];
  if(!list) {
    return torrent.announce.toString('utf8');
  }

  const urls = list.map(url => url.toString('utf8'));

  const udpUrl = urls.find(url => url.slice(0, 3) === 'udp');

  if(!udpUrl) {
    throw new Error('Tracker doesn\'t response');
  }

  return udpUrl;
}
function udpSend(socket, message, rawUrl, callback = () => {}) {
  const url = urlParse(rawUrl);
  socket.send(message, 0, message.length, url.port, url.hostname, resp => console.log('resp: ', resp));
}

function respType(resp) {
  const action = resp.readUInt32BE(0);

  switch (action) {
    case 0: return 'connect';
    case 1: return 'announce';
    default: return '';
  }
}

function buildConnReq() {
  const buf = Buffer.alloc(16);

  buf.writeUInt32BE(0x417, 0);
  buf.writeUInt32BE(0x27101980, 4);
  buf.writeUInt32BE(0, 8);
  crypto.randomBytes(4).copy(buf, 12);

  return buf;
}

function parseConnResp(resp) {
  return {
    action: resp.readUInt32BE(0),
    transactionId: resp.readUInt32BE(4),
    connectionId: resp.slice(8),
  };
}

function buildAnnounceReq(connId, torrent, port=6881) {
  const buf = Buffer.alloc(98);

  connId.copy(buf, 0);
  buf.writeUInt32BE(1, 8);
  crypto.randomBytes(4).copy(buf, 12);
  torrentParser.infoHash(torrent).copy(buf, 16);
  util.genId().copy(buf, 36);
  Buffer.alloc(8).copy(buf, 56);
  torrentParser.size(torrent).copy(buf, 64);
  Buffer.alloc(8).copy(buf, 72);
  buf.writeUInt32BE(0, 80);
  buf.writeUInt32BE(0, 84);
  crypto.randomBytes(4).copy(buf, 88);
  buf.writeInt32BE(-1, 92);
  buf.writeUInt16BE(port, 96);

  return buf;
}

function parseAnnounceResp(resp) {
  function group(iterable, groupSize) {
    const groups = [];

    for(let i = 0; i < iterable.length; i += groupSize) {
      groups.push(iterable.slice(i, i + groupSize));
    }

    return groups;
  }

  return {
    action: resp.readUInt32BE(0),
    transactionId: resp.readUInt32BE(4),
    leechers: resp.readUInt32BE(8),
    seeders: resp.readUInt32BE(12),
    peers: group(resp.slice(20), 6)
      .map(address => {
        return {
          ip: address.slice(0, 4).join('.'),
          port: address.readUInt16BE(4),
        }
      })
  }
}