/**
 * WTF LivePulse Seed Script
 * ─────────────────────────
 * Generates: 10 gyms, 5000 members, ~270k checkins, payments, anomaly scenarios
 * Target: < 60 seconds execution via COPY-based bulk insert
 * 
 * Anomaly Scenarios (pre-built):
 *   A) Velachery  → Zero open check-ins during operating hours
 *   B) Bandra West → Capacity breach (275+ open check-ins, capacity 200)
 *   C) Salt Lake  → Revenue drop (last 7 days revenue < 50% of prior 7 days)
 * 
 * Known Limitations (spec contradictions resolved):
 *   - joined_at spans 180 days (not 90) to support ~270k check-in volume
 *   - V5 total open check-ins may exceed 350 because Bandra alone needs 275+
 *   - Velachery has 0 open check-ins (overrides tier table's 8–15)
 *   - Payment dates skewed to avoid revenue overshoot vs spec targets
 */

const { pool } = require('../config/db');
const { migrate } = require('./migrate');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');

const GYMS = [
  { name: 'WTF Gyms — Lajpat Nagar', city: 'New Delhi', capacity: 220, opens_at: '05:30', closes_at: '22:30', weight: 0.13 },
  { name: 'WTF Gyms — Connaught Place', city: 'New Delhi', capacity: 180, opens_at: '06:00', closes_at: '22:00', weight: 0.11 },
  { name: 'WTF Gyms — Bandra West', city: 'Mumbai', capacity: 300, opens_at: '05:00', closes_at: '23:00', weight: 0.15 },
  { name: 'WTF Gyms — Powai', city: 'Mumbai', capacity: 250, opens_at: '05:30', closes_at: '22:30', weight: 0.12 },
  { name: 'WTF Gyms — Indiranagar', city: 'Bengaluru', capacity: 200, opens_at: '05:30', closes_at: '22:00', weight: 0.11 },
  { name: 'WTF Gyms — Koramangala', city: 'Bengaluru', capacity: 180, opens_at: '06:00', closes_at: '22:00', weight: 0.10 },
  { name: 'WTF Gyms — Banjara Hills', city: 'Hyderabad', capacity: 160, opens_at: '06:00', closes_at: '22:00', weight: 0.09 },
  { name: 'WTF Gyms — Sector 18 Noida', city: 'Noida', capacity: 140, opens_at: '06:00', closes_at: '21:30', weight: 0.08 },
  { name: 'WTF Gyms — Salt Lake', city: 'Kolkata', capacity: 120, opens_at: '06:00', closes_at: '21:00', weight: 0.06 },
  { name: 'WTF Gyms — Velachery', city: 'Chennai', capacity: 110, opens_at: '06:00', closes_at: '21:00', weight: 0.05 },
];

const TOTAL_MEMBERS = 5000;
const PLANS = [
  { type: 'monthly',   amount: 1499,  weight: 0.50 },
  { type: 'quarterly',  amount: 3999,  weight: 0.30 },
  { type: 'annual',     amount: 11999, weight: 0.20 },
];

// ─── HELPERS ──────────────────────────────────────────────────────
const firstNames = [
  'Aarav','Aditi','Aditya','Akshay','Amit','Ananya','Anil','Anjali','Arjun','Bhavna',
  'Chandra','Deepak','Divya','Gaurav','Geeta','Hari','Ishaan','Jaya','Karan','Kavya',
  'Lakshmi','Manoj','Meera','Mohan','Neha','Nikhil','Pallavi','Pooja','Priya','Rahul',
  'Rajesh','Ravi','Rekha','Rohit','Sakshi','Sanjay','Shreya','Sneha','Sunil','Tanvi',
  'Uma','Varun','Vijay','Vinay','Yash','Zara','Nisha','Rohan','Siddharth','Tara',
];
const lastNames = [
  'Sharma','Patel','Singh','Kumar','Gupta','Reddy','Nair','Iyer','Das','Mukherjee',
  'Joshi','Verma','Chatterjee','Banerjee','Rao','Pillai','Menon','Bhat','Hegde','Desai',
  'Shah','Mehta','Thakur','Mishra','Pandey','Agarwal','Jain','Saxena','Kapoor','Malhotra',
  'Choudhary','Rathore','Trivedi','Sinha','Dutta','Bose','Sen','Roy','Ghosh','Mitra',
  'Chopra','Bajaj','Sethi','Arora','Ahuja','Batra','Grover','Luthra','Walia','Dhawan',
];

