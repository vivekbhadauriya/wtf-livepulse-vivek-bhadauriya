const express = require('express');
const router = express.Router();

// GET /api/simulator/status - Current simulator state
router.get('/status', async (req, res) => {
  const simulator = req.app.get('simulator');
  res.json(simulator.getStatus());
});

// POST /api/simulator/start - Start simulator
router.post('/start', async (req, res) => {
  try {
    const simulator = req.app.get('simulator');
    const speed = parseInt(req.body.speed || '1');
    
    if (![1, 5, 10].includes(speed)) {
      return res.status(400).json({ error: 'Speed must be 1, 5, or 10' });
    }
    
    const result = simulator.start(speed);
    res.json(result);
  } catch (err) {
    console.error('POST /api/simulator/start error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/simulator/pause - Pause simulator
router.post('/pause', async (req, res) => {
  const simulator = req.app.get('simulator');
  res.json(simulator.pause());
});

// POST /api/simulator/reset - Reset simulator
router.post('/reset', async (req, res) => {
  try {
    const simulator = req.app.get('simulator');
    const result = await simulator.reset();
    res.json(result);
  } catch (err) {
    console.error('POST /api/simulator/reset error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/simulator/speed - Change speed
router.post('/speed', async (req, res) => {
  try {
    const simulator = req.app.get('simulator');
    const speed = parseInt(req.body.speed || '1');
    
    if (![1, 5, 10].includes(speed)) {
      return res.status(400).json({ error: 'Speed must be 1, 5, or 10' });
    }
    
    if (simulator.running) {
      const result = simulator.start(speed);
      res.json(result);
    } else {
      simulator.speed = speed;
      res.json(simulator.getStatus());
    }
  } catch (err) {
    console.error('POST /api/simulator/speed error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
