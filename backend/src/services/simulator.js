/**
 * Simulator Service
 * Controls: start/pause, speed (1x/5x/10x), reset
 * Generates realistic gym events and writes them to the database
 */
class Simulator {
  constructor(pool, wsManager) {
    this.pool = pool;
    this.wsManager = wsManager;
    this.intervalId = null;
    this.speed = 1;
    this.running = false;
    this.eventCount = 0;
  }
  
  start(speed = 1) {
    if (this.intervalId) this.stop();
    this.speed = speed;
    this.running = true;
    
    // Base interval: 2000ms at 1x, 400ms at 5x, 200ms at 10x
    const intervalMs = Math.max(200, 2000 / this.speed);
    
    this.intervalId = setInterval(() => this.generateEvent(), intervalMs);
    console.log(`🎮 Simulator started at ${speed}x speed`);
    return { status: 'running', speed: this.speed, events: this.eventCount };
  }
  
  pause() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.running = false;
    console.log('🎮 Simulator paused');
    return { status: 'paused', speed: this.speed, events: this.eventCount };
  }
  
  stop() {
    this.pause();
    return { status: 'stopped', speed: this.speed, events: this.eventCount };
  }
  
  async reset() {
    this.stop();
    this.eventCount = 0;
    this.speed = 1;
    console.log('🎮 Simulator reset');
    return { status: 'reset', speed: 1, events: 0 };
  }
  
  getStatus() {
    return {
      status: this.running ? 'running' : 'paused',
      speed: this.speed,
      events: this.eventCount,
    };
  }
  
  async generateEvent() {
    try {
      const eventType = Math.random();
      
      if (eventType < 0.45) {
        await this.generateCheckin();
      } else if (eventType < 0.80) {
        await this.generateCheckout();
      } else {
        await this.generatePayment();
      }
      
      this.eventCount++;
    } catch (err) {
      console.error('Simulator event error:', err.message);
    }
  }
  
  async generateCheckin() {
    // Pick a random active member who isn't currently checked in
    const memberResult = await this.pool.query(`
      SELECT m.id, m.gym_id, m.full_name, g.name AS gym_name
      FROM members m
      JOIN gyms g ON g.id = m.gym_id
      WHERE m.is_active = true
        AND NOT EXISTS (
          SELECT 1 FROM checkins c 
          WHERE c.member_id = m.id AND c.checked_out_at IS NULL
        )
      ORDER BY RANDOM()
      LIMIT 1
    `);
    
    if (memberResult.rows.length === 0) return;
    
    const member = memberResult.rows[0];
    const result = await this.pool.query(
      `INSERT INTO checkins (member_id, gym_id, checked_in_at)
       VALUES ($1, $2, NOW())
       RETURNING *`,
      [member.id, member.gym_id]
    );
    
    const checkin = result.rows[0];
    this.wsManager.broadcastCheckin({
      ...checkin,
      member_name: member.full_name,
      gym_name: member.gym_name,
    });
  }
  
  async generateCheckout() {
    // Pick a random open check-in
    const checkinResult = await this.pool.query(`
      SELECT c.id, c.member_id, c.gym_id, m.full_name, g.name AS gym_name
      FROM checkins c
      JOIN members m ON m.id = c.member_id
      JOIN gyms g ON g.id = c.gym_id
      WHERE c.checked_out_at IS NULL
      ORDER BY RANDOM()
      LIMIT 1
    `);
    
    if (checkinResult.rows.length === 0) return;
    
    const checkin = checkinResult.rows[0];
    const result = await this.pool.query(
      `UPDATE checkins SET checked_out_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [checkin.id]
    );
    
    const checkout = result.rows[0];
    this.wsManager.broadcastCheckout({
      ...checkout,
      member_name: checkin.full_name,
      gym_name: checkin.gym_name,
    });
  }
  
  async generatePayment() {
    // Pick a random active member
    const memberResult = await this.pool.query(`
      SELECT m.id, m.gym_id, m.plan_type, m.full_name, g.name AS gym_name
      FROM members m
      JOIN gyms g ON g.id = m.gym_id
      WHERE m.is_active = true
      ORDER BY RANDOM()
      LIMIT 1
    `);
    
    if (memberResult.rows.length === 0) return;
    
    const member = memberResult.rows[0];
    const amounts = { monthly: 1499, quarterly: 3999, annual: 11999 };
    const amount = amounts[member.plan_type] || 1499;
    
    const result = await this.pool.query(
      `INSERT INTO payments (member_id, gym_id, amount, plan_type, paid_at)
       VALUES ($1, $2, $3, $4, NOW())
       RETURNING *`,
      [member.id, member.gym_id, amount, member.plan_type]
    );
    
    const payment = result.rows[0];
    this.wsManager.broadcastPayment({
      ...payment,
      member_name: member.full_name,
      gym_name: member.gym_name,
    });
  }
}

module.exports = { Simulator };
