const net = require('net');
const Buffer = require('buffer').Buffer;
const tracker = require('./tracker');
const message = require('./message');
const Pieces = require('./pieces');

module.exports = torrent => {
  const pieces = new Pieces(torrent.info.pieces.length / 20);

  tracker.getPeers(torrent, peers => {
    peers.forEach(peer => download(peer, torrent, pieces));
  });
};

function download(peer, torrent, pieces) {
  const socket = new net.Socket();

  socket.on('error', error => console.log('In ', peer.ip, ':', peer.port, ': ', error));

  socket.connect(peer.port, peer.ip, () => {
    console.log('connected to ', peer.ip, ':', peer.port);

    socket.write(message.buildHandshake(torrent));
  });

  const queue = {choked: true, queue: []};
  onWholeMsg(socket, data => {
    msgHandler(data, socket, pieces, queue);
  });
}

function msgHandler(msg, socket, pieces, queue) {
 if(isHandshake(msg)) {
   socket.write(message.buildInterested());
 } else {
   const {id, payload} = message.parse(msg);

   switch (id) {
     case 0: {
       chokeHandler(socket);
       break;
     }
     case 1: {
       unchokeHandler(socket, pieces, queue);
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

function chokeHandler(socket) {
  socket.end();
}

function unchokeHandler(socket, pieces, queue) {
  queue.choked = false;
  requestPiece(socket, pieces, queue);
}

function haveHandler(payload, socket, requested, queue) {
  const pieceIndex = payload.readUInt32BE(0);
  queue.push(pieceIndex);
  if (queue.length === 1) {
    requestPiece(socket, requested, queue);
  }
}

function bitfieldHandler() {

}

function pieceHandler(payload, socket, requested, queue) {
  queue.shift();
  requestPiece(socket, requested, queue);
}

function requestPiece(socket, pieces, queue) {
  if (queue.choked) {
    return null;
  }

  while (queue.queue.length) {
    const pieceIndex = queue.shift();
    if (pieces.needed(pieceIndex)) {
      socket.write(message.buildRequest(pieceIndex));
      pieces.addRequested(pieceIndex);
      break;
    }
  }
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