const { AnomalyDetector } = require('../../src/services/anomalyDetector');

describe('Anomaly Detector Unit Tests', () => {
  let poolMock;
  let wsManagerMock;
  let detector;

  beforeEach(() => {
    poolMock = {
      query: jest.fn()
    };
    wsManagerMock = {
      broadcastAnomaly: jest.fn(),
      broadcastAnomalyResolved: jest.fn()
    };
    detector = new AnomalyDetector(poolMock, wsManagerMock);
  });

  afterEach(() => {
    detector.stop();
  });

  test('start() sets intervalId', () => {
    // Avoid the immediate run by mocking detect
    detector.detect = jest.fn();
    detector.start(10000);
    expect(detector.intervalId).not.toBeNull();
  });

  test('createAnomalyIfNew does not create if exists', async () => {
    poolMock.query.mockResolvedValueOnce({ rows: [{ id: 1 }] }); // exists
    const result = await detector.createAnomalyIfNew(1, 'capacity_breach', 'test', 'high');
    expect(result).toBeNull();
    expect(wsManagerMock.broadcastAnomaly).not.toHaveBeenCalled();
  });

  test('createAnomalyIfNew creates and broadcasts if new', async () => {
    poolMock.query.mockResolvedValueOnce({ rows: [] }) // not exists
      .mockResolvedValueOnce({ rows: [{ id: 2, gym_id: 1, type: 'capacity_breach' }] });
    
    const result = await detector.createAnomalyIfNew(1, 'capacity_breach', 'test', 'high');
    expect(result).toEqual({ id: 2, gym_id: 1, type: 'capacity_breach' });
    expect(wsManagerMock.broadcastAnomaly).toHaveBeenCalled();
  });

  test('resolveAnomaly updates DB and broadcasts', async () => {
    poolMock.query.mockResolvedValueOnce({
      rows: [{ id: 1, status: 'resolved' }]
    });
    
    await detector.resolveAnomaly(1);
    expect(wsManagerMock.broadcastAnomalyResolved).toHaveBeenCalledWith({ id: 1, status: 'resolved' });
  });

  test('resolveAnomaly does nothing if DB update returns empty', async () => {
    poolMock.query.mockResolvedValueOnce({ rows: [] });
    await detector.resolveAnomaly(1);
    expect(wsManagerMock.broadcastAnomalyResolved).not.toHaveBeenCalled();
  });

  test('detectZeroCheckins fires correctly', async () => {
    // Mock time to be during operating hours (e.g., 10 AM)
    jest.useFakeTimers().setSystemTime(new Date('2025-01-01T10:00:00+05:30').getTime());
    poolMock.query.mockResolvedValueOnce({
      rows: [{ gym_id: 1, name: 'Gym 1', capacity: 100, open_checkins: 0 }]
    });
    detector.createAnomalyIfNew = jest.fn();
    await detector.detectZeroCheckins();
    expect(detector.createAnomalyIfNew).toHaveBeenCalledWith(
      1, 'zero_checkins', expect.any(String), 'critical'
    );
    jest.useRealTimers();
  });

  test('detectCapacityBreach fires when occupancy > 90%', async () => {
    poolMock.query.mockResolvedValueOnce({
      rows: [{ gym_id: 2, name: 'Gym 2', capacity: 100, open_checkins: 95 }] // 95 > 90%
    });
    detector.createAnomalyIfNew = jest.fn();
    await detector.detectCapacityBreach();
    expect(detector.createAnomalyIfNew).toHaveBeenCalledWith(
      2, 'capacity_breach', expect.any(String), 'high'
    );
  });

  test('detectRevenueDrop fires when revenue is low', async () => {
    poolMock.query.mockResolvedValueOnce({
      rows: [{ gym_id: 3, name: 'Gym 3', today_revenue: 50, last_week_revenue: 200 }]
    });
    detector.createAnomalyIfNew = jest.fn();
    await detector.detectRevenueDrop();
    expect(detector.createAnomalyIfNew).toHaveBeenCalledWith(
      3, 'revenue_drop', expect.any(String), 'critical'
    );
  });

  test('autoResolve clears anomalies correctly', async () => {
    // Return an anomaly to resolve
    poolMock.query.mockResolvedValueOnce({
      rows: [{ id: 99, gym_id: 4, type: 'capacity_breach' }]
    }).mockResolvedValueOnce({ rows: [{ id: 99, status: 'resolved' }] }); // update response
    
    // Mock the check condition inside autoResolve to say it is resolved
    // For capacity_breach it runs another query to check occupancy
    poolMock.query.mockResolvedValueOnce({ rows: [{ open_checkins: 80, capacity: 100 }] });
    
    detector.resolveAnomaly = jest.fn();
    await detector.autoResolve();
    // It should check open anomalies (mock 1), then for each check if resolved (mock 3), then call resolveAnomaly
    expect(detector.resolveAnomaly).toHaveBeenCalledWith(99);
  });
});
