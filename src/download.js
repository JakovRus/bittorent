const net = require('net');
const fs = require('fs');
const Buffer = require('buffer').Buffer;
const tracker = require('./tracker');
const message = require('./message');
const Pieces = require('./pieces');
const Queue = require('./Queue');

module.exports = (torrent, path) => {
  tracker.getPeers(torrent, peers => {
    console.log('peers: \n', peers);
    const pieces = new Pieces(torrent);
    const file = fs.openSync(path, 'w');

    peers.forEach(peer => download(peer, torrent, pieces, file));
  });
};

function download(peer, torrent, pieces, file) {
  const socket = new net.Socket();

  socket.on('error', () => {
    console.log(`Refused to connect to ${peer.ip}:${peer.port}`);
    socket.end();
  });

  socket.connect(peer.port, peer.ip, () => {
    console.log(`Connected to ${peer.ip}:${peer.port}`);

    socket.write(message.buildHandshake(torrent));
  });

  const queue = new Queue(torrent);
  onWholeMsg(socket, data => {
    msgHandler(data, socket, pieces, queue, torrent, file);
  });
}

function msgHandler(msg, socket, pieces, queue, torrent, file) {
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
       haveHandler(socket, pieces, queue, payload);
       break;
     }
     case 5: {
       bitfieldHandler(socket, pieces, queue, payload);
       break;
     }
     case 7: {
       pieceHandler(socket, pieces, queue, torrent, file, payload);
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

function haveHandler(socket, pieces, queue, payload) {
  const pieceIndex = payload.readUInt32BE(0);
  const queueEmpty = queue.length() === 0;

  queue.queue(pieceIndex);
  if (queueEmpty) {
    requestPiece(socket, pieces, queue);
  }
}

function bitfieldHandler(socket, pieces, queue, payload) {
  const queueEmpty = queue.length() === 0;

  payload.forEach((byte, i) => {
    for (let j = 0; j < 8; j++) {
      if (byte % 2) {
        queue.queue(i * 8 + 7 - j);
      }

      byte = Math.floor(byte / 2);
    }
  });

  if (queueEmpty) {
    requestPiece(socket, pieces, queue);
  }
}

function pieceHandler(socket, pieces, queue, torrent, file, pieceResp) {
  console.log('piece: \n', pieceResp);
  pieces.addReceived(pieceResp);

  const offset = pieceResp.index * torrent.info['piece length'] + pieceResp.begin;
  fs.write(file, pieceResp.block, 0, pieceResp.block.length, offset, () => {});

  if (pieces.isDone()) {
    socket.end();
    console.log('DONE!');
    try { fs.closeSync(file); } catch(e) {}
  } else {
    requestPiece(socket,pieces, queue);
  }
}

function requestPiece(socket, pieces, queue) {
  if (queue.choked) {
    return null;
  }

  while (queue.length()) {
    const pieceBlock = queue.deque();
    if (pieces.needed(pieceBlock)) {
      socket.write(message.buildRequest(pieceBlock));
      pieces.addRequested(pieceBlock);
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