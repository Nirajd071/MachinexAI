import React, { memo } from 'react';
import type { FaultType, Tick } from '../types';

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

function pathOf(v: number[], w: number, h: number): string {
  if (v.length < 2) return '';
  const points = v.map((q, i) => ({
    x: (i / (v.length - 1)) * w,
    y: h - clamp(q, 0, 1) * (h - 10) - 5,
  }));
  let path = `M${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const previous = points[Math.max(0, i - 1)];
    const start = points[i];
    const end = points[i + 1];
    const next = points[Math.min(points.length - 1, i + 2)];
    const cp1x = start.x + (end.x - previous.x) / 6;
    const cp1y = clamp(start.y + (end.y - previous.y) / 6, 5, h - 5);
    const cp2x = end.x - (next.x - start.x) / 6;
    const cp2y = clamp(end.y - (next.y - start.y) / 6, 5, h - 5);
    path += ` C${cp1x.toFixed(1)} ${cp1y.toFixed(1)} ${cp2x.toFixed(1)} ${cp2y.toFixed(1)} ${end.x.toFixed(1)} ${end.y.toFixed(1)}`;
  }
  return path;
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
  tick,
  onTriggerFault
}: {
  history: Tick[];
  tick?: Tick;
  onTriggerFault?: (fault: FaultType, intensity?: number) => void;
}) {
  const tl = tick?.telemetry;
  const tt = history.slice(-200);
  const machineId = tick?.machine_id || 'CNC-01';
  const isPrinter = machineId === 'PRN-01';
  const isPc = machineId === 'PC-01';
  const isCnc02 = machineId === 'CNC-02';

  const nz = (a: number[], lo: number, hi: number) => a.map(x => clamp((x - lo) / (hi - lo || 1e-5), 0, 1));
  const yy = (v: number, lo: number, hi: number) => (v - lo) / (hi - lo || 1e-5);
  const g = (f: string) => tt.map(t => (t.telemetry as any)?.[f] ?? 0);

  // 1. Vibration Dynamics (ISO 10816-3 for CNC, Gantry Dynamics for Printer, Chassis Resonance for PC)
  const v_rms = g('vibration_rms_mm_s');
  const v_cf = g('vibration_crest_factor');
  const max_v = Math.max(3.2, ...v_rms);
  const hi_v = Math.max(5.5, max_v * 1.15);
  const curV = tl?.vibration_rms_mm_s ?? 0;
  const curCF = tl?.vibration_crest_factor ?? 0;

  const vibColor = isPrinter
    ? curV > 3.2 ? '#D32F2F' : curV > 2.0 ? '#E0A100' : '#2E9E4F'
    : isPc
    ? curV > 2.5 ? '#D32F2F' : curV > 1.6 ? '#E0A100' : '#2E9E4F'
    : curV > 4.5 ? '#D32F2F' : curV > 2.8 ? '#E0A100' : '#2E9E4F';

  const vibPill = isPrinter
    ? curV > 3.2 ? { c: 'crit', l: 'Axis Bind / Chatter' } : curV > 2.0 ? { c: 'warn', l: 'Gantry Resonance' } : { c: 'ok', l: 'Smooth Motion' }
    : isPc
    ? curV > 2.5 ? { c: 'crit', l: 'Fan Imbalance' } : curV > 1.6 ? { c: 'warn', l: 'Chassis Jitter' } : { c: 'ok', l: 'Balanced' }
    : curV > 4.5 ? { c: 'crit', l: 'Zone D (Danger)' } : curV > 2.8 ? { c: 'warn', l: 'Zone C (Alert)' } : curV > 1.8 ? { c: 'warn', l: 'Zone B (Acceptable)' } : { c: 'ok', l: 'Zone A (Good)' };

  const vibTitle = isPrinter ? 'Gantry & Motion Dynamics' : isPc ? 'Chassis Resonance' : 'Vibration (ISO 10816-3)';
  const vibSub = isPrinter ? `Carriage Crest: ${curCF.toFixed(1)}` : isPc ? `Fan Crest: ${curCF.toFixed(1)}` : `Crest Factor: ${curCF.toFixed(1)}`;
  const vibLegend = isPrinter ? 'Carriage Vibration · mm/s' : isPc ? 'Chassis Vibration · mm/s' : 'Velocity RMS · mm/s';
  const vibFootLeft = isPrinter ? 'FDM Gantry Accelerometer' : isPc ? 'MEMS Accelerometer' : 'ISO 10816-3 Class II';
  const vibFootRight = isPrinter ? 'V-Slot Rail Dynamics' : isPc ? 'Chassis Frame' : `${tt.length} samples`;

  const vibThresholds = isPrinter
    ? [
        { normY: yy(3.2, 0, hi_v), label: '3.2 Resonance Limit', color: '#D32F2F', bg: 'rgba(254, 242, 242, 0.95)', border: '#F87171', dash: '4 3' },
        { normY: yy(1.8, 0, hi_v), label: '1.8 Smooth Travel', color: '#15803D', bg: 'rgba(240, 253, 244, 0.95)', border: '#86EFAC', dash: '3 3' }
      ]
    : isPc
    ? [
        { normY: yy(2.5, 0, hi_v), label: '2.5 Fan Imbalance', color: '#D32F2F', bg: 'rgba(254, 242, 242, 0.95)', border: '#F87171', dash: '4 3' },
        { normY: yy(1.5, 0, hi_v), label: '1.5 Balanced', color: '#15803D', bg: 'rgba(240, 253, 244, 0.95)', border: '#86EFAC', dash: '3 3' }
      ]
    : [
        { normY: yy(4.5, 0, hi_v), label: '4.5 ISO-C Limit', color: '#D32F2F', bg: 'rgba(254, 242, 242, 0.95)', border: '#F87171', dash: '4 3' },
        { normY: yy(1.8, 0, hi_v), label: '1.8 Good (Zone A)', color: '#15803D', bg: 'rgba(240, 253, 244, 0.95)', border: '#86EFAC', dash: '3 3' }
      ];

  // 2. Thermal Dynamics & Gradient
  const t_c = g('temperature_c');
  const t_r = g('temp_rate_c_per_min');
  const min_t = Math.min(...(t_c.length ? t_c : [40]));
  const max_t = Math.max(...(t_c.length ? t_c : [65]));
  const lo_t = Math.min(25, Math.floor(min_t - 5));
  const hi_t = Math.max(90, Math.ceil(max_t + 8));
  const curT = tl?.temperature_c ?? 0;
  const curTR = tl?.temp_rate_c_per_min ?? 0;

  const warn_t = isPrinter ? 58 : isPc ? 70 : 68;
  const crit_t = isPrinter ? 70 : isPc ? 82 : 78;

  const thermColor = curT >= crit_t ? '#D32F2F' : curT >= warn_t ? '#E0A100' : '#16191C';
  const thermPill = isPrinter
    ? curT >= crit_t ? { c: 'crit', l: 'Thermal Runaway' } : curT >= warn_t ? { c: 'warn', l: 'Heater Alert' } : { c: 'ok', l: 'Nominal Temp' }
    : isPc
    ? curT >= crit_t ? { c: 'crit', l: 'Thermal Throttling' } : curT >= warn_t ? { c: 'warn', l: 'High Thermal' } : { c: 'ok', l: 'Nominal Core' }
    : curT >= crit_t ? { c: 'crit', l: 'Critical Overheat' } : curT >= warn_t ? { c: 'warn', l: 'Thermal Warning' } : { c: 'ok', l: 'Nominal Temp' };

  const thermTitle = isPrinter ? 'Hotend Thermal Dynamics' : isPc ? 'CPU Package Thermal' : 'Spindle Thermal Dynamics';
  const thermLegend = isPrinter ? 'Hotend Core · °C' : isPc ? 'CPU Package Temp · °C' : 'Core Spindle Temp · °C';
  const thermFootLeft = isPrinter ? 'NTC 100K Thermistor' : isPc ? 'Detected CPU package sensor' : 'PT100 / Core RTD';
  const thermFootRight = isPrinter ? 'PID Loop Control' : isPc ? 'Host hardware reading + test overlay' : `Limit: ${warn_t}°C`;

  // 3. Power & Current Drive
  const c_a = g('motor_current_a');
  const max_c = Math.max(6.5, ...c_a);
  const hi_c = isPrinter ? 6.0 : Math.max(10.0, max_c * 1.15);
  const curC = tl?.motor_current_a ?? 0;

  const warn_c = isPrinter ? 3.4 : isPc ? 5.5 : 6.0;
  const trip_c = isPrinter ? 4.5 : isPc ? 7.5 : 7.5;

  const curColor = curC > trip_c ? '#D32F2F' : curC > warn_c ? '#E0A100' : '#16191C';
  const powerPill = isPrinter
    ? curC > trip_c ? { c: 'crit', l: 'Short / Overcurrent' } : curC > warn_c ? { c: 'warn', l: 'Heater Surge' } : { c: 'ok', l: 'Balanced 24V Draw' }
    : isPc
    ? curC > trip_c ? { c: 'crit', l: 'VRM Overload' } : curC > warn_c ? { c: 'warn', l: 'Heavy Compute' } : { c: 'ok', l: 'Normal Load' }
    : curC > trip_c ? { c: 'crit', l: 'Overcurrent Trip' } : curC > warn_c ? { c: 'warn', l: 'High Workload' } : { c: 'ok', l: 'Stable Drive' };

  const powerTitle = isPrinter ? '24V Stepper & Heater Current' : isPc ? '12V Compute Power Draw' : 'Spindle Drive Current';
  const powerSub = isPrinter ? 'Rated: 3.2 A (24V PSU)' : isPc ? 'Rated: 5.0 A (12V ATX)' : 'Rated: 5.2 A';
  const powerLegend = isPrinter ? '24V DC Current · A' : isPc ? '12V ATX Current · A' : 'Motor Current · A';
  const powerFootLeft = isPrinter ? 'Mean Well 24V Rail Sense' : isPc ? 'VRM Inverter Shunt' : 'Inverter Current Sense';
  const powerFootRight = isPrinter ? 'ACS712 Current Shunt' : isPc ? '12V ATX Power Rail' : 'Hall-Effect CT Shunt';

  // 4. Kinematic Drive (Spindle Speed for CNC, Extruder Feed for Printer, Fan Tachometer for PC)
  const curVol = tl?.rpm_volatility ?? 0;
  const rpms = g('spindle_rpm');
  const curRPM = Math.round(tl?.spindle_rpm ?? 0);

  // For 3D Printer: derive real, meaningful Filament Feed Rate (mm/s) instead of dead 0 RPM spindle!
  // Nominal print velocity = 60 mm/s. Slip / stall drops it to ~26-32 mm/s with jitter.
  const curFeed = Math.max(6, Math.round(60 - curVol * 82 + (curTR > 1 ? -4 : 0)));
  const feedSeries = tt.map(t => Math.max(6, Math.round(60 - ((t.telemetry as any)?.rpm_volatility ?? 0) * 82)));

  const nominal_rpm = isCnc02 ? 3400 : isPc ? 3100 : 4950;
  const slip_threshold = nominal_rpm * 0.90;

  const lo_rpm = isCnc02 ? 2000 : isPc ? 1000 : 3000;
  const hi_rpm = isCnc02 ? 4000 : isPc ? 4000 : 5500;

  const kinTitle = isPrinter ? 'Derived Extruder Feed' : isPc ? 'Estimated Cooling Fan Speed' : 'Kinematic Drive';
  const kinVal = isPrinter ? curFeed : isPc ? (curRPM || 3100) : curRPM;
  const kinUnit = isPrinter ? 'mm/s' : 'RPM';
  const kinSub = isPrinter ? `Extruder Jitter: ${(curVol * 100).toFixed(1)}%` : `Volatility: ${(curVol * 100).toFixed(1)}%`;

  const kinColor = isPrinter
    ? (curFeed < 40 || curVol > 0.12) ? '#D32F2F' : curVol > 0.05 ? '#E0A100' : '#16191C'
    : isPc
    ? curRPM < 1800 ? '#D32F2F' : curRPM < 2400 ? '#E0A100' : '#16191C'
    : (curRPM < slip_threshold && curRPM > 500) || curVol > 0.08 ? '#D32F2F' : curVol > 0.04 ? '#E0A100' : '#16191C';

  const kinPill = isPrinter
    ? (curFeed < 40 || curVol > 0.12) ? { c: 'crit', l: 'Extruder Slip / Clog' } : curVol > 0.05 ? { c: 'warn', l: 'Feed Jitter' } : { c: 'ok', l: 'Uniform Flow' }
    : isPc
    ? curRPM < 1800 ? { c: 'crit', l: 'Fan Stall / Loss' } : curRPM < 2400 ? { c: 'warn', l: 'PWM Slew' } : { c: 'ok', l: 'Aerodynamic Sync' }
    : (curRPM < slip_threshold && curRPM > 500) || curVol > 0.08 ? { c: 'crit', l: 'Slip / Stall' } : curVol > 0.04 ? { c: 'warn', l: 'Speed Jitter' } : { c: 'ok', l: 'Synchronous' };

  const kinYAxis = isPrinter
    ? { hi: 80, mid: 40, lo: 0 }
    : { hi: hi_rpm, mid: Math.round((lo_rpm + hi_rpm) * 0.5), lo: lo_rpm };

  const kinLines = isPrinter
    ? [{ v: nz(feedSeries, 0, 80), color: kinColor, width: 2.4, dot: true, area: false }]
    : [{ v: nz(rpms, lo_rpm, hi_rpm), color: kinColor, width: 2.4, dot: true, area: false }];

  const kinThresholds = isPrinter
    ? [
        { normY: yy(60, 0, 80), label: '60 mm/s Nominal Feed', color: '#15803D', bg: 'rgba(240, 253, 244, 0.95)', border: '#86EFAC', dash: '3 3' },
        { normY: yy(38, 0, 80), label: '38 mm/s Jam / Clog Line', color: '#D32F2F', bg: 'rgba(254, 242, 242, 0.95)', border: '#F87171', dash: '4 3' }
      ]
    : isPc
    ? [
        { normY: yy(3100, 1000, 4000), label: '3100 Nominal Fan', color: '#15803D', bg: 'rgba(240, 253, 244, 0.95)', border: '#86EFAC', dash: '3 3' },
        { normY: yy(1800, 1000, 4000), label: '1800 Fan Stall Line', color: '#D32F2F', bg: 'rgba(254, 242, 242, 0.95)', border: '#F87171', dash: '4 3' }
      ]
    : [
        { normY: yy(nominal_rpm, lo_rpm, hi_rpm), label: `${nominal_rpm} Nominal`, color: '#15803D', bg: 'rgba(240, 253, 244, 0.95)', border: '#86EFAC', dash: '3 3' },
        { normY: yy(slip_threshold, lo_rpm, hi_rpm), label: `${Math.round(slip_threshold)} Slip Line`, color: '#D32F2F', bg: 'rgba(254, 242, 242, 0.95)', border: '#F87171', dash: '4 3' }
      ];

  const kinLegend = isPrinter ? 'Estimated Filament Feed · mm/s' : isPc ? 'Estimated Fan Speed · RPM' : 'Spindle Speed · RPM';
  const kinFootLeft = isPrinter ? 'Derived from simulated motion jitter' : isPc ? 'Simulated; host fan tach unavailable' : 'Optical Encoder / VFD';
  const kinFootRight = isPrinter ? 'Digital twin estimate' : isPc ? '3100 RPM baseline + fault overlay' : isCnc02 ? 'Heavy Milling Rig' : 'Direct Spindle';

  return (
    <div className="charts">
      {/* ── CARD 1: VIBRATION / GANTRY ── */}
      <div className="ch">
        <div className="ch-head">
          <div className="ch-top">
            <span className="ch-name">{vibTitle}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              {onTriggerFault && (
                <button
                  className="ch-trig-btn"
                  title="Trigger Graph 1 channel"
                  onClick={() => onTriggerFault('bearing_spall', 85)}
                >
                  ⚡ G1
                </button>
              )}
              <span className={`ch-pill ${vibPill.c}`}>{vibPill.l}</span>
            </div>
          </div>
          <div className="ch-val-row">
            <div className="ch-main" style={{ color: vibColor }}>
              {curV.toFixed(2)} <span className="ch-unit">mm/s</span>
            </div>
            <div className="ch-sub">
              <b>{vibSub}</b>
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
              { v: nz(v_rms, 0, hi_v), color: vibColor, width: 2.4, dot: true, area: true }
            ]}
            thresholds={vibThresholds}
          />
        </div>

        <div className="ch-legend" aria-label="Vibration chart series">
          <span><i style={{ background: vibColor }} />{vibLegend}</span>
        </div>

        <div className="ch-foot">
          <span>{vibFootLeft}</span>
          <span>{vibFootRight}</span>
        </div>
      </div>

      {/* ── CARD 2: THERMAL DYNAMICS ── */}
      <div className="ch">
        <div className="ch-head">
          <div className="ch-top">
            <span className="ch-name">{thermTitle}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              {onTriggerFault && (
                <button
                  className="ch-trig-btn"
                  title="Trigger Graph 2 channel"
                  onClick={() => onTriggerFault('spindle_overheat', 90)}
                >
                  ⚡ G2
                </button>
              )}
              <span className={`ch-pill ${thermPill.c}`}>{thermPill.l}</span>
            </div>
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
              { v: nz(t_c, lo_t, hi_t), color: thermColor, width: 2.4, dot: true, area: true }
            ]}
            thresholds={[
              ...(yy(crit_t, lo_t, hi_t) >= 0 && yy(crit_t, lo_t, hi_t) <= 1
                ? [
                    {
                      normY: yy(crit_t, lo_t, hi_t),
                      label: `${crit_t}°C ${isPrinter ? 'Runaway Limit' : 'Critical'}`,
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
                      label: `${warn_t}°C ${isPrinter ? 'Heater Alert' : 'Warning'}`,
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

        <div className="ch-legend" aria-label="Thermal chart series">
          <span><i style={{ background: thermColor }} />{thermLegend}</span>
        </div>

        <div className="ch-foot">
          <span>{thermFootLeft}</span>
          <span>{thermFootRight}</span>
        </div>
      </div>

      {/* ── CARD 3: POWER & CURRENT ── */}
      <div className="ch">
        <div className="ch-head">
          <div className="ch-top">
            <span className="ch-name">{powerTitle}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              {onTriggerFault && (
                <button
                  className="ch-trig-btn"
                  title="Trigger Graph 3 channel"
                  onClick={() => onTriggerFault('current_overload', 85)}
                >
                  ⚡ G3
                </button>
              )}
              <span className={`ch-pill ${powerPill.c}`}>{powerPill.l}</span>
            </div>
          </div>
          <div className="ch-val-row">
            <div className="ch-main" style={{ color: curColor }}>
              {curC.toFixed(2)} <span className="ch-unit">A</span>
            </div>
            <div className="ch-sub">
              <b>{powerSub}</b>
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
              { v: nz(c_a, 0, hi_c), color: curColor, width: 2.4, dot: true, area: true }
            ]}
            thresholds={[
              {
                normY: yy(trip_c, 0, hi_c),
                label: `${trip_c} A Trip Limit`,
                color: '#D32F2F',
                bg: 'rgba(254, 242, 242, 0.95)',
                border: '#F87171',
                dash: '4 3'
              },
              ...(warn_c > 0 && yy(warn_c, 0, hi_c) < 0.9
                ? [
                    {
                      normY: yy(warn_c, 0, hi_c),
                      label: `${warn_c} A Alert`,
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

        <div className="ch-legend" aria-label="Power and drive chart series">
          <span><i style={{ background: curColor }} />{powerLegend}</span>
        </div>

        <div className="ch-foot">
          <span>{powerFootLeft}</span>
          <span>{powerFootRight}</span>
        </div>
      </div>

      {/* ── CARD 4: KINEMATIC DRIVE / EXTRUSION ── */}
      <div className="ch">
        <div className="ch-head">
          <div className="ch-top">
            <span className="ch-name">{kinTitle}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              {onTriggerFault && (
                <button
                  className="ch-trig-btn"
                  title="Trigger Graph 4 channel"
                  onClick={() => onTriggerFault('belt_slip', 80)}
                >
                  ⚡ G4
                </button>
              )}
              <span className={`ch-pill ${kinPill.c}`}>{kinPill.l}</span>
            </div>
          </div>
          <div className="ch-val-row">
            <div className="ch-main" style={{ color: kinColor }}>
              {kinVal} <span className="ch-unit">{kinUnit}</span>
            </div>
            <div className="ch-sub">
              <b>{kinSub}</b>
            </div>
          </div>
        </div>

        <div className="ch-body">
          <div className="ch-yaxis">
            <span>{kinYAxis.hi}</span>
            <span>{kinYAxis.mid}</span>
            <span>{kinYAxis.lo}</span>
          </div>

          <WaveformPlot
            id="c4"
            w={300}
            h={100}
            lines={kinLines}
            thresholds={kinThresholds}
          />
        </div>

        <div className="ch-legend" aria-label="Kinematic drive series">
          <span><i style={{ background: kinColor }} />{kinLegend}</span>
        </div>

        <div className="ch-foot">
          <span>{kinFootLeft}</span>
          <span>{kinFootRight}</span>
        </div>
      </div>
    </div>
  );
});
