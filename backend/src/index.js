/**
 * WTF LivePulse - Main Server
 * Express + WebSocket + Anomaly Detector + Simulator
 */
const http = require('http');
const express = require('express');
const cors = require('cors');
const { WebSocketServer } = require('ws');
const { pool } = require('./config/db');
const { migrate } = require('./db/migrate');
const { seed } = require('./db/seed');

const gymRoutes = require('./routes/gyms');
const memberRoutes = require('./routes/members');
const analyticsRoutes = require('./routes/analytics');
const anomalyRoutes = require('./routes/anomalies');
const simulatorRoutes = require('./routes/simulator');

const { AnomalyDetector } = require('./services/anomalyDetector');
const { Simulator } = require('./services/simulator');
const { WebSocketManager } = require('./services/websocket');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3001;

const helmet = require('helmet');

// ─── MIDDLEWARE ───────────────────────────────────────────────────
app.use(helmet());
app.use(cors());
app.use(express.json());

// ─── HEALTH CHECK ────────────────────────────────────────────────
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(503).json({ status: 'unhealthy', error: err.message });
  }
});

// ─── WEBSOCKET ───────────────────────────────────────────────────
const wss = new WebSocketServer({ server, path: '/ws' });
const wsManager = new WebSocketManager(wss);

// ─── SERVICES ────────────────────────────────────────────────────
const anomalyDetector = new AnomalyDetector(pool, wsManager);
const simulator = new Simulator(pool, wsManager);

// Make services available to routes
app.set('pool', pool);
app.set('wsManager', wsManager);
app.set('anomalyDetector', anomalyDetector);
app.set('simulator', simulator);

// ─── ROUTES ──────────────────────────────────────────────────────
app.use('/api/gyms', gymRoutes);
app.use('/api/members', memberRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/anomalies', anomalyRoutes);
app.use('/api/simulator', simulatorRoutes);

// ─── ERROR HANDLER ───────────────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

// ─── STARTUP ─────────────────────────────────────────────────────
async function start() {
  try {
    // Wait for DB
    let retries = 30;
    while (retries > 0) {
      try {
        await pool.query('SELECT 1');
        break;
      } catch {
        retries--;
        console.log(`Waiting for database... (${retries} retries left)`);
        await new Promise(r => setTimeout(r, 2000));
      }
    }
    if (retries === 0) throw new Error('Database connection timeout');
    
    // Check if tables exist, migrate + seed if needed
    const tableCheck = await pool.query(
      "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'gyms')"
    );
    
    if (!tableCheck.rows[0].exists) {
      console.log('🔄 First run detected — running migrations and seed...');
      await seed();
    } else {
      // Check if data exists
      const gymCount = await pool.query('SELECT COUNT(*) FROM gyms');
      if (parseInt(gymCount.rows[0].count) === 0) {
        console.log('🔄 Empty database detected — running seed...');
        await seed();
      }
    }
    
    // Start anomaly detector (every 30 seconds)
    anomalyDetector.start(30000);
    
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`\n🚀 WTF LivePulse backend running on port ${PORT}`);
      console.log(`   REST API: http://localhost:${PORT}/api`);
      console.log(`   WebSocket: ws://localhost:${PORT}/ws`);
      console.log(`   Anomaly detector: running every 30s\n`);
    });
    
  } catch (err) {
    console.error('Failed to start:', err);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down...');
  anomalyDetector.stop();
  simulator.stop();
  wss.close();
  server.close();
  await pool.end();
  process.exit(0);
});

if (require.main === module) {
  start();
}

module.exports = { app, server, wsManager, anomalyDetector, simulator };
