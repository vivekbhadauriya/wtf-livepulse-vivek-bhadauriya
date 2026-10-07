const express = require('express');
const router = express.Router();

// GET /api/analytics/peak-hours - Heatmap data from materialized view
router.get('/peak-hours', async (req, res) => {
  try {
    const pool = req.app.get('pool');
    const { gym_id } = req.query;
    
    let query = `
      SELECT h.gym_id, g.name AS gym_name, h.day_of_week, h.hour_of_day, h.checkin_count
      FROM hourly_checkin_heatmap h
      JOIN gyms g ON g.id = h.gym_id
    `;
    const params = [];
    
    if (gym_id) {
      query += ' WHERE h.gym_id = $1';
      params.push(parseInt(gym_id));
    }
    
    query += ' ORDER BY h.gym_id, h.day_of_week, h.hour_of_day';
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('GET /api/analytics/peak-hours error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics/revenue - Revenue breakdown by plan type
router.get('/revenue', async (req, res) => {
  try {
    const pool = req.app.get('pool');
    const { gym_id, period = '30' } = req.query;
    
    let whereGym = '';
    const params = [parseInt(period)];
    
    if (gym_id) {
      whereGym = 'AND p.gym_id = $2';
      params.push(parseInt(gym_id));
    }
    
    const result = await pool.query(`
      SELECT 
        g.id AS gym_id, g.name AS gym_name,
        p.plan_type,
        COUNT(p.id)::INTEGER AS payment_count,
        SUM(p.amount)::NUMERIC AS total_revenue,
        AVG(p.amount)::NUMERIC AS avg_payment
      FROM payments p
      JOIN gyms g ON g.id = p.gym_id
      WHERE p.paid_at >= NOW() - ($1 || ' days')::INTERVAL
        ${whereGym}
      GROUP BY g.id, g.name, p.plan_type
      ORDER BY g.id, p.plan_type
    `, params);
    
    // Also get daily trend
    const trendResult = await pool.query(`
      SELECT 
        DATE(p.paid_at AT TIME ZONE 'Asia/Kolkata') AS date,
        SUM(p.amount)::NUMERIC AS daily_revenue,
        COUNT(p.id)::INTEGER AS daily_payments
      FROM payments p
      WHERE p.paid_at >= NOW() - ($1 || ' days')::INTERVAL
        ${whereGym}
      GROUP BY DATE(p.paid_at AT TIME ZONE 'Asia/Kolkata')
      ORDER BY date
    `, params);
    
    res.json({
      by_plan: result.rows,
      daily_trend: trendResult.rows,
    });
  } catch (err) {
    console.error('GET /api/analytics/revenue error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics/churn-risk - Churn risk members
router.get('/churn-risk', async (req, res) => {
  try {
    const pool = req.app.get('pool');
    const { gym_id } = req.query;
    
    let whereGym = '';
    const params = [];
    
    if (gym_id) {
      whereGym = 'AND m.gym_id = $1';
      params.push(parseInt(gym_id));
    }
    
    const result = await pool.query(`
      SELECT 
        m.id, m.full_name, m.email, m.plan_type, m.joined_at, m.is_active,
        g.name AS gym_name,
        COALESCE(lc.last_checkin, m.joined_at) AS last_checkin,
        COALESCE(cc.checkin_count, 0)::INTEGER AS checkin_count_30d,
        EXTRACT(DAY FROM NOW() - COALESCE(lc.last_checkin, m.joined_at))::INTEGER AS days_since_last_visit
      FROM members m
      JOIN gyms g ON g.id = m.gym_id
      LEFT JOIN (
        SELECT member_id, MAX(checked_in_at) AS last_checkin
        FROM checkins GROUP BY member_id
      ) lc ON lc.member_id = m.id
      LEFT JOIN (
        SELECT member_id, COUNT(*) AS checkin_count
        FROM checkins
        WHERE checked_in_at >= NOW() - INTERVAL '30 days'
        GROUP BY member_id
      ) cc ON cc.member_id = m.id
      WHERE m.churn_risk = true ${whereGym}
      ORDER BY days_since_last_visit DESC
      LIMIT 100
    `, params);
    
    // Summary stats
    const summaryResult = await pool.query(`
      SELECT 
        COUNT(*) AS total_churn_risk,
        COUNT(*) FILTER (WHERE is_active = true) AS active_churn_risk,
        COUNT(*) FILTER (WHERE is_active = false) AS inactive_churn_risk
      FROM members
      WHERE churn_risk = true
    `);
    
    res.json({
      members: result.rows,
      summary: summaryResult.rows[0],
    });
  } catch (err) {
    console.error('GET /api/analytics/churn-risk error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics/membership - New vs renewal analysis
router.get('/membership', async (req, res) => {
  try {
    const pool = req.app.get('pool');
    const { period = '90' } = req.query;
    
    // New members by month
    const newMembers = await pool.query(`
      SELECT 
        DATE_TRUNC('month', joined_at AT TIME ZONE 'Asia/Kolkata') AS month,
        COUNT(*)::INTEGER AS new_members,
        plan_type
      FROM members
      WHERE joined_at >= NOW() - ($1 || ' days')::INTERVAL
      GROUP BY month, plan_type
      ORDER BY month, plan_type
    `, [parseInt(period)]);
    
    // Renewals (members who paid more than once)
    const renewals = await pool.query(`
      WITH first_payments AS (
        SELECT member_id, MIN(paid_at) as first_paid_at
        FROM payments
        GROUP BY member_id
      )
      SELECT
        DATE_TRUNC('month', p.paid_at AT TIME ZONE 'Asia/Kolkata') AS month,
        COUNT(*)::INTEGER AS renewal_count,
        SUM(p.amount)::NUMERIC AS renewal_revenue
      FROM payments p
      JOIN first_payments fp ON p.member_id = fp.member_id
      WHERE p.paid_at >= NOW() - ($1 || ' days')::INTERVAL
        AND p.paid_at > fp.first_paid_at
      GROUP BY month
      ORDER BY month
    `, [parseInt(period)]);
    
    // Plan distribution
    const planDist = await pool.query(`
      SELECT plan_type, COUNT(*)::INTEGER AS count,
             ROUND(COUNT(*)::NUMERIC / (SELECT COUNT(*) FROM members) * 100, 1) AS percentage
      FROM members
      GROUP BY plan_type
      ORDER BY count DESC
    `);
    
    res.json({
      new_members: newMembers.rows,
      renewals: renewals.rows,
      plan_distribution: planDist.rows,
    });
  } catch (err) {
    console.error('GET /api/analytics/membership error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics/comparison - Cross-gym comparison
router.get('/comparison', async (req, res) => {
  try {
    const pool = req.app.get('pool');
    
    const result = await pool.query(`
      SELECT 
        g.id, g.name, g.city, g.capacity,
        COALESCE(mc.member_count, 0)::INTEGER AS member_count,
        COALESCE(occ.occupancy, 0)::INTEGER AS current_occupancy,
        ROUND(COALESCE(occ.occupancy, 0)::NUMERIC / g.capacity * 100, 1) AS occupancy_pct,
        COALESCE(rev.revenue_30d, 0)::NUMERIC AS revenue_30d,
        COALESCE(ci.checkins_30d, 0)::INTEGER AS checkins_30d,
        COALESCE(cr.churn_count, 0)::INTEGER AS churn_risk_count,
        ROUND(COALESCE(rev.revenue_30d, 0)::NUMERIC / NULLIF(mc.member_count, 0), 2) AS arpu_30d
      FROM gyms g
      LEFT JOIN (
        SELECT gym_id, COUNT(*) AS member_count
        FROM members WHERE is_active = true
        GROUP BY gym_id
      ) mc ON mc.gym_id = g.id
      LEFT JOIN (
        SELECT gym_id, COUNT(*) AS occupancy
        FROM checkins WHERE checked_out_at IS NULL
        GROUP BY gym_id
      ) occ ON occ.gym_id = g.id
      LEFT JOIN (
        SELECT gym_id, SUM(amount) AS revenue_30d
        FROM payments WHERE paid_at >= NOW() - INTERVAL '30 days'
        GROUP BY gym_id
      ) rev ON rev.gym_id = g.id
      LEFT JOIN (
        SELECT gym_id, COUNT(*) AS checkins_30d
        FROM checkins WHERE checked_in_at >= NOW() - INTERVAL '30 days'
        GROUP BY gym_id
      ) ci ON ci.gym_id = g.id
      LEFT JOIN (
        SELECT gym_id, COUNT(*) AS churn_count
        FROM members WHERE churn_risk = true
        GROUP BY gym_id
      ) cr ON cr.gym_id = g.id
      ORDER BY revenue_30d DESC
    `);
    
    res.json(result.rows);
  } catch (err) {
    console.error('GET /api/analytics/comparison error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/analytics/refresh-heatmap - Refresh materialized view
router.post('/refresh-heatmap', async (req, res) => {
  try {
    const pool = req.app.get('pool');
    await pool.query('REFRESH MATERIALIZED VIEW CONCURRENTLY hourly_checkin_heatmap');
    res.json({ status: 'refreshed', timestamp: new Date().toISOString() });
  } catch (err) {
    console.error('POST /api/analytics/refresh-heatmap error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
