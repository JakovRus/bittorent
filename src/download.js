const net = require('net');
const Buffer = require('buffer').Buffer;
const tracker = require('./tracker');
const message = require('./message');

module.exports = torrent => {
  tracker.getPeers(torrent, peers => {
    peers.forEach(peer => download(peer, torrent));
  });
};

function download(peer, torrent) {
  const socket = new net.Socket();

  socket.on('error', error => console.log('In ', peer.ip, ':', peer.port, ': ', error));
  socket.connect(peer.port, peer.ip, () => {
    console.log('connected to ', peer.ip, ':', peer.port);
    socket.write(message.buildHandshake(torrent));
  });

  onWholeMsg(socket, data => {
    msgHandler(data, socket);
  });
}

function msgHandler(msg, socket) {
 if(isHandshake(msg)) {
   socket.write(message.buildInterested());
 } else {
   const {id, payload} = message.parse(msg);

   switch (id) {
     case 0: {
       chokeHandler();
       break;
     }
     case 1: {
       unchokeHandler();
       break;
     }
     case 4: {
       haveHandler(payload);
       break;
     }
     case 5: {
       bitfieldHandler(payload);
       break;
     }
     case 7: {
       pieceHandler(payload);
       break;
     }
   }
 }
}

function chokeHandler() {

}

function unchokeHandler() {

}

function haveHandler() {

}

function bitfieldHandler() {

}

function pieceHandler() {

}

function isHandshake(msg) {
  return msg.length === msg.readUInt8(0) + 49 &&
    msg.toString('utf8', 1) === 'BitTorrent protocol';
}

function onWholeMsg(socket, callback) {
  let savedBuf = Buffer.alloc(0);
  let handshake = true;

  socket.on('data', receivedBuf => {
    const msgLen = () => handshake ?
      savedBuf.readUInt8(0) + 49 :
      savedBuf.readInt32BE(0) + 4;
    savedBuf = Buffer.concat([savedBuf, receivedBuf]);

    while(savedBuf.length > 4 && savedBuf.length >= msgLen()) {
      callback(savedBuf.slice(0, msgLen()));
      savedBuf = savedBuf.slice(msgLen());
      handshake = false;
    }

  })
}