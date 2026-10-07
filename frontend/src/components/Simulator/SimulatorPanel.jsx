import React, { useState, useEffect } from 'react';
import { getSimStatus, startSim, pauseSim, resetSim, setSimSpeed, timeAgo } from '../../api';

export default function SimulatorPanel({ lastMessage, events }) {
  const [status, setStatus] = useState({ status: 'stopped', speed: 1, events: 0 });
  const [loading, setLoading] = useState(true);
  const [localEvents, setLocalEvents] = useState(events);

  useEffect(() => {
    fetchStatus();
  }, []);

  // Update event list when simulator is running
  useEffect(() => {
    if (lastMessage && ['checkin', 'checkout', 'payment'].includes(lastMessage.type)) {
      setLocalEvents(prev => [lastMessage, ...prev].slice(0, 50));
      // Optionally poll status less frequently to just update the count, 
      // but the WebSocket events themselves indicate progress.
      if (status.status === 'running' && status.events % 10 === 0) {
        fetchStatus(); // keep count roughly in sync
      } else {
        setStatus(prev => ({ ...prev, events: prev.events + 1 }));
      }
    }
  }, [lastMessage]);

  async function fetchStatus() {
    try {
      const data = await getSimStatus();
      setStatus(data);
      setLoading(false);
    } catch (err) {
      console.error('Failed to get simulator status:', err);
      setLoading(false);
    }
  }

  const handleStart = async (speed) => {
    try {
      const data = await startSim(speed);
      setStatus(data);
    } catch (err) {
      console.error('Failed to start simulator:', err);
    }
  };

  const handlePause = async () => {
    try {
      const data = await pauseSim();
      setStatus(data);
    } catch (err) {
      console.error('Failed to pause simulator:', err);
    }
  };

  const handleReset = async () => {
    try {
      const data = await resetSim();
      setStatus(data);
      setLocalEvents([]);
    } catch (err) {
      console.error('Failed to reset simulator:', err);
    }
  };

  const handleSpeedChange = async (speed) => {
    try {
      const data = await setSimSpeed(speed);
      setStatus(data);
    } catch (err) {
      console.error('Failed to change speed:', err);
    }
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <span>Loading simulator...</span>
      </div>
    );
  }

  const isRunning = status.status === 'running';

  return (
    <div className="animate-in">
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <span className="card-title">Live Event Simulator</span>
          <div className="sim-status">
            Generated: <span className="sim-event-counter">{status.events.toLocaleString()}</span> events
          </div>
        </div>
        
        <p style={{ color: 'var(--text-secondary)', marginBottom: 24, fontSize: '0.875rem' }}>
          The simulator generates realistic check-ins, checkouts, and payments, writing them directly to the PostgreSQL database.
          These events trigger WebSocket broadcasts that update the dashboard and anomaly engine in real-time.
        </p>

        <div className="simulator-controls">
          {isRunning ? (
            <button className="sim-btn danger" onClick={handlePause}>
              <span style={{ fontSize: '1.25rem' }}>⏸</span> Pause Simulation
            </button>
          ) : (
            <button className="sim-btn primary" onClick={() => handleStart(status.speed)}>
              <span style={{ fontSize: '1.25rem' }}>▶</span> Start Simulation
            </button>
          )}

          <button className="sim-btn" onClick={handleReset} disabled={isRunning}>
            Reset Counter
          </button>

          <div style={{ width: '1px', height: '24px', background: 'var(--border-subtle)', margin: '0 8px' }}></div>

          <div className="speed-selector">
            <button 
              className={`speed-btn ${status.speed === 1 ? 'active' : ''}`}
              onClick={() => handleSpeedChange(1)}
            >
              1x Speed
            </button>
            <button 
              className={`speed-btn ${status.speed === 5 ? 'active' : ''}`}
              onClick={() => handleSpeedChange(5)}
            >
              5x Speed
            </button>
            <button 
              className={`speed-btn ${status.speed === 10 ? 'active' : ''}`}
              onClick={() => handleSpeedChange(10)}
            >
              10x Speed
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Simulation Log</span>
          <span className={`card-badge ${isRunning ? 'badge-live' : 'badge-warning'}`}>
            {isRunning ? '● RECORDING' : 'PAUSED'}
          </span>
        </div>
        
        <div className="activity-feed" style={{ maxHeight: '400px' }}>
          {localEvents.length === 0 ? (
            <div className="empty-state">
              <p>No events generated yet.</p>
              <p style={{ fontSize: '0.75rem', marginTop: 8 }}>Click Start Simulation to begin.</p>
            </div>
          ) : (
            localEvents.map((event, idx) => (
              <SimLogItem key={`${event.timestamp}-${idx}`} event={event} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function SimLogItem({ event }) {
  const { type, data, timestamp } = event;
  
  if (type === 'anomaly' || type === 'anomaly_resolved') return null;
  
  return (
    <div className="activity-item">
      <div className="activity-details">
        <div className="activity-text">
          <span style={{ 
            color: type === 'checkin' ? 'var(--accent-cyan)' : 
                   type === 'checkout' ? 'var(--accent-purple)' : 'var(--accent-green)',
            fontWeight: 600,
            textTransform: 'uppercase',
            fontSize: '0.6875rem',
            marginRight: 8,
            display: 'inline-block',
            width: 70
          }}>
            {type}
          </span>
          {data?.member_name} 
          <span style={{ color: 'var(--text-muted)' }}> at {data?.gym_name}</span>
          {type === 'payment' && (
            <span style={{ color: 'var(--accent-green)', marginLeft: 8, fontWeight: 600 }}>
              +₹{Number(data.amount).toLocaleString()}
            </span>
          )}
        </div>
      </div>
      <div className="activity-time" style={{ fontFamily: 'monospace' }}>
        {new Date(timestamp).toLocaleTimeString('en-IN', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 })}
      </div>
    </div>
  );
}
