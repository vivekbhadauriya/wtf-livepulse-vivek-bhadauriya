const API_BASE = '/api';

export async function fetchAPI(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(error.error || error.message || 'API request failed');
  }
  return res.json();
}

// Gym endpoints
export const getGyms = () => fetchAPI('/gyms');
export const getGym = (id) => fetchAPI(`/gyms/${id}`);
export const getGymActivity = (id, limit = 50) => fetchAPI(`/gyms/${id}/activity?limit=${limit}`);

// Analytics endpoints
export const getPeakHours = (gymId) => fetchAPI(`/analytics/peak-hours${gymId ? `?gym_id=${gymId}` : ''}`);
export const getRevenue = (gymId, period = 30) => fetchAPI(`/analytics/revenue?period=${period}${gymId ? `&gym_id=${gymId}` : ''}`);
export const getChurnRisk = (gymId) => fetchAPI(`/analytics/churn-risk${gymId ? `?gym_id=${gymId}` : ''}`);
export const getMembership = (period = 90) => fetchAPI(`/analytics/membership?period=${period}`);
export const getComparison = () => fetchAPI('/analytics/comparison');
export const refreshHeatmap = () => fetchAPI('/analytics/refresh-heatmap', { method: 'POST' });

// Anomaly endpoints
export const getAnomalies = (filters = {}) => {
  const params = new URLSearchParams(filters).toString();
  return fetchAPI(`/anomalies${params ? `?${params}` : ''}`);
};
export const resolveAnomaly = (id) => fetchAPI(`/anomalies/${id}/resolve`, { method: 'PUT' });
export const acknowledgeAnomaly = (id) => fetchAPI(`/anomalies/${id}/acknowledge`, { method: 'PUT' });

// Simulator endpoints
export const getSimStatus = () => fetchAPI('/simulator/status');
export const startSim = (speed = 1) => fetchAPI('/simulator/start', { method: 'POST', body: JSON.stringify({ speed }) });
export const pauseSim = () => fetchAPI('/simulator/pause', { method: 'POST' });
export const resetSim = () => fetchAPI('/simulator/reset', { method: 'POST' });
export const setSimSpeed = (speed) => fetchAPI('/simulator/speed', { method: 'POST', body: JSON.stringify({ speed }) });

// Format helpers
export const formatCurrency = (val) => {
  const num = Number(val);
  if (num >= 10000000) return `₹${(num / 10000000).toFixed(1)}Cr`;
  if (num >= 100000) return `₹${(num / 100000).toFixed(1)}L`;
  if (num >= 1000) return `₹${(num / 1000).toFixed(1)}K`;
  return `₹${num.toLocaleString('en-IN')}`;
};

export const formatNumber = (val) => Number(val).toLocaleString('en-IN');

export const formatTime = (ts) => {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
};

export const formatDateTime = (ts) => {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleString('en-IN', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
  });
};

export const timeAgo = (ts) => {
  if (!ts) return '';
  const seconds = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
};
