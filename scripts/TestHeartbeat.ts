/**
 * Mariner's AI Grid - Heartbeat Resilience Test
 * Simulates Signal K server connectivity drops to verify 500ms recovery.
 */

import { WebSocketServer, WebSocket } from 'ws';

const PORT = 3000;
let wss: WebSocketServer | null = null;

async function runTest() {
  console.log('⚓ Signal K Heartbeat Resilience Test');
  console.log('Target: Reconnection in < 500ms');

  // Start Server
  startServer();

  // Test Cycle
  // 1. Initial connection (10s)
  await sleep(10000);

  // 2. Kill Server (simulate WiFi drop)
  console.log('\n💥 SIMULATING WIFI DROP (Stopping server)...');
  stopServer();
  await sleep(5000);

  // 3. Restore Server (simulate WiFi return)
  console.log('\n📡 WIFI RESTORED (Restarting server)...');
  const startTime = Date.now();
  startServer((client) => {
    const latency = Date.now() - startTime;
    console.log(`\n✅ CLIENT RECONNECTED!`);
    console.log(`⏱ Reconnection Latency: ${latency}ms`);
    
    if (latency < 500) {
      console.log('🏆 VERDICT: PASS (< 500ms requirement met)');
    } else {
      console.log('❌ VERDICT: FAIL (> 500ms requirement exceeded)');
    }
    
    process.exit(latency < 500 ? 0 : 1);
  });

  // Timeout if no reconnection
  setTimeout(() => {
    console.log('\n❌ VERDICT: FAIL (Reconnection timeout)');
    process.exit(1);
  }, 10000);
}

function startServer(onConnect?: (ws: WebSocket) => void) {
  wss = new WebSocketServer({ port: PORT });
  console.log(`[Server] Signal K mock live on port ${PORT}`);

  wss.on('connection', (ws) => {
    console.log('[Server] Client Connected');
    if (onConnect) onConnect(ws);
    
    ws.on('message', (msg) => {
      // Echo heartbeat or handle subscriptions
    });
  });
}

function stopServer() {
  if (wss) {
    wss.clients.forEach(client => client.close());
    wss.close();
    wss = null;
    console.log('[Server] Socket Closed');
  }
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

runTest().catch(console.error);
