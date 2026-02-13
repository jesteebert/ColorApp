const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname)));

// Keep track of clients and roles
wss.on('connection', (ws, req) => {
  ws.isPhone = false;
  ws.isViewer = false;

  ws.on('message', (msg) => {
    try {
      const data = JSON.parse(msg.toString());
      if (data.type === 'introduce') {
        if (data.role === 'phone') {
          ws.isPhone = true;
          console.log('Phone connected');
        } else if (data.role === 'viewer') {
          ws.isViewer = true;
          console.log('Viewer connected');
        }
        return;
      }

      // If phone sends an image frame, broadcast to viewers
      if (data.type === 'frame' && typeof data.image === 'string') {
        // Reject oversized frames (~3.75MB image limit)
        if (data.image.length > 5_000_000) {
          console.warn('Frame rejected: payload too large');
          return;
        }
        // Broadcast to all viewers connected
        wss.clients.forEach(client => {
          if (client.readyState === WebSocket.OPEN && client.isViewer) {
            client.send(JSON.stringify({
              type: 'frame',
              image: data.image,
              timestamp: Date.now()
            }));
          }
        });
      }
    } catch (e) {
      console.warn('Invalid msg', e);
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected. phone:', ws.isPhone, 'viewer:', ws.isViewer);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Open index.html on the computer and phone.html on your phone (see README steps).`);
});
