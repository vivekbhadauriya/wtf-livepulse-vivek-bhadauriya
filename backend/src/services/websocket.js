/**
 * WebSocket Manager
 * Handles client connections and broadcasts 5 event types:
 *   1. checkin    - New check-in event
 *   2. checkout   - Check-out event
 *   3. payment    - New payment event
 *   4. anomaly    - Anomaly detected
 *   5. anomaly_resolved - Anomaly auto-resolved
 */
class WebSocketManager {
  constructor(wss) {
    this.wss = wss;
    this.clients = new Set();
    
    wss.on('connection', (ws) => {
      this.clients.add(ws);
      console.log(`WS client connected (${this.clients.size} total)`);
      
      // Send welcome message
      ws.send(JSON.stringify({
        type: 'connection',
        data: { message: 'Connected to WTF LivePulse', timestamp: new Date().toISOString() }
      }));
      
      ws.on('close', () => {
        this.clients.delete(ws);
        console.log(`WS client disconnected (${this.clients.size} total)`);
      });
      
      ws.on('error', (err) => {
        console.error('WS client error:', err.message);
        this.clients.delete(ws);
      });
    });
  }
  
  broadcast(type, data) {
    const message = JSON.stringify({ type, data, timestamp: new Date().toISOString() });
    let sent = 0;
    for (const client of this.clients) {
      if (client.readyState === 1) { // WebSocket.OPEN
        client.send(message);
        sent++;
      }
    }
    return sent;
  }
  
  broadcastCheckin(data) {
    return this.broadcast('checkin', data);
  }
  
  broadcastCheckout(data) {
    return this.broadcast('checkout', data);
  }
  
  broadcastPayment(data) {
    return this.broadcast('payment', data);
  }
  
  broadcastAnomaly(data) {
    return this.broadcast('anomaly', data);
  }
  
  broadcastAnomalyResolved(data) {
    return this.broadcast('anomaly_resolved', data);
  }
  
  getClientCount() {
    return this.clients.size;
  }
}

module.exports = { WebSocketManager };
