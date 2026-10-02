import { useEffect, useRef, useState } from 'react';
import { WS_URL } from '../api';
import type { ConnectionState, Tick } from '../types';
export function useTelemetrySocket(enabled: boolean, onTick: (tick: Tick) => void) {
  const [state, setState] = useState<ConnectionState>('RECONNECTING');
  const [fps, setFps] = useState(0);
  const callback = useRef(onTick); callback.current = onTick;
  useEffect(() => {
    if (!enabled) { setState('OFFLINE'); return; }
    let socket: WebSocket | null = null; let timer = 0; let staleTimer = 0; let retry = 500; let alive = true; let samples: number[] = [];
    const fpsTimer = window.setInterval(() => { const now = Date.now(); samples = samples.filter(v => now - v < 1000); setFps(samples.length); }, 500);
    const connect = () => {
      if (!alive) return;
      setState('RECONNECTING');
      try { socket = new WebSocket(WS_URL); } catch { schedule(); return; }
      socket.onopen = () => { retry = 500; setState('LIVE'); window.clearTimeout(staleTimer); staleTimer = window.setTimeout(() => setState('STALE'), 2000); };
      socket.onmessage = event => {
        try {
          const tick = JSON.parse(event.data) as Tick;
          if (!tick?.machine_id || !tick.telemetry || !tick.health) return;
          callback.current(tick); const now = Date.now(); samples.push(now); samples = samples.filter(v => now - v < 1000);
          setState('LIVE'); window.clearTimeout(staleTimer); staleTimer = window.setTimeout(() => setState('STALE'), 2000);
        } catch { /* Ignore malformed gateway frames. */ }
      };
      socket.onerror = () => socket?.close();
      socket.onclose = () => schedule();
    };
    const schedule = () => { if (!alive) return; setState('RECONNECTING'); timer = window.setTimeout(connect, retry); retry = Math.min(5000, retry * 2); };
    connect();
    return () => { alive = false; window.clearTimeout(timer); window.clearTimeout(staleTimer); window.clearInterval(fpsTimer); socket?.close(); };
  }, [enabled]);
  return { state, fps };
}