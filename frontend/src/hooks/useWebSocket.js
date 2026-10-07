import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Custom WebSocket hook with auto-reconnect.
 * NO polling — pure push via WebSocket.
 */
export function useWebSocket(url) {
  const [connected, setConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState(null);
  const [events, setEvents] = useState([]);
  const wsRef = useRef(null);
  const reconnectTimer = useRef(null);
  const maxEvents = 100;

  const connect = useCallback(() => {
    try {
      const wsUrl = url || `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        console.log('WebSocket connected');
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setLastMessage(data);
          
          if (data.type !== 'connection') {
            setEvents(prev => {
              const next = [data, ...prev];
              return next.length > maxEvents ? next.slice(0, maxEvents) : next;
            });
          }
        } catch (err) {
          console.error('WS parse error:', err);
        }
      };

      ws.onclose = () => {
        setConnected(false);
        console.log('WebSocket disconnected, reconnecting in 3s...');
        reconnectTimer.current = setTimeout(connect, 3000);
      };

      ws.onerror = (err) => {
        console.error('WebSocket error:', err);
        ws.close();
      };
    } catch (err) {
      console.error('WebSocket connect error:', err);
      reconnectTimer.current = setTimeout(connect, 3000);
    }
  }, [url]);

  useEffect(() => {
    connect();
    return () => {
      if (wsRef.current) wsRef.current.close();
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    };
  }, [connect]);

  return { connected, lastMessage, events };
}
