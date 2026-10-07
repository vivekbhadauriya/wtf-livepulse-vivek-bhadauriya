import React, { useState } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import Dashboard from './components/Dashboard/Dashboard';
import Analytics from './components/Analytics/Analytics';
import AnomalyEngine from './components/AnomalyEngine/AnomalyEngine';
import SimulatorPanel from './components/Simulator/SimulatorPanel';

const TABS = [
  { id: 'dashboard',  label: 'Dashboard',      icon: '📊' },
  { id: 'analytics',  label: 'Analytics',       icon: '📈' },
  { id: 'anomalies',  label: 'Anomaly Engine',  icon: '🚨' },
  { id: 'simulator',  label: 'Simulator',       icon: '🎮' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const { connected, lastMessage, events } = useWebSocket();

  return (
    <div className="app-layout">
      {/* Header */}
      <header className="app-header">
        <div className="app-logo">
          <div className="app-logo-icon">
            <img src="/wtflogo.webp" alt="WTF Gyms" style={{ width: 40, height: 40, objectFit: 'contain' }} />
          </div>
          <div>
            <h1>LivePulse</h1>
            <span>Real-Time Gym Operations</span>
          </div>
        </div>
        <div className="ws-status">
          <span className={`ws-dot ${connected ? '' : 'disconnected'}`}></span>
          {connected ? 'Live' : 'Reconnecting...'}
          {connected && events.length > 0 && (
            <span style={{ marginLeft: 8, color: 'var(--text-muted)' }}>
              {events.length} events
            </span>
          )}
        </div>
      </header>

      {/* Navigation */}
      <nav className="nav-tabs" role="tablist">
        {TABS.map(tab => (
          <button
            key={tab.id}
            className={`nav-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
            role="tab"
            aria-selected={activeTab === tab.id}
            id={`tab-${tab.id}`}
          >
            <span className="nav-tab-icon">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Content */}
      <main className="main-content">
        {activeTab === 'dashboard' && (
          <Dashboard lastMessage={lastMessage} events={events} />
        )}
        {activeTab === 'analytics' && <Analytics />}
        {activeTab === 'anomalies' && (
          <AnomalyEngine lastMessage={lastMessage} />
        )}
        {activeTab === 'simulator' && (
          <SimulatorPanel lastMessage={lastMessage} events={events} />
        )}
      </main>
    </div>
  );
}
