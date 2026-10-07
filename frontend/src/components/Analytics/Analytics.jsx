import React, { useState, useEffect, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend,
} from 'recharts';
import {
  getPeakHours, getRevenue, getChurnRisk, getMembership, getComparison,
  formatCurrency, formatNumber, formatDateTime,
} from '../../api';

const COLORS = ['#00d4ff', '#a855f7', '#10b981', '#f59e0b', '#ec4899'];
const DAY_NAMES = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function Analytics() {
  const [tab, setTab] = useState('heatmap');
  
  return (
    <div className="animate-in">
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
        {[
          { id: 'heatmap', label: '🔥 Peak Hours' },
          { id: 'revenue', label: '💰 Revenue' },
          { id: 'churn', label: '⚠ Churn Risk' },
          { id: 'membership', label: '👥 Membership' },
          { id: 'comparison', label: '📊 Comparison' },
        ].map(t => (
          <button
            key={t.id}
            className={`nav-tab ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
            id={`analytics-tab-${t.id}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'heatmap' && <HeatmapView />}
      {tab === 'revenue' && <RevenueView />}
      {tab === 'churn' && <ChurnRiskView />}
      {tab === 'membership' && <MembershipView />}
      {tab === 'comparison' && <ComparisonView />}
    </div>
  );
}

// ─── Peak Hours Heatmap ───────────────────────────────────────
function HeatmapView() {
  const [data, setData] = useState([]);
  const [gymId, setGymId] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getPeakHours(gymId || undefined)
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [gymId]);

  const heatmapData = useMemo(() => {
    if (!data.length) return { grid: [], max: 1 };
    
    // Group by day_of_week and hour_of_day, aggregate across gyms if no filter
    const grid = {};
    let max = 0;
    
    for (const row of data) {
      const key = `${row.day_of_week}-${row.hour_of_day}`;
      grid[key] = (grid[key] || 0) + row.checkin_count;
      if (grid[key] > max) max = grid[key];
    }
    
    return { grid, max };
  }, [data]);

  if (loading) return <div className="loading-container"><div className="loading-spinner"></div></div>;

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Peak Hours Heatmap</span>
        <select
          className="select-input"
          value={gymId}
          onChange={e => setGymId(e.target.value)}
          id="heatmap-gym-filter"
        >
          <option value="">All Gyms</option>
          {[...Array(10)].map((_, i) => (
            <option key={i + 1} value={i + 1}>Gym {i + 1}</option>
          ))}
        </select>
      </div>
      
      <div className="heatmap-grid">
        {/* Hour labels */}
        <div></div>
        {[...Array(24)].map((_, h) => (
          <div key={h} className="heatmap-hour-label">{h}h</div>
        ))}
        
        {/* Grid rows by day */}
        {[1, 2, 3, 4, 5, 6, 7].map(day => (
          <React.Fragment key={day}>
            <div className="heatmap-label">{DAY_NAMES[day]}</div>
            {[...Array(24)].map((_, hour) => {
              const count = heatmapData.grid[`${day}-${hour}`] || 0;
              const intensity = heatmapData.max > 0 ? count / heatmapData.max : 0;
              const bg = intensity === 0
                ? 'rgba(255,255,255,0.02)'
                : `rgba(0, 212, 255, ${0.1 + intensity * 0.8})`;
              
              return (
                <div
                  key={hour}
                  className="heatmap-cell"
                  style={{ background: bg }}
                  data-tooltip={`${DAY_NAMES[day]} ${hour}:00 — ${count} check-ins`}
                ></div>
              );
            })}
          </React.Fragment>
        ))}
      </div>
      
      {/* Legend */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
        <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>Less</span>
        {[0.1, 0.3, 0.5, 0.7, 0.9].map(i => (
          <div key={i} style={{
            width: 14, height: 14, borderRadius: 3,
            background: `rgba(0, 212, 255, ${0.1 + i * 0.8})`,
          }}></div>
        ))}
        <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>More</span>
      </div>
    </div>
  );
}

// ─── Revenue View ─────────────────────────────────────────────
function RevenueView() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getRevenue(null, 30)
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading || !data) return <div className="loading-container"><div className="loading-spinner"></div></div>;

  // Aggregate by plan type
  const planData = {};
  for (const row of data.by_plan) {
    if (!planData[row.plan_type]) {
      planData[row.plan_type] = { plan_type: row.plan_type, total_revenue: 0, payment_count: 0 };
    }
    planData[row.plan_type].total_revenue += Number(row.total_revenue);
    planData[row.plan_type].payment_count += row.payment_count;
  }
  const pieData = Object.values(planData);

  return (
    <div className="analytics-grid">
      {/* Revenue by Plan (Pie) */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Revenue by Plan (30d)</span>
        </div>
        <div className="chart-container">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={pieData}
                cx="50%" cy="50%"
                innerRadius={60} outerRadius={100}
                dataKey="total_revenue"
                nameKey="plan_type"
                paddingAngle={4}
                stroke="none"
              >
                {pieData.map((_, idx) => (
                  <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: 'rgba(18,18,28,0.95)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 8,
                  color: '#f0f0f5',
                }}
                formatter={(val) => formatCurrency(val)}
              />
              <Legend
                formatter={(val) => <span style={{ color: '#8888a0', fontSize: '0.8125rem' }}>{val}</span>}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Daily Revenue Trend */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Daily Revenue Trend</span>
        </div>
        <div className="chart-container">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.daily_trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis
                dataKey="date"
                tickFormatter={(d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                stroke="#555566"
                tick={{ fontSize: 11 }}
              />
              <YAxis
                tickFormatter={(v) => formatCurrency(v)}
                stroke="#555566"
                tick={{ fontSize: 11 }}
              />
              <Tooltip
                contentStyle={{
                  background: 'rgba(18,18,28,0.95)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 8,
                  color: '#f0f0f5',
                }}
                formatter={(val) => formatCurrency(val)}
                labelFormatter={(d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
              />
              <Line
                type="monotone"
                dataKey="daily_revenue"
                stroke="#00d4ff"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: '#00d4ff' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

// ─── Churn Risk View ──────────────────────────────────────────
function ChurnRiskView() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getChurnRisk()
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading || !data) return <div className="loading-container"><div className="loading-spinner"></div></div>;

  return (
    <div>
      {/* Summary */}
      <div className="summary-bar" style={{ marginBottom: 20 }}>
        <div className="summary-card orange">
          <span className="summary-label">Total at Risk</span>
          <span className="summary-value orange">{data.summary.total_churn_risk}</span>
        </div>
        <div className="summary-card green">
          <span className="summary-label">Still Active</span>
          <span className="summary-value green">{data.summary.active_churn_risk}</span>
        </div>
        <div className="summary-card pink">
          <span className="summary-label">Already Churned</span>
          <span className="summary-value pink">{data.summary.inactive_churn_risk}</span>
        </div>
      </div>

      {/* Members Table */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Churn Risk Members</span>
          <span className="card-badge badge-warning">Top 100</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="comparison-table">
            <thead>
              <tr>
                <th>Member</th>
                <th>Gym</th>
                <th>Plan</th>
                <th>Last Visit</th>
                <th>Days Inactive</th>
                <th>30d Check-ins</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.members.map(m => (
                <tr key={m.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{m.full_name}</div>
                    <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>{m.email}</div>
                  </td>
                  <td>{m.gym_name}</td>
                  <td style={{ textTransform: 'capitalize' }}>{m.plan_type}</td>
                  <td>{formatDateTime(m.last_checkin)}</td>
                  <td>
                    <span style={{
                      color: m.days_since_last_visit > 30 ? 'var(--accent-red)' :
                             m.days_since_last_visit > 14 ? 'var(--accent-orange)' : 'var(--text-primary)'
                    }}>
                      {m.days_since_last_visit}d
                    </span>
                  </td>
                  <td>{m.checkin_count_30d}</td>
                  <td>
                    <span className={`card-badge ${m.is_active ? 'badge-live' : 'badge-danger'}`}
                      style={{ animation: 'none' }}>
                      {m.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Membership View ──────────────────────────────────────────
function MembershipView() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMembership(180)
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading || !data) return <div className="loading-container"><div className="loading-spinner"></div></div>;

  return (
    <div className="analytics-grid">
      {/* Plan Distribution Pie */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Plan Distribution</span>
        </div>
        <div className="chart-container">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data.plan_distribution}
                cx="50%" cy="50%"
                innerRadius={60} outerRadius={100}
                dataKey="count"
                nameKey="plan_type"
                paddingAngle={4}
                stroke="none"
                label={({ plan_type, percentage }) => `${plan_type} (${percentage}%)`}
              >
                {data.plan_distribution.map((_, idx) => (
                  <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: 'rgba(18,18,28,0.95)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 8,
                  color: '#f0f0f5',
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Renewals Trend */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Renewals (6 Months)</span>
        </div>
        <div className="chart-container">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.renewals}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis
                dataKey="month"
                tickFormatter={(d) => new Date(d).toLocaleDateString('en-IN', { month: 'short' })}
                stroke="#555566"
                tick={{ fontSize: 11 }}
              />
              <YAxis stroke="#555566" tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  background: 'rgba(18,18,28,0.95)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 8,
                  color: '#f0f0f5',
                }}
                labelFormatter={(d) => new Date(d).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
              />
              <Bar dataKey="renewal_count" fill="#a855f7" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

// ─── Comparison View ──────────────────────────────────────────
function ComparisonView() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState('revenue_30d');

  useEffect(() => {
    getComparison()
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const sorted = useMemo(() => {
    return [...data].sort((a, b) => Number(b[sortKey]) - Number(a[sortKey]));
  }, [data, sortKey]);

  if (loading) return <div className="loading-container"><div className="loading-spinner"></div></div>;

  return (
    <div>
      {/* Visual comparison bars */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <span className="card-title">Cross-Gym Revenue Comparison (30d)</span>
        </div>
        <div className="chart-container" style={{ height: 400 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={sorted} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis type="number" tickFormatter={v => formatCurrency(v)} stroke="#555566" tick={{ fontSize: 11 }} />
              <YAxis
                type="category" dataKey="name" width={140}
                stroke="#555566" tick={{ fontSize: 11 }}
              />
              <Tooltip
                contentStyle={{
                  background: 'rgba(18,18,28,0.95)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 8,
                  color: '#f0f0f5',
                }}
                formatter={(val) => formatCurrency(val)}
              />
              <Bar dataKey="revenue_30d" fill="url(#barGradient)" radius={[0, 4, 4, 0]}>
                {sorted.map((_, idx) => (
                  <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Detailed table */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Detailed Comparison</span>
          <select
            className="select-input"
            value={sortKey}
            onChange={e => setSortKey(e.target.value)}
            id="comparison-sort"
          >
            <option value="revenue_30d">Sort: Revenue</option>
            <option value="current_occupancy">Sort: Occupancy</option>
            <option value="member_count">Sort: Members</option>
            <option value="checkins_30d">Sort: Check-ins</option>
            <option value="arpu_30d">Sort: ARPU</option>
          </select>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="comparison-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Gym</th>
                <th>City</th>
                <th>Members</th>
                <th>Occupancy</th>
                <th>Occ %</th>
                <th>Revenue (30d)</th>
                <th>Check-ins (30d)</th>
                <th>ARPU</th>
                <th>Churn Risk</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((gym, idx) => (
                <tr key={gym.id}>
                  <td style={{ color: 'var(--text-muted)' }}>{idx + 1}</td>
                  <td style={{ fontWeight: 600 }}>{gym.name}</td>
                  <td>{gym.city}</td>
                  <td>{formatNumber(gym.member_count)}</td>
                  <td>{gym.current_occupancy}/{gym.capacity}</td>
                  <td>
                    <span style={{
                      color: Number(gym.occupancy_pct) > 100 ? 'var(--accent-red)' :
                             Number(gym.occupancy_pct) > 80 ? 'var(--accent-orange)' : 'var(--accent-green)'
                    }}>
                      {gym.occupancy_pct}%
                    </span>
                  </td>
                  <td style={{ color: 'var(--accent-green)' }}>{formatCurrency(gym.revenue_30d)}</td>
                  <td>{formatNumber(gym.checkins_30d)}</td>
                  <td>{gym.arpu_30d ? formatCurrency(gym.arpu_30d) : '—'}</td>
                  <td>
                    <span style={{ color: gym.churn_risk_count > 0 ? 'var(--accent-orange)' : 'var(--text-muted)' }}>
                      {gym.churn_risk_count}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
