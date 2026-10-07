import React, { useState, useEffect, useMemo } from 'react';
import { getGyms, formatCurrency, formatNumber, timeAgo } from '../../api';

export default function Dashboard({ lastMessage, events }) {
  const [gyms, setGyms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedGym, setSelectedGym] = useState(null);

  // Initial load
  useEffect(() => {
    loadGyms();
  }, []);

  // Re-fetch on WebSocket events (not polling — triggered by push events)
  useEffect(() => {
    if (lastMessage && ['checkin', 'checkout', 'payment'].includes(lastMessage.type)) {
      loadGyms();
    }
  }, [lastMessage]);

  async function loadGyms() {
    try {
      const data = await getGyms();
      setGyms(data);
      setLoading(false);
    } catch (err) {
      console.error('Failed to load gyms:', err);
      setLoading(false);
    }
  }

  // Compute summary stats
  const summary = useMemo(() => {
    if (gyms.length === 0) return null;
    return {
      totalOccupancy: gyms.reduce((s, g) => s + (g.current_occupancy || 0), 0),
      totalCapacity: gyms.reduce((s, g) => s + g.capacity, 0),
      totalRevenue: gyms.reduce((s, g) => s + Number(g.total_revenue || 0), 0),
      revenue30d: gyms.reduce((s, g) => s + Number(g.revenue_30d || 0), 0),
      totalMembers: gyms.reduce((s, g) => s + (g.member_count || 0), 0),
      totalCheckins: gyms.reduce((s, g) => s + (g.total_checkins || 0), 0),
    };
  }, [gyms]);

  // Recent activity from WebSocket events
  const recentActivity = useMemo(() => {
    return events
      .filter(e => ['checkin', 'checkout', 'payment', 'anomaly'].includes(e.type))
      .slice(0, 30);
  }, [events]);

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <span>Loading dashboard...</span>
      </div>
    );
  }

  return (
    <div className="animate-in">
      {/* Summary Bar */}
      {summary && (
        <div className="summary-bar">
          <div className="summary-card cyan">
            <span className="summary-label">Live Occupancy</span>
            <span className="summary-value cyan number-animate">
              {formatNumber(summary.totalOccupancy)}
            </span>
            <span className="summary-sub">
              of {formatNumber(summary.totalCapacity)} capacity ({Math.round(summary.totalOccupancy / summary.totalCapacity * 100)}%)
            </span>
          </div>
          <div className="summary-card green">
            <span className="summary-label">Revenue (30d)</span>
            <span className="summary-value green number-animate">
              {formatCurrency(summary.revenue30d)}
            </span>
            <span className="summary-sub">
              {formatCurrency(summary.totalRevenue)} all time
            </span>
          </div>
          <div className="summary-card purple">
            <span className="summary-label">Active Members</span>
            <span className="summary-value purple number-animate">
              {formatNumber(summary.totalMembers)}
            </span>
            <span className="summary-sub">across 10 gyms</span>
          </div>
          <div className="summary-card orange">
            <span className="summary-label">Total Check-ins</span>
            <span className="summary-value orange number-animate">
              {formatNumber(summary.totalCheckins)}
            </span>
            <span className="summary-sub">historical</span>
          </div>
        </div>
      )}

      {/* Main Grid: Gym Cards + Activity Feed */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '20px' }}>
        {/* Gym Cards */}
        <div>
          <div className="card-header" style={{ marginBottom: 16 }}>
            <h2 style={{ fontSize: '1.125rem' }}>Gym Locations</h2>
            <span className="card-badge badge-live">● LIVE</span>
          </div>
          <div className="dashboard-grid">
            {gyms.map((gym, idx) => (
              <GymCard key={gym.id} gym={gym} index={idx} />
            ))}
          </div>
        </div>

        {/* Activity Feed */}
        <div className="card" style={{ height: 'fit-content', maxHeight: '80vh', position: 'sticky', top: 100 }}>
          <div className="card-header">
            <span className="card-title">Activity Feed</span>
            <span className="card-badge badge-live">● LIVE</span>
          </div>
          <div className="activity-feed">
            {recentActivity.length === 0 ? (
              <div className="empty-state">
                <p>No events yet</p>
                <p style={{ fontSize: '0.75rem', marginTop: 8 }}>Start the simulator to see live events</p>
              </div>
            ) : (
              recentActivity.map((event, idx) => (
                <ActivityItem key={`${event.timestamp}-${idx}`} event={event} />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function GymCard({ gym, index }) {
  const occupancyPct = gym.capacity > 0
    ? Math.min(100, Math.round((gym.current_occupancy / gym.capacity) * 100))
    : 0;
  
  const occupancyClass = 
    gym.current_occupancy > gym.capacity ? 'breach' :
    occupancyPct > 80 ? 'high' :
    occupancyPct > 50 ? 'medium' : 'low';

  return (
    <div className={`gym-card animate-in stagger-${Math.min(index + 1, 5)}`}>
      <div className="gym-card-header">
        <div>
          <div className="gym-name">{gym.name}</div>
          <div className="gym-city">{gym.city}</div>
        </div>
        {gym.current_occupancy > gym.capacity && (
          <span className="card-badge badge-danger" style={{ fontSize: '0.625rem' }}>
            ⚠ OVER CAPACITY
          </span>
        )}
        {gym.current_occupancy === 0 && (
          <span className="card-badge badge-warning" style={{ fontSize: '0.625rem' }}>
            EMPTY
          </span>
        )}
      </div>

      <div className="gym-stats">
        <div className="gym-stat">
          <span className="gym-stat-label">Occupancy</span>
          <span className="gym-stat-value" style={{ color: 'var(--accent-cyan)' }}>
            {gym.current_occupancy}/{gym.capacity}
          </span>
        </div>
        <div className="gym-stat">
          <span className="gym-stat-label">Revenue (30d)</span>
          <span className="gym-stat-value" style={{ color: 'var(--accent-green)' }}>
            {formatCurrency(gym.revenue_30d)}
          </span>
        </div>
        <div className="gym-stat">
          <span className="gym-stat-label">Members</span>
          <span className="gym-stat-value" style={{ color: 'var(--accent-purple)' }}>
            {formatNumber(gym.member_count)}
          </span>
        </div>
        <div className="gym-stat">
          <span className="gym-stat-label">Check-ins</span>
          <span className="gym-stat-value" style={{ color: 'var(--accent-orange)' }}>
            {formatNumber(gym.total_checkins)}
          </span>
        </div>
      </div>

      <div className="occupancy-bar">
        <div className="occupancy-track">
          <div
            className={`occupancy-fill ${occupancyClass}`}
            style={{ width: `${Math.min(occupancyPct, 100)}%` }}
          ></div>
        </div>
        <div className="occupancy-labels">
          <span>{occupancyPct}% full</span>
          <span>Cap: {gym.capacity}</span>
        </div>
      </div>
    </div>
  );
}

function ActivityItem({ event }) {
  const { type, data, timestamp } = event;
  
  const icons = {
    checkin: '→',
    checkout: '←',
    payment: '₹',
    anomaly: '⚠',
    anomaly_resolved: '✓',
  };

  const labels = {
    checkin: 'Checked in',
    checkout: 'Checked out',
    payment: 'Payment',
    anomaly: 'Anomaly',
    anomaly_resolved: 'Resolved',
  };

  return (
    <div className="activity-item">
      <div className={`activity-icon ${type}`}>{icons[type] || '•'}</div>
      <div className="activity-details">
        <div className="activity-text">
          {data?.member_name || data?.gym_name || labels[type]}
          {data?.gym_name && data?.member_name && (
            <span style={{ color: 'var(--text-muted)' }}> at {data.gym_name}</span>
          )}
        </div>
        <div className="activity-time">{timeAgo(timestamp)}</div>
      </div>
      {type === 'payment' && data?.amount && (
        <span className="activity-amount">₹{Number(data.amount).toLocaleString('en-IN')}</span>
      )}
    </div>
  );
}