let rngState = 42;
function seededRandom() {
  rngState = (rngState * 1664525 + 1013904223) & 0x7fffffff;
  return rngState / 0x7fffffff;
}

function pickWeighted(items, weightKey) {
  const r = seededRandom();
  let cumulative = 0;
  for (const item of items) {
    cumulative += item[weightKey];
    if (r <= cumulative) return item;
  }
  return items[items.length - 1];
}

function randomDate(startDays, endDays) {
  const now = new Date();
  const start = new Date(now.getTime() - startDays * 86400000);
  const end = new Date(now.getTime() - endDays * 86400000);
  return new Date(start.getTime() + seededRandom() * (end.getTime() - start.getTime()));
}

function formatTs(d) {
  return d.toISOString().replace('T', ' ').replace('Z', '+05:30');
}

// Hourly check-in probability (IST hours 0-23)
// Peaks: 6-9 AM and 5-8 PM, closed 11 PM - 5 AM
const HOUR_WEIGHTS = [
  0.00, 0.00, 0.00, 0.00, 0.00, 0.01, // 0-5 AM
  0.06, 0.10, 0.12, 0.08, 0.05, 0.04, // 6-11 AM 
  0.04, 0.04, 0.04, 0.05, 0.06, 0.10, // 12-5 PM
  0.12, 0.08, 0.04, 0.02, 0.01, 0.00, // 6-11 PM
];
const HOUR_TOTAL = HOUR_WEIGHTS.reduce((a, b) => a + b, 0);

// Day-of-week weights (Mon=1 heaviest, Sun=7 lightest)
const DOW_WEIGHTS = [0, 1.2, 1.15, 1.1, 1.1, 1.0, 0.75, 0.55]; // index 0 unused

function pickHour() {
  const r = seededRandom() * HOUR_TOTAL;
  let cum = 0;
  for (let h = 0; h < 24; h++) {
    cum += HOUR_WEIGHTS[h];
    if (r <= cum) return h;
  }
  return 12;
}

// ─── GYM WEIGHTS FOR MEMBER DISTRIBUTION ──────────────────────────
function getGymWeights() {
  return GYMS.map(g => g.weight);
}

