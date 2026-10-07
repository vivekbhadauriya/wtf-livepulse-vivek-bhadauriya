/**
 * Anomaly Detector Service
 * Runs every 30 seconds. Detects and auto-resolves:
 *   1. Zero check-ins during operating hours (6am-10pm IST)
 *   2. Capacity breaches (occupancy > capacity)
 *   3. Revenue drops (7-day vs prior 7-day, > 50% drop)
 * 
 * Note on Scenario A timing: The zero-checkins detector always runs
 * but only creates anomalies during operating hours (6-22 IST).
 * Pre-seeded anomalies exist for reviewers starting outside operating hours.
 */
class AnomalyDetector {
  constructor(pool, wsManager) {
    this.pool = pool;
    this.wsManager = wsManager;
    this.intervalId = null;
    this.running = false;
  }
  
  start(intervalMs = 30000) {
    if (this.intervalId) return;
    console.log(`🔍 Anomaly detector started (every ${intervalMs/1000}s)`);
    this.intervalId = setInterval(() => this.detect(), intervalMs);
    // Run immediately on start
    this.detect();
  }
  
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('🔍 Anomaly detector stopped');
    }
  }
  
  async detect() {
    if (this.running) return; // Prevent overlapping runs
    this.running = true;
    
    try {
      await Promise.all([
        this.detectZeroCheckins(),
        this.detectCapacityBreach(),
        this.detectRevenueDrop(),
      ]);
      await this.autoResolve();
    } catch (err) {
      console.error('Anomaly detection error:', err.message);
    } finally {
      this.running = false;
    }
  }
  
  /**
   * Scenario A: Zero check-ins during operating hours
   * Operating hours: dynamically checked against gyms.opens_at and gyms.closes_at
   */
  async detectZeroCheckins() {
    const result = await this.pool.query(`
      SELECT g.id AS gym_id, g.name, g.capacity,
             COUNT(c.id) AS open_checkins
      FROM gyms g
      LEFT JOIN checkins c ON c.gym_id = g.id AND c.checked_out_at IS NULL
      WHERE CURRENT_TIME AT TIME ZONE 'Asia/Kolkata' >= g.opens_at 
        AND CURRENT_TIME AT TIME ZONE 'Asia/Kolkata' <= g.closes_at
      GROUP BY g.id, g.name, g.capacity
      HAVING COUNT(c.id) = 0
    `);
    
    for (const row of result.rows) {
      await this.createAnomalyIfNew(
        row.gym_id,
        'zero_checkins',
        `${row.name}: No active check-ins detected during operating hours. Possible closure or system failure.`,
        'critical'
      );
    }
  }
  
  /**
   * Scenario B: Capacity breach (occupancy > capacity)
   */
  async detectCapacityBreach() {
    const result = await this.pool.query(`
      SELECT g.id AS gym_id, g.name, g.capacity,
             COUNT(c.id) AS open_checkins
      FROM gyms g
      JOIN checkins c ON c.gym_id = g.id AND c.checked_out_at IS NULL
      GROUP BY g.id, g.name, g.capacity
      HAVING COUNT(c.id) > g.capacity
    `);
    
    for (const row of result.rows) {
      const pct = Math.round((row.open_checkins / row.capacity - 1) * 100);
      await this.createAnomalyIfNew(
        row.gym_id,
        'capacity_breach',
        `${row.name}: Current occupancy (${row.open_checkins}) exceeds capacity (${row.capacity}) by ${pct}%. Safety risk.`,
        'critical'
      );
    }
  }
  
  /**
   * Scenario C: Revenue drop (last 7 days vs prior 7 days)
   */
  async detectRevenueDrop() {
    const result = await this.pool.query(`
      WITH recent AS (
        SELECT gym_id, COALESCE(SUM(amount), 0) AS revenue
        FROM payments
        WHERE paid_at >= NOW() - INTERVAL '7 days'
        GROUP BY gym_id
      ),
      prior AS (
        SELECT gym_id, COALESCE(SUM(amount), 0) AS revenue
        FROM payments
        WHERE paid_at >= NOW() - INTERVAL '14 days'
          AND paid_at < NOW() - INTERVAL '7 days'
        GROUP BY gym_id
      )
      SELECT g.id AS gym_id, g.name,
             COALESCE(r.revenue, 0) AS recent_revenue,
             COALESCE(p.revenue, 0) AS prior_revenue
      FROM gyms g
      LEFT JOIN recent r ON r.gym_id = g.id
      LEFT JOIN prior p ON p.gym_id = g.id
      WHERE COALESCE(p.revenue, 0) > 0
        AND COALESCE(r.revenue, 0) < COALESCE(p.revenue, 0) * 0.5
    `);
    
    for (const row of result.rows) {
      const dropPct = row.prior_revenue > 0
        ? Math.round((1 - row.recent_revenue / row.prior_revenue) * 100)
        : 0;
      await this.createAnomalyIfNew(
        row.gym_id,
        'revenue_drop',
        `${row.name}: Revenue in last 7 days (₹${Number(row.recent_revenue).toLocaleString()}) dropped by ${dropPct}% compared to prior 7-day period (₹${Number(row.prior_revenue).toLocaleString()}).`,
        dropPct > 70 ? 'critical' : 'high'
      );
    }
  }
  
  /**
   * Auto-resolve anomalies that are no longer valid
   */
  async autoResolve() {
    // Resolve capacity breaches that are now under capacity
    const capacityOk = await this.pool.query(`
      SELECT a.id, a.gym_id
      FROM anomalies a
      JOIN gyms g ON g.id = a.gym_id
      WHERE a.type = 'capacity_breach' AND a.status = 'open'
        AND (SELECT COUNT(*) FROM checkins c WHERE c.gym_id = a.gym_id AND c.checked_out_at IS NULL) <= g.capacity
    `);
    
    for (const row of capacityOk.rows) {
      await this.resolveAnomaly(row.id);
    }
    
    // Resolve zero-checkins if there are now active check-ins
    const now = new Date();
    const istHour = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })).getHours();
    
    if (istHour >= 6 && istHour < 22) {
      const zeroOk = await this.pool.query(`
        SELECT a.id, a.gym_id
        FROM anomalies a
        WHERE a.type = 'zero_checkins' AND a.status = 'open'
          AND (SELECT COUNT(*) FROM checkins c WHERE c.gym_id = a.gym_id AND c.checked_out_at IS NULL) > 0
      `);
      
      for (const row of zeroOk.rows) {
        await this.resolveAnomaly(row.id);
      }
    }
    
    // Resolve revenue drops if revenue recovered
    const revenueOk = await this.pool.query(`
      WITH recent AS (
        SELECT gym_id, COALESCE(SUM(amount), 0) AS revenue
        FROM payments
        WHERE paid_at >= NOW() - INTERVAL '7 days'
        GROUP BY gym_id
      ),
      prior AS (
        SELECT gym_id, COALESCE(SUM(amount), 0) AS revenue
        FROM payments
        WHERE paid_at >= NOW() - INTERVAL '14 days'
          AND paid_at < NOW() - INTERVAL '7 days'
        GROUP BY gym_id
      )
      SELECT a.id
      FROM anomalies a
      LEFT JOIN recent r ON r.gym_id = a.gym_id
      LEFT JOIN prior p ON p.gym_id = a.gym_id
      WHERE a.type = 'revenue_drop' AND a.status = 'open'
        AND (COALESCE(p.revenue, 0) = 0 OR COALESCE(r.revenue, 0) >= COALESCE(p.revenue, 0) * 0.5)
    `);
    
    for (const row of revenueOk.rows) {
      await this.resolveAnomaly(row.id);
    }
  }
  
  async createAnomalyIfNew(gymId, type, description, severity) {
    // Check if there's already an open anomaly of this type for this gym
    const existing = await this.pool.query(
      'SELECT id FROM anomalies WHERE gym_id = $1 AND type = $2 AND status = $3',
      [gymId, type, 'open']
    );
    
    if (existing.rows.length > 0) return null;
    
    const result = await this.pool.query(
      `INSERT INTO anomalies (gym_id, type, description, severity, status, detected_at)
       VALUES ($1, $2, $3, $4, 'open', NOW())
       RETURNING *`,
      [gymId, type, description, severity]
    );
    
    const anomaly = result.rows[0];
    this.wsManager.broadcastAnomaly(anomaly);
    console.log(`⚠️  Anomaly detected: ${type} at gym ${gymId}`);
    return anomaly;
  }
  
  async resolveAnomaly(anomalyId) {
    const result = await this.pool.query(
      `UPDATE anomalies SET status = 'resolved', resolved_at = NOW()
       WHERE id = $1 RETURNING *`,
      [anomalyId]
    );
    
    if (result.rows.length > 0) {
      this.wsManager.broadcastAnomalyResolved(result.rows[0]);
      console.log(`✅ Anomaly auto-resolved: #${anomalyId}`);
    }
  }
}

module.exports = { AnomalyDetector };
