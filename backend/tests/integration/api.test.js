const request = require('supertest');
const express = require('express');

// Create a standalone express app for testing routes with mocked pool
const app = express();
app.use(express.json());

const poolMock = { query: jest.fn() };
const wsManagerMock = { broadcastAnomalyResolved: jest.fn() };
const simulatorMock = {
  getStatus: jest.fn().mockReturnValue({ status: 'stopped', speed: 1, events: 0 }),
  start: jest.fn().mockReturnValue({ status: 'running', speed: 1, events: 0 }),
  pause: jest.fn().mockReturnValue({ status: 'paused', speed: 1, events: 0 }),
  reset: jest.fn().mockResolvedValue({ status: 'reset', speed: 1, events: 0 })
};

app.set('pool', poolMock);
app.set('wsManager', wsManagerMock);
app.set('simulator', simulatorMock);

app.use('/api/gyms', require('../../src/routes/gyms'));
app.use('/api/members', require('../../src/routes/members'));
app.use('/api/analytics', require('../../src/routes/analytics'));
app.use('/api/anomalies', require('../../src/routes/anomalies'));
app.use('/api/simulator', require('../../src/routes/simulator'));

describe('API Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Gyms API', () => {
    test('GET /api/gyms returns list of gyms', async () => {
      poolMock.query.mockResolvedValueOnce({ rows: [{ id: 1, name: 'Test Gym' }] });
      const res = await request(app).get('/api/gyms');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([{ id: 1, name: 'Test Gym' }]);
    });

    test('GET /api/gyms/:id returns a single gym', async () => {
      poolMock.query.mockResolvedValueOnce({ rows: [{ id: 1, name: 'Test Gym' }] });
      const res = await request(app).get('/api/gyms/1');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ id: 1, name: 'Test Gym' });
    });

    test('GET /api/gyms/:id returns 404 for unknown gym', async () => {
      poolMock.query.mockResolvedValueOnce({ rows: [] });
      const res = await request(app).get('/api/gyms/999');
      expect(res.status).toBe(404);
    });

    test('GET /api/gyms/:id/activity returns recent activity', async () => {
      poolMock.query.mockResolvedValueOnce({ rows: [{ event_type: 'checkin' }] });
      const res = await request(app).get('/api/gyms/1/activity');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([{ event_type: 'checkin' }]);
    });
  });

  describe('Members API', () => {
    test('GET /api/members returns members list', async () => {
      poolMock.query
        .mockResolvedValueOnce({ rows: [{ count: 1 }] }) // count
        .mockResolvedValueOnce({ rows: [{ id: 1, full_name: 'John' }] }); // members
      const res = await request(app).get('/api/members');
      expect(res.status).toBe(200);
      expect(res.body.members).toHaveLength(1);
      expect(res.body.total).toBe(1);
    });
  });

  describe('Analytics API', () => {
    test('GET /api/analytics/peak-hours returns heatmap data', async () => {
      poolMock.query.mockResolvedValueOnce({ rows: [{ hour_of_day: 10, checkin_count: 5 }] });
      const res = await request(app).get('/api/analytics/peak-hours');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
    });

    test('GET /api/analytics/revenue returns revenue data', async () => {
      poolMock.query
        .mockResolvedValueOnce({ rows: [{ plan_type: 'monthly', total_revenue: 1000 }] })
        .mockResolvedValueOnce({ rows: [{ date: '2026-01-01', daily_revenue: 500 }] });
      const res = await request(app).get('/api/analytics/revenue');
      expect(res.status).toBe(200);
      expect(res.body.by_plan).toBeDefined();
    });

    test('GET /api/analytics/comparison returns comparison data', async () => {
      poolMock.query.mockResolvedValueOnce({ rows: [{ id: 1, revenue_30d: 5000 }] });
      const res = await request(app).get('/api/analytics/comparison');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
    });
  });

  describe('Anomalies API', () => {
    test('GET /api/anomalies returns anomalies list', async () => {
      poolMock.query.mockResolvedValueOnce({ rows: [{ id: 1, type: 'capacity_breach' }] });
      const res = await request(app).get('/api/anomalies');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
    });

    test('PUT /api/anomalies/:id/acknowledge updates anomaly', async () => {
      poolMock.query.mockResolvedValueOnce({ rows: [{ id: 1, status: 'acknowledged' }] });
      const res = await request(app).put('/api/anomalies/1/acknowledge');
      expect(res.status).toBe(200);
      expect(wsManagerMock.broadcastAnomalyResolved).toHaveBeenCalled();
    });

    test('PUT /api/anomalies/:id/resolve updates anomaly', async () => {
      poolMock.query.mockResolvedValueOnce({ rows: [{ id: 1, status: 'resolved' }] });
      const res = await request(app).put('/api/anomalies/1/resolve');
      expect(res.status).toBe(200);
      expect(wsManagerMock.broadcastAnomalyResolved).toHaveBeenCalled();
    });
  });

  describe('Simulator API', () => {
    test('GET /api/simulator/status returns status', async () => {
      const res = await request(app).get('/api/simulator/status');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('stopped');
    });

    test('POST /api/simulator/start starts simulator', async () => {
      const res = await request(app).post('/api/simulator/start').send({ speed: 1 });
      expect(res.status).toBe(200);
      expect(simulatorMock.start).toHaveBeenCalledWith(1);
    });
  });
});