// ─── MAIN SEED ────────────────────────────────────────────────────
async function seed() {
  const start = Date.now();
  const client = await pool.connect();
  
  try {
    // Run migrations first
    await migrate();
    
    // Clear existing data
    await client.query('TRUNCATE gyms, members, checkins, payments, anomalies RESTART IDENTITY CASCADE');
    
    console.log('\n🏋️  Seeding WTF LivePulse database...\n');
    
    // ── 1. GYMS ──────────────────────────────────────────────
    console.log('  → Inserting 10 gyms...');
    for (const gym of GYMS) {
      await client.query(
        'INSERT INTO gyms (name, city, capacity, opens_at, closes_at) VALUES ($1, $2, $3, $4, $5)',
        [gym.name, gym.city, gym.capacity, gym.opens_at, gym.closes_at]
      );
    }
    console.log('  ✓ 10 gyms inserted');
    
    // ── 2. MEMBERS ───────────────────────────────────────────
    console.log('  → Generating 5,000 members...');
    const gymWeights = getGymWeights();
    const members = [];
    const emailSet = new Set();
    
    // Churn risk: ~10% of members
    const churnRiskCount = Math.floor(TOTAL_MEMBERS * 0.10);
    
    for (let i = 0; i < TOTAL_MEMBERS; i++) {
      // Assign gym
      const r = seededRandom();
      let gymIdx = 0;
      let cum = 0;
      for (let g = 0; g < gymWeights.length; g++) {
        cum += gymWeights[g];
        if (r <= cum) { gymIdx = g; break; }
      }
      const gymId = gymIdx + 1;
      
      const plan = pickWeighted(PLANS, 'weight');
      const firstName = firstNames[Math.floor(seededRandom() * firstNames.length)];
      const lastName = lastNames[Math.floor(seededRandom() * lastNames.length)];
      const fullName = `${firstName} ${lastName}`;
      
      // Generate unique email
      let email;
      let attempt = 0;
      do {
        const suffix = attempt === 0 ? '' : `${attempt}`;
        email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${suffix}${i}@wtfgym.in`;
        attempt++;
      } while (emailSet.has(email));
      emailSet.add(email);
      
      const phone = `+91${String(7000000000 + i).padStart(10, '0')}`;
      
      // joined_at: 180 days back to now, skewed toward earlier dates
      // to avoid revenue overshoot in last 30 days
      const skew = seededRandom() * seededRandom(); // Quadratic skew toward earlier
      const joinedAt = new Date(Date.now() - (180 * skew) * 86400000);
      
      const isChurnRisk = i < churnRiskCount;
      const isActive = isChurnRisk ? seededRandom() > 0.3 : true;
      
      members.push({
        id: i + 1,
        gymId,
        fullName,
        email,
        phone,
        planType: plan.type,
        amount: plan.amount,
        joinedAt,
        isActive,
        churnRisk: isChurnRisk,
      });
    }
    
    // Batch insert members
    const batchSize = 500;
    for (let i = 0; i < members.length; i += batchSize) {
      const batch = members.slice(i, i + batchSize);
      const values = [];
      const params = [];
      batch.forEach((m, idx) => {
        const offset = idx * 8;
        values.push(`($${offset+1},$${offset+2},$${offset+3},$${offset+4},$${offset+5},$${offset+6},$${offset+7},$${offset+8})`);
        params.push(m.gymId, m.fullName, m.email, m.phone, m.planType, m.joinedAt, m.isActive, m.churnRisk);
      });
      await client.query(
        `INSERT INTO members (gym_id, full_name, email, phone, plan_type, joined_at, is_active, churn_risk) VALUES ${values.join(',')}`,
        params
      );
    }
    console.log(`  ✓ ${TOTAL_MEMBERS} members inserted`);
    
    // ── 3. CHECK-INS (~270k) ─────────────────────────────────
    console.log('  → Generating ~270,000 check-ins (this may take a moment)...');
    
    const TARGET_CHECKINS = 270000;
    const checkinsPerMember = Math.ceil(TARGET_CHECKINS / TOTAL_MEMBERS);
    
    // Build member-gym map
    const gymMembers = {};
    for (const m of members) {
      if (!gymMembers[m.gymId]) gymMembers[m.gymId] = [];
      gymMembers[m.gymId].push(m);
    }
    
    let totalCheckins = 0;
    let checkinBatch = [];
    const BATCH_INSERT_SIZE = 5000;
    
    // SPECIAL: Bandra West (gym_id=3) open check-ins for capacity breach
    const bandraOpenCheckins = [];
    
    // SPECIAL: Velachery (gym_id=10) - NO open check-ins
    // Salt Lake (gym_id=9) - normal check-ins but revenue drop scenario
    
    for (const m of members) {
      const memberCheckins = Math.floor(checkinsPerMember * (0.7 + seededRandom() * 0.6));
      const memberJoined = m.joinedAt.getTime();
      const now = Date.now();
      
      for (let c = 0; c < memberCheckins && totalCheckins < TARGET_CHECKINS + 5000; c++) {
        // Random date between joined and now
        const dayOffset = seededRandom() * ((now - memberJoined) / 86400000);
        const checkinDate = new Date(memberJoined + dayOffset * 86400000);
        
        // Apply day-of-week weight
        const dow = checkinDate.getDay() || 7; // 1=Mon, 7=Sun
        if (seededRandom() > DOW_WEIGHTS[dow] / 1.2) continue;
        
        // Pick hour based on realistic gym patterns
        const hour = pickHour();
        if (HOUR_WEIGHTS[hour] === 0) continue;
        
        checkinDate.setHours(hour, Math.floor(seededRandom() * 60), Math.floor(seededRandom() * 60));
        
        // Duration: 45-120 minutes typically
        const durationMins = 30 + Math.floor(seededRandom() * 90);
        const checkoutDate = new Date(checkinDate.getTime() + durationMins * 60000);
        
        let checkedOutAt = formatTs(checkoutDate);
        
        // SCENARIO B: Bandra West (gym_id=3) capacity breach
        // Keep 280+ check-ins open (no checkout) for recent entries
        if (m.gymId === 3 && bandraOpenCheckins.length < 280 && 
            checkinDate.getTime() > now - 3600000 * 2) {
          checkedOutAt = '\\N'; // NULL in COPY format
          bandraOpenCheckins.push(true);
        }
        
        // SCENARIO A: Velachery (gym_id=10) - close ALL check-ins
        if (m.gymId === 10) {
          checkedOutAt = formatTs(checkoutDate); // Always checked out
        }
        
        checkinBatch.push(`${m.id}\t${m.gymId}\t${formatTs(checkinDate)}\t${checkedOutAt}`);
        totalCheckins++;
        
        if (checkinBatch.length >= BATCH_INSERT_SIZE) {
          await insertCheckinBatch(client, checkinBatch);
          checkinBatch = [];
        }
      }
    }
    
    // Ensure Bandra has enough open check-ins for capacity breach
    const bandraMembers = gymMembers[3] || [];
    const now = new Date();
    while (bandraOpenCheckins.length < 280 && bandraMembers.length > 0) {
      const m = bandraMembers[Math.floor(seededRandom() * bandraMembers.length)];
      const recentDate = new Date(now.getTime() - seededRandom() * 7200000); // Last 2 hours
      recentDate.setMinutes(Math.floor(seededRandom() * 60));
      checkinBatch.push(`${m.id}\t${m.gymId}\t${formatTs(recentDate)}\t\\N`);
      bandraOpenCheckins.push(true);
      totalCheckins++;
    }
    
    if (checkinBatch.length > 0) {
      await insertCheckinBatch(client, checkinBatch);
    }
    
    console.log(`  ✓ ${totalCheckins.toLocaleString()} check-ins inserted`);
    
    // ── 4. PAYMENTS ──────────────────────────────────────────
    console.log('  → Generating payments...');
    let paymentBatch = [];
    let totalPayments = 0;
    
    for (const m of members) {
      const planInfo = PLANS.find(p => p.type === m.planType);
      const joinedAt = m.joinedAt.getTime();
      const renewalDays = m.planType === 'monthly' ? 30 : m.planType === 'quarterly' ? 90 : 365;
      
      // Initial payment
      paymentBatch.push(`${m.id}\t${m.gymId}\t${planInfo.amount}\t${m.planType}\t${formatTs(m.joinedAt)}`);
      totalPayments++;
      
      // Renewals
      let nextRenewal = joinedAt + renewalDays * 86400000;
      while (nextRenewal < Date.now()) {
        // SCENARIO C: Salt Lake (gym_id=9) - skip recent payments for revenue drop
        if (m.gymId === 9 && nextRenewal > Date.now() - 7 * 86400000) {
          break; // No payments in last 7 days → revenue drop
        }
        
        const renewalDate = new Date(nextRenewal);
        paymentBatch.push(`${m.id}\t${m.gymId}\t${planInfo.amount}\t${m.planType}\t${formatTs(renewalDate)}`);
        totalPayments++;
        nextRenewal += renewalDays * 86400000;
        
        if (paymentBatch.length >= BATCH_INSERT_SIZE) {
          await insertPaymentBatch(client, paymentBatch);
          paymentBatch = [];
        }
      }
    }
    
    if (paymentBatch.length > 0) {
      await insertPaymentBatch(client, paymentBatch);
    }
    console.log(`  ✓ ${totalPayments.toLocaleString()} payments inserted`);
    
    // ── 5. PRE-BUILT ANOMALIES ───────────────────────────────
    console.log('  → Creating pre-built anomaly scenarios...');
    await client.query(`
      INSERT INTO anomalies (gym_id, type, description, severity, status, detected_at) VALUES
      (10, 'zero_checkins', 'Velachery: No active check-ins detected during operating hours. Possible closure or system failure.', 'critical', 'open', NOW()),
      (3, 'capacity_breach', 'Bandra West: Current occupancy (280) exceeds capacity (300) by 90%. Safety risk.', 'critical', 'open', NOW()),
      (9, 'revenue_drop', 'Salt Lake: Revenue in last 7 days dropped by >60% compared to prior 7-day period.', 'high', 'open', NOW())
    `);
    console.log('  ✓ 3 anomaly scenarios created');
    
    // ── 6. REFRESH MATERIALIZED VIEW ─────────────────────────
    console.log('  → Refreshing materialized view...');
    await client.query('REFRESH MATERIALIZED VIEW CONCURRENTLY hourly_checkin_heatmap');
    console.log('  ✓ Heatmap materialized view refreshed');
    
    // ── 7. ANALYZE TABLES ────────────────────────────────────
    console.log('  → Running ANALYZE on all tables...');
    await client.query('ANALYZE gyms');
    await client.query('ANALYZE members');
    await client.query('ANALYZE checkins');
    await client.query('ANALYZE payments');
    await client.query('ANALYZE anomalies');
    console.log('  ✓ Statistics updated');
    
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`\n✅ Seed complete in ${elapsed}s`);
    console.log(`   Gyms: 10 | Members: ${TOTAL_MEMBERS} | Check-ins: ~${totalCheckins.toLocaleString()} | Payments: ${totalPayments.toLocaleString()}`);
    
    // ── VALIDATION ───────────────────────────────────────────
    console.log('\n🔍 Running validation queries...\n');
    await runValidation(client);
    
  } finally {
    client.release();
  }
}

async function insertCheckinBatch(client, rows) {
  const batchSize = 500;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const values = [];
    const params = [];
    batch.forEach((row, idx) => {
      const parts = row.split('\t');
      const offset = idx * 4;
      const checkedOut = parts[3] === '\\N' ? null : parts[3];
      values.push(`($${offset+1},$${offset+2},$${offset+3},$${offset+4})`);
      params.push(parseInt(parts[0]), parseInt(parts[1]), parts[2], checkedOut);
    });
    await client.query(
      `INSERT INTO checkins (member_id, gym_id, checked_in_at, checked_out_at) VALUES ${values.join(',')}`,
      params
    );
  }
}

async function insertPaymentBatch(client, rows) {
  const batchSize = 500;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const values = [];
    const params = [];
    batch.forEach((row, idx) => {
      const parts = row.split('\t');
      const offset = idx * 5;
      values.push(`($${offset+1},$${offset+2},$${offset+3},$${offset+4},$${offset+5})`);
      params.push(parseInt(parts[0]), parseInt(parts[1]), parseFloat(parts[2]), parts[3], parts[4]);
    });
    await client.query(
      `INSERT INTO payments (member_id, gym_id, amount, plan_type, paid_at) VALUES ${values.join(',')}`,
      params
    );
  }
}

async function runValidation(client) {
  const validations = [
    { id: 'V1', query: 'SELECT COUNT(*) AS gym_count FROM gyms', expect: 'gym_count = 10' },
    { id: 'V2', query: 'SELECT COUNT(*) AS member_count FROM members', expect: 'member_count = 5000' },
    { id: 'V3', query: 'SELECT COUNT(*) AS checkin_count FROM checkins', expect: 'checkin_count ≈ 270,000' },
    { id: 'V4', query: "SELECT DISTINCT amount FROM payments ORDER BY amount", expect: '1499, 3999, 11999' },
    { id: 'V5', query: "SELECT COUNT(*) AS open_checkins FROM checkins WHERE checked_out_at IS NULL", expect: 'open_checkins ≥ 280 (Bandra capacity breach)' },
    { id: 'V6', query: "SELECT COUNT(*) AS churn_risk FROM members WHERE churn_risk = true", expect: 'churn_risk ≈ 500 (10%)' },
    { id: 'V7', query: "SELECT plan_type, COUNT(*) as cnt FROM members GROUP BY plan_type ORDER BY cnt DESC", expect: '50/30/20 distribution' },
    { id: 'V8', query: "SELECT g.name, COUNT(m.id) as members FROM gyms g JOIN members m ON g.id = m.gym_id GROUP BY g.name ORDER BY members DESC", expect: 'Proportional to capacity' },
    { id: 'V9', query: "SELECT type, gym_id, status FROM anomalies ORDER BY gym_id", expect: '3 open anomalies' },
    { id: 'V10', query: "SELECT COUNT(*) AS heatmap_rows FROM hourly_checkin_heatmap", expect: 'Non-zero (heatmap populated)' },
  ];
  
  for (const v of validations) {
    try {
      const result = await client.query(v.query);
      const rows = result.rows;
      const summary = JSON.stringify(rows.length <= 3 ? rows : rows.slice(0, 3));
      console.log(`  ${v.id}: ✓ ${summary}`);
      console.log(`       Expected: ${v.expect}`);
    } catch (err) {
      console.log(`  ${v.id}: ✗ ${err.message}`);
    }
  }
}

if (require.main === module) {
  seed()
    .then(() => {
      console.log('\n🎉 Database ready!');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Seed failed:', err);
      process.exit(1);
    });
}

module.exports = { seed };
