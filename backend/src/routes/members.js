const express = require('express');
const router = express.Router();

// GET /api/members - List members with filtering
router.get('/', async (req, res) => {
  try {
    const pool = req.app.get('pool');
    const { gym_id, plan_type, churn_risk, page = 1, limit = 50 } = req.query;
    
    let where = [];
    let params = [];
    let paramIdx = 1;
    
    if (gym_id) {
      where.push(`m.gym_id = $${paramIdx++}`);
      params.push(parseInt(gym_id));
    }
    if (plan_type) {
      where.push(`m.plan_type = $${paramIdx++}`);
      params.push(plan_type);
    }
    if (churn_risk === 'true') {
      where.push(`m.churn_risk = true`);
    }
    
    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM members m ${whereClause}`, params
    );
    
    params.push(parseInt(limit), offset);
    const result = await pool.query(`
      SELECT m.*, g.name AS gym_name
      FROM members m
      JOIN gyms g ON g.id = m.gym_id
      ${whereClause}
      ORDER BY m.id
      LIMIT $${paramIdx++} OFFSET $${paramIdx++}
    `, params);
    
    res.json({
      members: result.rows,
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (err) {
    console.error('GET /api/members error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/members/:id - Single member with check-in history
router.get('/:id', async (req, res) => {
  try {
    const pool = req.app.get('pool');
    const { id } = req.params;
    
    const memberResult = await pool.query(`
      SELECT m.*, g.name AS gym_name
      FROM members m
      JOIN gyms g ON g.id = m.gym_id
      WHERE m.id = $1
    `, [id]);
    
    if (memberResult.rows.length === 0) {
      return res.status(404).json({ error: 'Member not found' });
    }
    
    const checkinsResult = await pool.query(`
      SELECT checked_in_at, checked_out_at
      FROM checkins
      WHERE member_id = $1
      ORDER BY checked_in_at DESC
      LIMIT 20
    `, [id]);
    
    const paymentsResult = await pool.query(`
      SELECT amount, plan_type, paid_at
      FROM payments
      WHERE member_id = $1
      ORDER BY paid_at DESC
      LIMIT 10
    `, [id]);
    
    res.json({
      ...memberResult.rows[0],
      recent_checkins: checkinsResult.rows,
      recent_payments: paymentsResult.rows,
    });
  } catch (err) {
    console.error('GET /api/members/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
