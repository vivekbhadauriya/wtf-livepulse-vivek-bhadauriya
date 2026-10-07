const { Simulator } = require('../../src/services/simulator');

describe('Simulator Service Unit Tests', () => {
  let poolMock;
  let wsManagerMock;
  let simulator;

  beforeEach(() => {
    poolMock = {
      query: jest.fn()
    };
    wsManagerMock = {
      broadcastCheckin: jest.fn(),
      broadcastCheckout: jest.fn(),
      broadcastPayment: jest.fn()
    };
    simulator = new Simulator(poolMock, wsManagerMock);
  });

  afterEach(() => {
    simulator.stop();
  });

  test('Simulator initializes with stopped status', () => {
    expect(simulator.getStatus().status).toBe('paused'); // default running is false
    expect(simulator.speed).toBe(1);
    expect(simulator.eventCount).toBe(0);
  });

  test('start() changes status to running and sets interval', () => {
    const res = simulator.start(5);
    expect(res.status).toBe('running');
    expect(res.speed).toBe(5);
    expect(simulator.intervalId).not.toBeNull();
  });

  test('pause() stops the interval but retains event count', () => {
    simulator.start(1);
    simulator.eventCount = 10;
    const res = simulator.pause();
    expect(res.status).toBe('paused');
    expect(res.events).toBe(10);
    expect(simulator.intervalId).toBeNull();
  });

  test('reset() stops interval and resets event count and speed', async () => {
    simulator.start(10);
    simulator.eventCount = 42;
    const res = await simulator.reset();
    expect(res.status).toBe('reset'); // Returns 'reset' but actual running status is false
    expect(res.events).toBe(0);
    expect(simulator.speed).toBe(1);
    expect(simulator.getStatus().status).toBe('paused');
  });

  test('generateCheckin queries DB and broadcasts', async () => {
    poolMock.query.mockResolvedValueOnce({
      rows: [{ id: 1, gym_id: 2, full_name: 'Test Member', gym_name: 'Test Gym' }]
    }).mockResolvedValueOnce({
      rows: [{ id: 100, member_id: 1, gym_id: 2, checked_in_at: '2026-01-01' }]
    });

    await simulator.generateCheckin();
    expect(poolMock.query).toHaveBeenCalledTimes(2);
    expect(wsManagerMock.broadcastCheckin).toHaveBeenCalledWith({
      id: 100,
      member_id: 1,
      gym_id: 2,
      checked_in_at: '2026-01-01',
      member_name: 'Test Member',
      gym_name: 'Test Gym'
    });
  });

  test('generateCheckin does nothing if no members available', async () => {
    poolMock.query.mockResolvedValueOnce({ rows: [] });
    await simulator.generateCheckin();
    expect(poolMock.query).toHaveBeenCalledTimes(1);
    expect(wsManagerMock.broadcastCheckin).not.toHaveBeenCalled();
  });
});
