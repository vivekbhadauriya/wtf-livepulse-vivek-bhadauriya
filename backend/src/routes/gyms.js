const express = require('express');
const router = express.Router();

// GET /api/gyms - All gyms with live occupancy and revenue
router.get('/', async (req, res) => {
  try {
    const pool = req.app.get('pool');
    const result = await pool.query(`
      SELECT 
        g.id, g.name, g.city, g.capacity,
        COALESCE(occ.open_count, 0)::INTEGER AS current_occupancy,
        COALESCE(rev.total_revenue, 0)::NUMERIC AS total_revenue,
        COALESCE(rev30.revenue_30d, 0)::NUMERIC AS revenue_30d,
        COALESCE(tc.total_checkins, 0)::INTEGER AS total_checkins,
        COALESCE(mc.member_count, 0)::INTEGER AS member_count
      FROM gyms g
      LEFT JOIN (
        SELECT gym_id, COUNT(*) AS open_count
        FROM checkins WHERE checked_out_at IS NULL
        GROUP BY gym_id
      ) occ ON occ.gym_id = g.id
      LEFT JOIN (
        SELECT gym_id, SUM(amount) AS total_revenue
        FROM payments GROUP BY gym_id
      ) rev ON rev.gym_id = g.id
      LEFT JOIN (
        SELECT gym_id, SUM(amount) AS revenue_30d
        FROM payments WHERE paid_at >= NOW() - INTERVAL '30 days'
        GROUP BY gym_id
      ) rev30 ON rev30.gym_id = g.id
      LEFT JOIN (
        SELECT gym_id, COUNT(*) AS total_checkins
        FROM checkins GROUP BY gym_id
      ) tc ON tc.gym_id = g.id
      LEFT JOIN (
        SELECT gym_id, COUNT(*) AS member_count
        FROM members WHERE is_active = true
        GROUP BY gym_id
      ) mc ON mc.gym_id = g.id
      ORDER BY g.id
    `);
    
    res.json(result.rows);
  } catch (err) {
    console.error('GET /api/gyms error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/gyms/:id - Single gym detail
router.get('/:id', async (req, res) => {
  try {
    const pool = req.app.get('pool');
    const { id } = req.params;
    
    const result = await pool.query(`
      SELECT 
        g.*,
        COALESCE((SELECT COUNT(*) FROM checkins WHERE gym_id = g.id AND checked_out_at IS NULL), 0)::INTEGER AS current_occupancy,
        COALESCE((SELECT SUM(amount) FROM payments WHERE gym_id = g.id), 0)::NUMERIC AS total_revenue,
        COALESCE((SELECT COUNT(*) FROM members WHERE gym_id = g.id AND is_active = true), 0)::INTEGER AS active_members
      FROM gyms g
      WHERE g.id = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Gym not found' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('GET /api/gyms/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/gyms/:id/activity - Recent activity feed
router.get('/:id/activity', async (req, res) => {
  try {
    const pool = req.app.get('pool');
    const { id } = req.params;
    const limit = Math.min(parseInt(req.query.limit || '50'), 100);
    
    const result = await pool.query(`
      (
        SELECT 'checkin' AS event_type, c.checked_in_at AS event_time,
               m.full_name AS member_name, NULL AS amount, NULL AS plan_type
        FROM checkins c
        JOIN members m ON m.id = c.member_id
        WHERE c.gym_id = $1
        ORDER BY c.checked_in_at DESC
        LIMIT $2
      )
      UNION ALL
      (
        SELECT 'payment' AS event_type, p.paid_at AS event_time,
               m.full_name AS member_name, p.amount::TEXT, p.plan_type
        FROM payments p
        JOIN members m ON m.id = p.member_id
        WHERE p.gym_id = $1
        ORDER BY p.paid_at DESC
        LIMIT $2
      )
      ORDER BY event_time DESC
      LIMIT $2
    `, [id, limit]);
    
    res.json(result.rows);
  } catch (err) {
    console.error('GET /api/gyms/:id/activity error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
