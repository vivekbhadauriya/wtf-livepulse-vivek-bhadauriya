import React, { useState, useEffect } from 'react';
import { getAnomalies, resolveAnomaly, acknowledgeAnomaly, formatDateTime, timeAgo } from '../../api';

export default function AnomalyEngine({ lastMessage }) {
  const [anomalies, setAnomalies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('open'); // 'open' | 'resolved' | 'all'

  useEffect(() => {
    loadAnomalies();
  }, [filter]);

  // Handle live WebSocket updates
  useEffect(() => {
    if (lastMessage && ['anomaly', 'anomaly_resolved'].includes(lastMessage.type)) {
      loadAnomalies();
    }
  }, [lastMessage]);

  async function loadAnomalies() {
    try {
      const query = filter === 'all' ? {} : { status: filter };
      const data = await getAnomalies(query);
      setAnomalies(data);
      setLoading(false);
    } catch (err) {
      console.error('Failed to load anomalies:', err);
      setLoading(false);
    }
  }

  const handleAcknowledge = async (id) => {
    try {
      await acknowledgeAnomaly(id);
      loadAnomalies();
    } catch (err) {
      console.error('Failed to acknowledge:', err);
    }
  };

  const handleResolve = async (id) => {
    try {
      await resolveAnomaly(id);
      loadAnomalies();
    } catch (err) {
      console.error('Failed to resolve:', err);
    }
  };

  if (loading && anomalies.length === 0) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <span>Loading anomaly engine...</span>
      </div>
    );
  }

  const criticalCount = anomalies.filter(a => a.severity === 'critical' && a.status === 'open').length;
  const highCount = anomalies.filter(a => a.severity === 'high' && a.status === 'open').length;

  return (
    <div className="animate-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className={`nav-tab ${filter === 'open' ? 'active' : ''}`}
            onClick={() => setFilter('open')}
          >
            Active Issues
            {(criticalCount > 0 || highCount > 0) && (
              <span className="card-badge badge-danger" style={{ marginLeft: 8, padding: '2px 6px' }}>
                {criticalCount + highCount}
              </span>
            )}
          </button>
          <button
            className={`nav-tab ${filter === 'resolved' ? 'active' : ''}`}
            onClick={() => setFilter('resolved')}
          >
            Resolved
          </button>
          <button
            className={`nav-tab ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            All Time
          </button>
        </div>
        
        <div className="ws-status">
          <span className="ws-dot"></span>
          Background detector running (30s)
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">
            {filter === 'open' ? 'Active Anomalies' : 
             filter === 'resolved' ? 'Resolved Anomalies' : 'All Anomalies'}
          </span>
        </div>

        {anomalies.length === 0 ? (
          <div className="empty-state">
            <span style={{ fontSize: '3rem', display: 'block', marginBottom: 16 }}>✅</span>
            <h3>All Clear</h3>
            <p style={{ marginTop: 8 }}>No anomalies found matching the current filter.</p>
          </div>
        ) : (
          <div className="anomaly-list">
            {anomalies.map((anomaly, idx) => (
              <AnomalyItem 
                key={anomaly.id} 
                anomaly={anomaly} 
                index={idx}
                onAcknowledge={handleAcknowledge}
                onResolve={handleResolve}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AnomalyItem({ anomaly, index, onAcknowledge, onResolve }) {
  const { id, type, description, severity, status, detected_at, resolved_at, gym_name, city } = anomaly;
  
  const isResolved = status === 'resolved';
  const isAcknowledged = status === 'acknowledged';
  
  const icons = {
    zero_checkins: '∅',
    capacity_breach: '👥',
    revenue_drop: '📉',
  };

  const titles = {
    zero_checkins: 'Zero Check-ins Alert',
    capacity_breach: 'Capacity Breach',
    revenue_drop: 'Revenue Drop Detected',
  };

  return (
    <div className={`anomaly-item ${isResolved ? 'resolved' : severity} animate-in stagger-${Math.min(index + 1, 5)}`}>
      <div className={`anomaly-type-icon ${type}`}>
        {icons[type] || '⚠'}
      </div>
      
      <div className="anomaly-content">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
          <h4 className="anomaly-title">{titles[type] || 'Anomaly'}</h4>
          <span className={`card-badge ${
            isResolved ? 'badge-resolved' : 
            severity === 'critical' ? 'badge-danger' : 'badge-warning'
          }`}>
            {isResolved ? 'RESOLVED' : severity.toUpperCase()}
          </span>
          {isAcknowledged && (
            <span className="card-badge" style={{ background: 'rgba(255,255,255,0.1)' }}>
              ACKNOWLEDGED
            </span>
          )}
        </div>
        
        <p className="anomaly-desc">{description}</p>
        
        <div className="anomaly-meta">
          <span>📍 {gym_name}, {city}</span>
          <span>⏱ Detected {timeAgo(detected_at)} ({formatDateTime(detected_at)})</span>
          {isResolved && resolved_at && (
            <span style={{ color: 'var(--accent-green)' }}>
              ✓ Resolved {timeAgo(resolved_at)}
            </span>
          )}
        </div>
      </div>

      {!isResolved && (
        <div className="anomaly-actions">
          {!isAcknowledged && (
            <button className="btn btn-sm" onClick={() => onAcknowledge(id)}>
              Acknowledge
            </button>
          )}
          <button className="btn btn-sm btn-resolve" onClick={() => onResolve(id)}>
            Resolve
          </button>
        </div>
      )}
    </div>
  );
}
