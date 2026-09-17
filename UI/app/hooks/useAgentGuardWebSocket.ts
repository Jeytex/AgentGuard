import { useEffect, useRef, useState, useCallback } from 'react';
import {
  ActionEvaluationResponse,
  ApprovalDecisionResponse,
  WsConnectionStatus,
  WsServerMessage,
} from '../types';

interface UseAgentGuardWebSocketProps {
  url?: string;
  onActionEvaluated?: (action: ActionEvaluationResponse) => void;
  onApprovalResolved?: (resolution: ApprovalDecisionResponse) => void;
  onFallbackPoll?: () => void;
  enabled?: boolean;
}

export function useAgentGuardWebSocket({
  url,
  onActionEvaluated,
  onApprovalResolved,
  onFallbackPoll,
  enabled = true,
}: UseAgentGuardWebSocketProps) {
  const defaultWsUrl = (): string => {
    if (url) return url;
    if (process.env.NEXT_PUBLIC_AGENTGUARD_WS_URL) {
      return process.env.NEXT_PUBLIC_AGENTGUARD_WS_URL;
    }
    if (typeof window !== 'undefined' && window.location?.hostname) {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${proto}//${window.location.hostname}:8000/api/v1/events/ws`;
    }
    return 'ws://localhost:8000/api/v1/events/ws';
  };

  const wsUrl = defaultWsUrl();

  const [status, setStatus] = useState<WsConnectionStatus>('connecting');
  const [lastHeartbeat, setLastHeartbeat] = useState<Date | null>(null);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [nextRetrySeconds, setNextRetrySeconds] = useState(0);

  const isMountedRef = useRef(true);
  const intentionalCloseRef = useRef(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const fallbackPollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Store latest callbacks in refs to avoid reconnection churn on callback re-creation
  const onActionEvaluatedRef = useRef(onActionEvaluated);
  const onApprovalResolvedRef = useRef(onApprovalResolved);
  const onFallbackPollRef = useRef(onFallbackPoll);

  useEffect(() => {
    onActionEvaluatedRef.current = onActionEvaluated;
  }, [onActionEvaluated]);

  useEffect(() => {
    onApprovalResolvedRef.current = onApprovalResolved;
  }, [onApprovalResolved]);

  useEffect(() => {
    onFallbackPollRef.current = onFallbackPoll;
  }, [onFallbackPoll]);

  const clearAllTimers = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    if (!enabled || !isMountedRef.current) return;

    clearAllTimers();

    // Close any previous socket cleanly
    if (wsRef.current) {
      try {
        intentionalCloseRef.current = true;
        wsRef.current.onopen = null;
        wsRef.current.onmessage = null;
        wsRef.current.onclose = null;
        wsRef.current.onerror = null;
        wsRef.current.close();
      } catch {
        // ignore
      }
      wsRef.current = null;
    }

    intentionalCloseRef.current = false;
    if (isMountedRef.current) {
      setStatus((prev) => (prev === 'connected' ? 'connecting' : 'reconnecting'));
    }

    try {
      const socket = new WebSocket(wsUrl);
      wsRef.current = socket;

      socket.onopen = () => {
        if (!isMountedRef.current) {
          socket.close();
          return;
        }
        setStatus('connected');
        setReconnectAttempt(0);
        setNextRetrySeconds(0);
        setLastHeartbeat(new Date());

        // Setup ping keepalive every 15s
        pingIntervalRef.current = setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) {
            try {
              socket.send('ping');
            } catch {
              // error sending ping
            }
          }
        }, 15000);
      };

      socket.onmessage = (event) => {
        if (!isMountedRef.current) return;
        try {
          const raw = JSON.parse(event.data) as WsServerMessage;

          if (raw.event_type === 'PONG') {
            setLastHeartbeat(new Date());
            return;
          }

          if (raw.event_type === 'ACTION_EVALUATED') {
            onActionEvaluatedRef.current?.(raw.data);
          } else if (raw.event_type === 'APPROVAL_RESOLVED') {
            onApprovalResolvedRef.current?.(raw.data);
          }
        } catch {
          // non-JSON message
        }
      };

      socket.onclose = () => {
        if (!isMountedRef.current || intentionalCloseRef.current) return;
        scheduleReconnect();
      };

      socket.onerror = () => {
        if (!isMountedRef.current || intentionalCloseRef.current) return;
        try {
          socket.close();
        } catch {
          // ignore
        }
      };
    } catch {
      if (isMountedRef.current) {
        scheduleReconnect();
      }
    }
  }, [enabled, wsUrl, clearAllTimers]);

  const scheduleReconnect = useCallback(() => {
    if (!isMountedRef.current) return;
    clearAllTimers();
    setStatus('reconnecting');

    setReconnectAttempt((attempt) => {
      const nextAttempt = attempt + 1;
      // Exponential backoff: 1s, 2s, 3s, 5s, up to 10s max
      const delayMs = Math.min(10000, Math.floor(1000 * Math.pow(1.5, Math.min(nextAttempt, 6))));
      const delaySec = Math.round(delayMs / 1000);
      if (isMountedRef.current) {
        setNextRetrySeconds(delaySec);
      }

      countdownTimerRef.current = setInterval(() => {
        if (!isMountedRef.current) {
          if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
          return;
        }
        setNextRetrySeconds((prev) => {
          if (prev <= 1) {
            if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      reconnectTimerRef.current = setTimeout(() => {
        if (isMountedRef.current) {
          connect();
        }
      }, delayMs);

      return nextAttempt;
    });
  }, [clearAllTimers, connect]);

  // Initial connection on mount & unmount cleanup
  useEffect(() => {
    isMountedRef.current = true;
    connect();
    return () => {
      isMountedRef.current = false;
      intentionalCloseRef.current = true;
      clearAllTimers();
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {
          // ignore
        }
        wsRef.current = null;
      }
    };
  }, [connect, clearAllTimers]);

  // Graceful fallback polling: when WebSocket is not connected, poll periodically
  useEffect(() => {
    if (status !== 'connected' && onFallbackPollRef.current) {
      // Run once immediately
      onFallbackPollRef.current();
      // Then every 6 seconds
      fallbackPollIntervalRef.current = setInterval(() => {
        if (isMountedRef.current) {
          onFallbackPollRef.current?.();
        }
      }, 6000);
    } else {
      if (fallbackPollIntervalRef.current) {
        clearInterval(fallbackPollIntervalRef.current);
        fallbackPollIntervalRef.current = null;
      }
    }

    return () => {
      if (fallbackPollIntervalRef.current) {
        clearInterval(fallbackPollIntervalRef.current);
        fallbackPollIntervalRef.current = null;
      }
    };
  }, [status]);

  const manualReconnect = useCallback(() => {
    if (isMountedRef.current) {
      setReconnectAttempt(0);
      connect();
    }
  }, [connect]);

  return {
    status,
    isConnected: status === 'connected',
    isDegraded: status !== 'connected',
    lastHeartbeat,
    reconnectAttempt,
    nextRetrySeconds,
    manualReconnect,
  };
}
