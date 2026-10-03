import React, { memo } from 'react';
import type { Tick } from '../types';

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

function pathOf(v: number[], w: number, h: number): string {
  if (v.length < 2) return '';
  return v.map((q, i) => {
    const x = (i / (v.length - 1)) * w;
    const y = h - clamp(q, 0, 1) * (h - 10) - 5;
    return (i ? ' L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
  }).join('');
}

function areaOf(v: number[], w: number, h: number): string {
  if (v.length < 2) return '';
  const p = pathOf(v, w, h);
  return `${p} L${w} ${h} L0 ${h} Z`;
}

interface Threshold {
  normY: number;
  label: string;
  color: string;
  bg: string;
  border: string;
  dash?: string;
}

interface LineDef {
  v: number[];
  color: string;
  width?: number;
  dash?: string;
  area?: boolean;
  dot?: boolean;
}

function WaveformPlot({
  id,
  lines,
  thresholds,
  w = 300,
  h = 100
}: {
  id: string;
  lines: LineDef[];
  thresholds: Threshold[];
  w?: number;
  h?: number;
}) {
  const elements: React.ReactNode[] = [];
  const gradDefs: React.ReactNode[] = [];

  // Area gradients
  lines.forEach((l, idx) => {
    if (l.area) {
      gradDefs.push(
        <linearGradient key={`grad-${id}-${idx}`} id={`grad-${id}-${idx}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={l.color} stopOpacity="0.24" />
          <stop offset="65%" stopColor={l.color} stopOpacity="0.06" />
          <stop offset="100%" stopColor={l.color} stopOpacity="0.00" />
        </linearGradient>
      );
    }
  });

  // Background subtle horizontal grid rules
  elements.push(
    <line key="g-25" x1="0" y1={(h * 0.25).toFixed(1)} x2={w} y2={(h * 0.25).toFixed(1)} stroke="#E2E8F0" strokeWidth="0.8" strokeDasharray="3 3" />,
    <line key="g-50" x1="0" y1={(h * 0.50).toFixed(1)} x2={w} y2={(h * 0.50).toFixed(1)} stroke="#CBD5E1" strokeWidth="0.8" strokeDasharray="3 3" />,
    <line key="g-75" x1="0" y1={(h * 0.75).toFixed(1)} x2={w} y2={(h * 0.75).toFixed(1)} stroke="#E2E8F0" strokeWidth="0.8" strokeDasharray="3 3" />
  );

  // Shaded area fills
  lines.forEach((l, idx) => {
    if (l.area && l.v.length >= 2) {
      elements.push(
        <path key={`area-${idx}`} d={areaOf(l.v, w, h)} fill={`url(#grad-${id}-${idx})`} />
      );
    }
  });

  // Threshold guide lines (lines only, NO distorted text in SVG!)
  thresholds.forEach((th, idx) => {
    const yPos = h - clamp(th.normY, 0, 1) * (h - 10) - 5;
    elements.push(
      <line
        key={`th-${idx}`}
        x1="0"
        y1={yPos.toFixed(1)}
        x2={w}
        y2={yPos.toFixed(1)}
        stroke={th.color}
        strokeDasharray={th.dash || "4 3"}
        strokeWidth="1.2"
        vectorEffect="non-scaling-stroke"
      />
    );
  });

  // Data paths
  lines.forEach((l, idx) => {
    if (l.v.length >= 2) {
      elements.push(
        <path
          key={`ln-${idx}`}
          d={pathOf(l.v, w, h)}
          stroke={l.color}
          strokeDasharray={l.dash || undefined}
          fill="none"
          strokeWidth={l.width || 2.2}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      );

      // Latest head point pulse beacon
      if (l.dot && l.v.length > 0) {
        const lastY = h - clamp(l.v[l.v.length - 1], 0, 1) * (h - 10) - 5;
        const cx = w - 4;
        elements.push(
          <g key={`dt-${idx}`}>
            <circle cx={cx} cy={lastY.toFixed(1)} r="7" fill={l.color} opacity="0.25">
              <animate attributeName="r" values="3.5;8;3.5" dur="1.4s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.4;0.05;0.4" dur="1.4s" repeatCount="indefinite" />
            </circle>
            <circle cx={cx} cy={lastY.toFixed(1)} r="3.2" fill={l.color} stroke="#ffffff" strokeWidth="1.2" />
          </g>
        );
      }
    }
  });

  return (
    <div className="ch-plot">
      <svg className="ch-svg" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
        <defs>{gradDefs}</defs>
        {elements}
      </svg>

      {/* Pure Typography Threshold Labels (No boxes/blocks) */}
      {thresholds.map((th, idx) => {
        // SVG coordinate: yPos = h - clamp(th.normY, 0, 1) * (h - 10) - 5
        const norm = clamp(th.normY, 0, 1);
        const yPos = h - norm * (h - 10) - 5;
        const topPct = (yPos / h) * 100;
        return (
          <div
            key={`th-lbl-${idx}`}
            className="th-label"
            style={{
              position: 'absolute',
              right: '8px',
              top: `${topPct}%`,
              transform: 'translateY(-100%)',
              paddingBottom: '3px',
              color: th.color,
            }}
          >
            {th.label}
          </div>
        );
      })}
    </div>
  );
}

export const TelemetryCharts = memo(function TelemetryCharts({
  history,
  tick
}: {
  history: Tick[];
  tick?: Tick;
}) {
  const tl = tick?.telemetry;
  const tt = history.slice(-140);

  const nz = (a: number[], lo: number, hi: number) => a.map(x => clamp((x - lo) / (hi - lo || 1e-5), 0, 1));
  const yy = (v: number, lo: number, hi: number) => (v - lo) / (hi - lo || 1e-5);
  const g = (f: string) => tt.map(t => (t.telemetry as any)?.[f] ?? 0);

  // 1. Vibration Dynamics (ISO 10816-3 Severity Zones)
  const v_rms = g('vibration_rms_mm_s');
  const v_cf = g('vibration_crest_factor');
  const max_v = Math.max(3.2, ...v_rms);
  const hi_v = Math.max(5.5, max_v * 1.15);
  const curV = tl?.vibration_rms_mm_s ?? 0;
  const curCF = tl?.vibration_crest_factor ?? 0;
  const vibColor = curV > 4.5 ? '#D32F2F' : curV > 2.8 ? '#E0A100' : '#2E9E4F';
  const vibPill = curV > 4.5 ? { c: 'crit', l: 'Zone D (Danger)' } : curV > 2.8 ? { c: 'warn', l: 'Zone C (Alert)' } : curV > 1.8 ? { c: 'warn', l: 'Zone B (Acceptable)' } : { c: 'ok', l: 'Zone A (Good)' };

  // 2. Thermal Dynamics & Gradient
  const t_c = g('temperature_c');
  const t_r = g('temp_rate_c_per_min');
  const min_t = Math.min(...(t_c.length ? t_c : [40]));
  const max_t = Math.max(...(t_c.length ? t_c : [65]));
  const lo_t = Math.min(25, Math.floor(min_t - 5));
  const hi_t = Math.max(90, Math.ceil(max_t + 8));
  const curT = tl?.temperature_c ?? 0;
  const curTR = tl?.temp_rate_c_per_min ?? 0;
  const isPc = tick?.machine_id === 'PC-01';
  const warn_t = isPc ? 70 : 68;
  const crit_t = isPc ? 82 : 78;
  const thermColor = curT >= crit_t ? '#D32F2F' : curT >= warn_t ? '#E0A100' : '#16191C';
  const thermPill = curT >= crit_t ? { c: 'crit', l: 'Critical Overheat' } : curT >= warn_t ? { c: 'warn', l: 'Thermal Warning' } : { c: 'ok', l: 'Nominal Temp' };

  // 3. Power, Current & Spindle Drive
  const c_a = g('motor_current_a');
  const rpms = g('spindle_rpm');
  const max_c = Math.max(6.5, ...c_a);
  const hi_c = Math.max(9.0, max_c * 1.18);
  const max_rpm = Math.max(5000, ...rpms);
  const curC = tl?.motor_current_a ?? 0;
  const curRPM = Math.round(tl?.spindle_rpm ?? 0);
  const curColor = curC > 7.5 ? '#D32F2F' : curC > 6.0 ? '#E0A100' : '#16191C';
  const powerPill = curC > 7.5 ? { c: 'crit', l: 'Overcurrent Trip' } : curC > 6.0 ? { c: 'warn', l: 'High Workload' } : { c: 'ok', l: 'Stable Drive' };

  return (
    <div className="charts">
      {/* ── CARD 1: VIBRATION ── */}
      <div className="ch">
        <div className="ch-head">
          <div className="ch-top">
            <span className="ch-name">Vibration (ISO 10816-3)</span>
            <span className={`ch-pill ${vibPill.c}`}>{vibPill.l}</span>
          </div>
          <div className="ch-val-row">
            <div className="ch-main" style={{ color: vibColor }}>
              {curV.toFixed(2)} <span className="ch-unit">mm/s</span>
            </div>
            <div className="ch-sub">
              Crest Factor: <b>{curCF.toFixed(1)}</b>
            </div>
          </div>
        </div>

        <div className="ch-body">
          <div className="ch-yaxis">
            <span>{hi_v.toFixed(1)}</span>
            <span>{(hi_v * 0.5).toFixed(1)}</span>
            <span>0.0</span>
          </div>

          <WaveformPlot
            id="c1"
            w={300}
            h={100}
            lines={[
              { v: nz(v_rms, 0, hi_v), color: vibColor, width: 2.2, dot: true, area: true }
            ]}
            thresholds={[
              {
                normY: yy(4.5, 0, hi_v),
                label: '4.5 mm/s ISO-C Limit',
                color: '#D32F2F',
                bg: 'rgba(254, 242, 242, 0.95)',
                border: '#F87171',
                dash: '4 3'
              },
              {
                normY: yy(1.8, 0, hi_v),
                label: '1.8 Good (Zone A)',
                color: '#15803D',
                bg: 'rgba(240, 253, 244, 0.95)',
                border: '#86EFAC',
                dash: '3 3'
              }
            ]}
          />
        </div>

        <div className="ch-foot">
          <span>ISO 10816-3 Class II Rigid</span>
          <span>140 pts · 10 Hz Real-Time</span>
        </div>
      </div>

      {/* ── CARD 2: THERMAL DYNAMICS ── */}
      <div className="ch">
        <div className="ch-head">
          <div className="ch-top">
            <span className="ch-name">Thermal Dynamics</span>
            <span className={`ch-pill ${thermPill.c}`}>{thermPill.l}</span>
          </div>
          <div className="ch-val-row">
            <div className="ch-main" style={{ color: thermColor }}>
              {curT.toFixed(1)} <span className="ch-unit">°C</span>
            </div>
            <div className="ch-sub">
              Gradient: <b>{curTR >= 0 ? '+' : ''}{curTR.toFixed(2)} °C/m</b>
            </div>
          </div>
        </div>

        <div className="ch-body">
          <div className="ch-yaxis">
            <span>{hi_t}°C</span>
            <span>{Math.round((lo_t + hi_t) / 2)}°C</span>
            <span>{lo_t}°C</span>
          </div>

          <WaveformPlot
            id="c2"
            w={300}
            h={100}
            lines={[
              { v: nz(t_c, lo_t, hi_t), color: thermColor, width: 2.2, dot: true, area: true }
            ]}
            thresholds={[
              ...(yy(crit_t, lo_t, hi_t) >= 0 && yy(crit_t, lo_t, hi_t) <= 1
                ? [
                    {
                      normY: yy(crit_t, lo_t, hi_t),
                      label: `${crit_t}°C Critical Limit`,
                      color: '#D32F2F',
                      bg: 'rgba(254, 242, 242, 0.95)',
                      border: '#F87171',
                      dash: '4 3'
                    }
                  ]
                : []),
              ...(yy(warn_t, lo_t, hi_t) >= 0 && yy(warn_t, lo_t, hi_t) <= 1
                ? [
                    {
                      normY: yy(warn_t, lo_t, hi_t),
                      label: `${warn_t}°C Warning`,
                      color: '#B45309',
                      bg: 'rgba(254, 243, 199, 0.95)',
                      border: '#FCD34D',
                      dash: '3 3'
                    }
                  ]
                : [])
            ]}
          />
        </div>

        <div className="ch-foot">
          <span>Continuous Limit: {warn_t}°C</span>
          <span>Thermistor Response</span>
        </div>
      </div>

      {/* ── CARD 3: POWER & DRIVE ── */}
      <div className="ch">
        <div className="ch-head">
          <div className="ch-top">
            <span className="ch-name">Power & Drive</span>
            <span className={`ch-pill ${powerPill.c}`}>{powerPill.l}</span>
          </div>
          <div className="ch-val-row">
            <div className="ch-main" style={{ color: curColor }}>
              {curC.toFixed(2)} <span className="ch-unit">A</span>
            </div>
            <div className="ch-sub">
              Spindle: <b>{curRPM} RPM</b>
            </div>
          </div>
        </div>

        <div className="ch-body">
          <div className="ch-yaxis">
            <span>{hi_c.toFixed(1)}A</span>
            <span>{(hi_c * 0.5).toFixed(1)}A</span>
            <span>0.0A</span>
          </div>

          <WaveformPlot
            id="c3"
            w={300}
            h={100}
            lines={[
              { v: nz(c_a, 0, hi_c), color: curColor, width: 2.2, dot: true, area: true }
            ]}
            thresholds={[
              {
                normY: yy(7.5, 0, hi_c),
                label: '7.5 A Rated Trip Limit',
                color: '#D32F2F',
                bg: 'rgba(254, 242, 242, 0.95)',
                border: '#F87171',
                dash: '4 3'
              }
            ]}
          />
        </div>

        <div className="ch-foot">
          <span>Rated: 5.2 A @ 4950 RPM</span>
          <span>Inverter Current Sense</span>
        </div>
      </div>
    </div>
  );
});