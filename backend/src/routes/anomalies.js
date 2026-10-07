const express = require('express');
const router = express.Router();

// GET /api/anomalies - List all anomalies
router.get('/', async (req, res) => {
  try {
    const pool = req.app.get('pool');
    const { status, gym_id, type } = req.query;
    
    let where = [];
    let params = [];
    let idx = 1;
    
    if (status) { where.push(`a.status = $${idx++}`); params.push(status); }
    if (gym_id) { where.push(`a.gym_id = $${idx++}`); params.push(parseInt(gym_id)); }
    if (type) { where.push(`a.type = $${idx++}`); params.push(type); }
    
    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    
    const result = await pool.query(`
      SELECT a.*, g.name AS gym_name, g.city
      FROM anomalies a
      JOIN gyms g ON g.id = a.gym_id
      ${whereClause}
      ORDER BY a.detected_at DESC
    `, params);
    
    res.json(result.rows);
  } catch (err) {
    console.error('GET /api/anomalies error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/anomalies/:id/acknowledge - Manually acknowledge
router.put('/:id/acknowledge', async (req, res) => {
  try {
    const pool = req.app.get('pool');
    const wsManager = req.app.get('wsManager');
    
    const result = await pool.query(
      `UPDATE anomalies SET status = 'acknowledged'
       WHERE id = $1 AND status = 'open'
       RETURNING *`,
      [req.params.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Anomaly not found or already resolved' });
    }
    
    wsManager.broadcastAnomalyResolved(result.rows[0]);
    res.json(result.rows[0]);
  } catch (err) {
    console.error('PUT /api/anomalies/:id/acknowledge error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/anomalies/:id/resolve - Manually resolve
router.put('/:id/resolve', async (req, res) => {
  try {
    const pool = req.app.get('pool');
    const wsManager = req.app.get('wsManager');
    
    const result = await pool.query(
      `UPDATE anomalies SET status = 'resolved', resolved_at = NOW()
       WHERE id = $1 AND status != 'resolved'
       RETURNING *`,
      [req.params.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Anomaly not found or already resolved' });
    }
    
    wsManager.broadcastAnomalyResolved(result.rows[0]);
    res.json(result.rows[0]);
  } catch (err) {
    console.error('PUT /api/anomalies/:id/resolve error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
