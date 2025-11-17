// ========================================
// WebSocket Audio Relay Server for Glitch
// ========================================

const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Store connected clients
const clients = {
  esp32: null,
  web: new Set()
};

// Serve status page
app.get('/', (req, res) => {
  res.send(`
    <html>
      <head><title>ESP32 Audio Relay</title></head>
      <body style="font-family: Arial; padding: 20px; background: #f0f0f0;">
        <h1>🎤 ESP32 Audio WebSocket Relay</h1>
        <div style="background: white; padding: 20px; border-radius: 10px; margin: 20px 0;">
          <h2>📊 Server Status</h2>
          <p>✅ Server Running</p>
          <p>🔌 ESP32 Connected: <strong>${clients.esp32 ? 'YES' : 'NO'}</strong></p>
          <p>📱 Web Clients: <strong>${clients.web.size}</strong></p>
          <p>⏰ Uptime: ${Math.floor(process.uptime())} seconds</p>
        </div>
        <div style="background: white; padding: 20px; border-radius: 10px;">
          <h2>🔗 Connection Info</h2>
          <p>WebSocket URL: <code>wss://${req.headers.host}</code></p>
          <p>Refresh page to update stats</p>
        </div>
      </body>
    </html>
  `);
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    esp32Connected: !!clients.esp32,
    webClients: clients.web.size,
    uptime: process.uptime()
  });
});

// WebSocket connection handler
wss.on('connection', (ws, req) => {
  console.log('📱 New connection from:', req.socket.remoteAddress);
  
  let clientType = null;
  let isAlive = true;
  
  ws.on('pong', () => {
    isAlive = true;
  });

  ws.on('message', (data) => {
    try {
      // Try to parse as JSON for control messages
      const message = JSON.parse(data);
      
      if (message.type === 'register') {
        clientType = message.client;
        
        if (clientType === 'esp32') {
          // Register ESP32
          if (clients.esp32) {
            clients.esp32.close();
          }
          clients.esp32 = ws;
          console.log('✅ ESP32 registered');
          ws.send(JSON.stringify({ type: 'registered', client: 'esp32' }));
          
        } else if (clientType === 'web') {
          // Register web client
          clients.web.add(ws);
          console.log('✅ Web client registered. Total:', clients.web.size);
          ws.send(JSON.stringify({ type: 'registered', client: 'web' }));
        }
      } 
      else if (message.type === 'control') {
        // Forward control messages
        if (clientType === 'web' && clients.esp32) {
          clients.esp32.send(JSON.stringify(message));
          console.log('📤 Control to ESP32:', message.cmd);
        } else if (clientType === 'esp32') {
          clients.web.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify(message));
            }
          });
        }
      }
    } catch (e) {
      // Binary audio data - relay it
      if (clientType === 'web' && clients.esp32 && clients.esp32.readyState === WebSocket.OPEN) {
        // Web → ESP32 audio stream
        clients.esp32.send(data);
      } 
      else if (clientType === 'esp32') {
        // ESP32 → Web clients (if needed for monitoring)
        clients.web.forEach(client => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(data);
          }
        });
      }
    }
  });

  ws.on('close', () => {
    console.log('👋 Client disconnected:', clientType);
    
    if (clientType === 'esp32') {
      clients.esp32 = null;
      console.log('❌ ESP32 disconnected');
    } else if (clientType === 'web') {
      clients.web.delete(ws);
      console.log('❌ Web client disconnected. Remaining:', clients.web.size);
    }
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error.message);
  });
});

// Heartbeat to keep connections alive
const heartbeat = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      console.log('💀 Terminating dead connection');
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  });
}, 30000); // Every 30 seconds

wss.on('close', () => {
  clearInterval(heartbeat);
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('========================================');
  console.log('🎤 ESP32 Audio WebSocket Relay Server');
  console.log('========================================');
  console.log(`✅ Server running on port ${PORT}`);
  console.log('📡 Ready for connections!');
  console.log('========================================');
});

// Keep Glitch project alive (prevents sleeping)
setInterval(() => {
  console.log('💓 Keepalive ping');
}, 280000); // Every 4.6 minutes
