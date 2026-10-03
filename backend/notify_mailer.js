/**
 * MachinexAI Universal Emergency Alert Dispatcher
 * Sends publication-grade HTML emails (bulletproof table-based for Gmail, Outlook, iOS)
 * and SMS notifications with attached ISO-10816 maintenance work-order PDFs.
 */

const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

// Auto-load backend/.env if present
try {
  const envPath = path.resolve(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim();
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
} catch {
  // Ignore env loading errors
}

const MACHINE_PROFILES = {
  'CNC-01': {
    name: 'Haas VF-2 Vertical Machining Center',
    type: 'CNC Milling Center (3-Axis)',
    location: 'Smart Manufacturing Lab - Bay A1',
    power: '440V 3-Phase AC (30A LOTO)',
    sop_action: 'Perform 440V breaker lockout/tagout; inspect spindle cartridge and measure radial runout (<0.005mm); seat replacement SKF bearing with induction heater.'
  },
  'CNC-02': {
    name: 'DMG MORI CMX 1100V Machining Center',
    type: 'Heavy Production CNC Mill',
    location: 'Smart Manufacturing Lab - Bay A2',
    power: '440V 3-Phase AC (45A LOTO)',
    sop_action: 'Isolate 440V 45A feeder; discharge DC capacitor bank; inspect heavy gearbox; install SKF NN 3016 K roller bearing using hydraulic puller.'
  },
  'PRN-01': {
    name: 'Creality Ender-3 Pro Precision 3D Printer',
    type: 'Fused Deposition Modeling (FDM)',
    location: 'Additive Manufacturing Studio - Bench 3',
    power: '24V DC / 350W Mean Well PSU',
    sop_action: 'Switch off 24V supply; allow hotend to cool below 35°C; inspect E3D V6 block; torque nozzle to 2.5 N·m at 250°C and execute M303 PID autotune.'
  },
  'PC-01': {
    name: 'Acer Nitro 5 Edge Compute Host Server',
    type: 'Physical Compute & Telemetry Gateway',
    location: 'Control Room Server Rack / Station 1',
    power: '19.5V DC / 180W Adapter & Battery',
    sop_action: 'Disconnect 19.5V DC adapter & isolate internal battery; clean dual blower fan radiator fins; re-apply Honeywell PTM7950 phase-change TIM to CPU/GPU dies.'
  }
};

async function sendAlert(payload) {
  const {
    machine_id = 'CNC-01',
    health_score = 24.0,
    health_status = 'CRITICAL',
    iso_zone = 'Zone D (Danger)',
    diagnosed_fault = 'Spindle Bearing Spall',
    confidence_pct = 95.0,
    rul_hours = 4.2,
    xai_contributors = [],
    telemetry = {},
    pdf_base64 = null,
    pdf_filename = null,
    admin_email = payload.admin_email || process.env.ADMIN_EMAIL || '',
    admin_phone_email = payload.admin_phone_email || process.env.ADMIN_PHONE_EMAIL || ''
  } = payload;

  const smtpConfigured = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
  if (!smtpConfigured && process.env.SMTP_TEST_MODE !== 'true') {
    return {
      status: 'error',
      machine_id,
      message: 'Alert delivery is disabled. Configure SMTP_HOST, SMTP_USER, SMTP_PASS, and ADMIN_EMAIL, or explicitly enable SMTP_TEST_MODE.'
    };
  }
  if (!admin_email) {
    return { status: 'error', machine_id, message: 'ADMIN_EMAIL must be configured before dispatching an alert.' };
  }

  const profile = MACHINE_PROFILES[machine_id] || MACHINE_PROFILES['CNC-01'];
  const isCritical = health_status === 'CRITICAL';
  const alertColor = isCritical ? '#DC2626' : '#D97706';
  const alertBg = isCritical ? '#FEF2F2' : '#FFFBEB';
  const alertBorder = isCritical ? '#F87171' : '#FCD34D';
  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC';

  // Format RUL
  let rulFormatted = '>1,000 Operating Hours (Nominal Baseline)';
  if (rul_hours !== null && rul_hours !== undefined && !isNaN(Number(rul_hours))) {
    rulFormatted = `Approx. ${Math.abs(Number(rul_hours)).toFixed(1)} Operating Hours`;
  }

  // Sort and extract XAI contributors
  const xaiSorted = xai_contributors && xai_contributors.length > 0
    ? [...xai_contributors].sort((a, b) => (b.weight || 0) - (a.weight || 0))
    : [
        { sensor: 'Vibration RMS', weight: 0.524 },
        { sensor: 'Temperature', weight: 0.316 },
        { sensor: 'Motor Current', weight: 0.160 }
      ];

  // Build XAI Visual Rows
  const xaiRowsHtml = xaiSorted.map((c, idx) => {
    const pct = Math.round((c.weight || 0) * 100);
    const isPrimary = idx === 0;
    const barColor = isPrimary ? '#DC2626' : '#2563EB';
    const tag = isPrimary ? '<span style="color:#DC2626;font-size:11px;font-weight:bold;margin-left:6px;">[PRIMARY DRIVER]</span>' : '';
    return `
      <tr>
        <td style="padding: 6px 0; font-size: 13px; color: #1E293B; width: 45%;">
          <strong>${c.sensor}</strong>${tag}
        </td>
        <td style="padding: 6px 0; width: 40%;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #E2E8F0; border-radius: 4px; overflow: hidden; height: 10px;">
            <tr>
              <td style="background-color: ${barColor}; width: ${pct}%; height: 10px;"></td>
              <td style="width: ${100 - pct}%;"></td>
            </tr>
          </table>
        </td>
        <td style="padding: 6px 0; font-size: 12px; font-weight: bold; color: #0F172A; text-align: right; width: 15%;">
          ${(c.weight * 100).toFixed(1)}%
        </td>
      </tr>
    `;
  }).join('');

  // Live Telemetry Snapshot Table Rows
  const tempVal = telemetry.temperature_c != null ? `${Number(telemetry.temperature_c).toFixed(1)} °C` : 'N/A';
  const vibVal = telemetry.vibration_rms_mm_s != null ? `${Number(telemetry.vibration_rms_mm_s).toFixed(2)} mm/s` : 'N/A';
  const currVal = telemetry.motor_current_a != null ? `${Number(telemetry.motor_current_a).toFixed(2)} A` : 'N/A';
  const speedVal = telemetry.spindle_rpm != null
    ? (machine_id.startsWith('PC') ? `${Math.round(telemetry.spindle_rpm)} RPM (Fan)` : (machine_id.startsWith('PRN') ? 'Direct Feed' : `${Math.round(telemetry.spindle_rpm)} RPM`))
    : 'N/A';

  // Universal Table-Based HTML Email Template
  const emailHtml = `
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>MachinexAI Emergency Alert</title>
</head>
<body style="margin: 0; padding: 20px 0; background-color: #F1F5F9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <table border="0" cellpadding="0" cellspacing="0" width="100%">
    <tr>
      <td align="center" style="padding: 10px 15px;">
        <table border="0" cellpadding="0" cellspacing="0" width="600" style="background-color: #FFFFFF; border-radius: 8px; overflow: hidden; border: 1px solid #CBD5E1; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">

          <!-- Alert Header Banner -->
          <tr>
            <td style="background-color: ${alertColor}; padding: 18px 24px;">
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td>
                    <span style="font-size: 11px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase; color: #FFFFFF; background-color: rgba(0,0,0,0.25); padding: 3px 8px; border-radius: 3px;">
                      ${health_status} ALERT · ISO 10816-3
                    </span>
                    <h1 style="color: #FFFFFF; font-size: 20px; font-weight: bold; margin: 8px 0 0 0; line-height: 24px;">
                      Predictive Maintenance Failure Notice
                    </h1>
                  </td>
                  <td align="right" valign="middle">
                    <span style="font-size: 32px;">⚠️</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Subheader / Machine Identity -->
          <tr>
            <td style="background-color: #F8FAFC; padding: 14px 24px; border-bottom: 1px solid #E2E8F0;">
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td>
                    <div style="font-size: 15px; font-weight: bold; color: #0F172A;">
                      ${machine_id} &nbsp;|&nbsp; ${profile.name}
                    </div>
                    <div style="font-size: 12px; color: #64748B; margin-top: 3px;">
                      📍 ${profile.location} &nbsp;·&nbsp; ⚡ ${profile.power}
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Content Body -->
          <tr>
            <td style="padding: 24px;">

              <!-- Anomaly Summary Box -->
              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: ${alertBg}; border: 1px solid ${alertBorder}; border-radius: 6px; margin-bottom: 20px;">
                <tr>
                  <td style="padding: 14px 16px;">
                    <div style="font-size: 11px; font-weight: bold; text-transform: uppercase; color: ${alertColor}; letter-spacing: 0.5px;">
                      Automated Diagnostic Finding
                    </div>
                    <div style="font-size: 16px; font-weight: bold; color: #0F172A; margin: 4px 0;">
                      ${diagnosed_fault} <span style="font-size: 13px; font-weight: normal; color: #475569;">(${confidence_pct.toFixed(1)}% AI Confidence)</span>
                    </div>
                    <div style="font-size: 12px; color: #334155; line-height: 16px;">
                      Vibration/thermal metrics have crossed safety boundaries into <strong>${iso_zone}</strong>.
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Key Metrics 2x2 Grid -->
              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 20px;">
                <tr>
                  <td width="48%" style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 6px; padding: 12px 14px;">
                    <div style="font-size: 11px; font-weight: bold; color: #64748B; text-transform: uppercase;">Equipment Health Score</div>
                    <div style="font-size: 22px; font-weight: bold; color: ${alertColor}; margin-top: 4px; font-family: monospace;">
                      ${Number(health_score).toFixed(1)}%
                    </div>
                  </td>
                  <td width="4%"></td>
                  <td width="48%" style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 6px; padding: 12px 14px;">
                    <div style="font-size: 11px; font-weight: bold; color: #64748B; text-transform: uppercase;">Time-to-Failure (RUL)</div>
                    <div style="font-size: 18px; font-weight: bold; color: #0F172A; margin-top: 4px; font-family: monospace;">
                      ${rulFormatted}
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Live Telemetry Snapshot Table -->
              <div style="font-size: 12px; font-weight: bold; color: #1E293B; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">
                Live Telemetry Snapshot at Anomaly Trigger
              </div>
              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="border: 1px solid #CBD5E1; border-radius: 6px; overflow: hidden; margin-bottom: 22px;">
                <tr style="background-color: #1E293B; color: #FFFFFF; font-size: 11px; font-weight: bold;">
                  <td style="padding: 7px 12px;">Temperature</td>
                  <td style="padding: 7px 12px;">Vibration RMS</td>
                  <td style="padding: 7px 12px;">Current / Power</td>
                  <td style="padding: 7px 12px;">Velocity / Fan</td>
                </tr>
                <tr style="background-color: #FFFFFF; font-size: 13px; font-weight: bold; color: #0F172A; font-family: monospace;">
                  <td style="padding: 8px 12px; border-top: 1px solid #E2E8F0; color: #DC2626;">${tempVal}</td>
                  <td style="padding: 8px 12px; border-top: 1px solid #E2E8F0; color: #DC2626;">${vibVal}</td>
                  <td style="padding: 8px 12px; border-top: 1px solid #E2E8F0;">${currVal}</td>
                  <td style="padding: 8px 12px; border-top: 1px solid #E2E8F0;">${speedVal}</td>
                </tr>
              </table>

              <!-- XAI Diagnostic Attribution Table -->
              <div style="font-size: 12px; font-weight: bold; color: #1E293B; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">
                Explainable AI (XAI) Root-Cause Contribution
              </div>
              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 22px;">
                ${xaiRowsHtml}
              </table>

              <!-- Prescribed SOP Action Box -->
              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #EFF6FF; border: 1px solid #BFDBFE; border-radius: 6px; margin-bottom: 20px;">
                <tr>
                  <td style="padding: 14px 16px;">
                    <div style="font-size: 11px; font-weight: bold; text-transform: uppercase; color: #1E40AF; letter-spacing: 0.5px; margin-bottom: 4px;">
                      Prescribed SOP Remediation for ${machine_id}
                    </div>
                    <div style="font-size: 13px; color: #1E293B; line-height: 18px;">
                      ${profile.sop_action}
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Work Order PDF Attachment Callout -->
              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #F8FAFC; border: 1px dashed #94A3B8; border-radius: 6px;">
                <tr>
                  <td style="padding: 12px 16px;">
                    <table border="0" cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        <td width="30" valign="middle">
                          <span style="font-size: 20px;">📎</span>
                        </td>
                        <td>
                          <div style="font-size: 12px; font-weight: bold; color: #0F172A;">
                            Work Order PDF Attached: ${pdf_filename || `WO_${machine_id}.pdf`}
                          </div>
                          <div style="font-size: 11px; color: #64748B;">
                            Official ISO 10816-3 signed compliance document ready for maintenance technician sign-off.
                          </div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #0F172A; padding: 16px 24px; text-align: center;">
              <div style="font-size: 11px; color: #94A3B8; line-height: 16px;">
                MachinexAI Autonomous Supervisory Gateway &nbsp;·&nbsp; University Smart Manufacturing Facility<br/>
                Dispatched at: <strong>${timestamp}</strong> &nbsp;·&nbsp; Recipient: ${admin_email}
              </div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  // Multi-line bayesian-friendly plain text version
  const fullText = `MachinexAI INDUSTRIAL TELEMETRY EMERGENCY ALERT
============================================================
Target Machine: ${machine_id} (${profile.name})
Facility Location: ${profile.location}
Power Specification: ${profile.power}
Timestamp: ${timestamp}

HEALTH STATUS: ${health_status} (Score: ${Number(health_score).toFixed(1)}%)
ISO 10816-3 ZONE: ${iso_zone}
DIAGNOSED FAILURE: ${diagnosed_fault} (${confidence_pct.toFixed(1)}% Confidence)
ESTIMATED TIME-TO-FAILURE: ${rulFormatted}

LIVE TELEMETRY SNAPSHOT:
- Temperature: ${tempVal}
- Vibration RMS: ${vibVal}
- Current / Power: ${currVal}
- Velocity / Fan: ${speedVal}

XAI ROOT-CAUSE RISK WEIGHTS:
${xaiSorted.map((c, i) => `  ${i+1}. ${c.sensor}: ${(c.weight * 100).toFixed(1)}% risk contribution${i === 0 ? ' [PRIMARY DRIVER]' : ''}`).join('\n')}

PRESCRIBED SOP ACTION FOR ${machine_id}:
${profile.sop_action}

ATTACHMENT:
${pdf_filename || `WO_${machine_id}.pdf`} (ISO 10816-3 Compliance Work-Order)

MachinexAI Autonomous Supervisory Gateway
Smart Manufacturing Laboratory
`;

  // Concise SMS text for carrier gateways
  const smsText = `[MachinexAI] ALERT: Machine ${machine_id} (${profile.name.split(' ')[0]}) reached ${health_status} (Health ${Number(health_score).toFixed(0)}%). Fault: ${diagnosed_fault} (${confidence_pct.toFixed(0)}%). RUL: ${rulFormatted}. WO attached.`;

  // Transporter setup
  let transporter;
  let isEthereal = false;

  if (smtpConfigured) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
  } else {
    const testAccount = await nodemailer.createTestAccount();
    transporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass
      }
    });
    isEthereal = true;
  }

  const senderAddress = process.env.SMTP_USER
    ? `"MachinexAI Supervisory Gateway" <${process.env.SMTP_USER}>`
    : '"MachinexAI Gateway" <alerts@smartlab.internal>';

  const cleanSubject = `[MachinexAI Alert] Machine ${machine_id} Maintenance Notice: ${diagnosed_fault} (${health_status})`;

  // Assemble mail attachments
  const attachments = [];
  if (pdf_base64) {
    attachments.push({
      filename: pdf_filename || `WO_${machine_id}.pdf`,
      content: Buffer.from(pdf_base64, 'base64'),
      contentType: 'application/pdf'
    });
  }

  // Send main email
  const emailInfo = await transporter.sendMail({
    from: senderAddress,
    to: admin_email,
    replyTo: process.env.SMTP_USER || admin_email,
    subject: cleanSubject,
    text: fullText,
    html: emailHtml,
    attachments,
    headers: {
      'X-Priority': '1 (Highest)',
      'X-MSMail-Priority': 'High',
      'Importance': 'High',
      'X-Mailer': 'MachinexAI Industrial Sentinel 2.0',
      'X-Auto-Response-Suppress': 'OOF, AutoReply'
    }
  });

  // Save last rendered HTML locally for inspection
  try {
    fs.writeFileSync('/tmp/last_alert_email.html', emailHtml);
  } catch {}

  // Send SMS via phone email gateway if configured
  let smsInfo = null;
  let smsStatus = 'not_configured';
  if (admin_phone_email) {
    try {
      smsInfo = await transporter.sendMail({
        from: senderAddress,
        to: admin_phone_email,
        subject: `ALERT ${machine_id}`,
        text: smsText
      });
      smsStatus = 'sent';
    } catch (error) {
      smsStatus = 'failed';
      console.error(`[SMS gateway error] ${error.message}`);
    }
  }

  const previewUrl = isEthereal ? nodemailer.getTestMessageUrl(emailInfo) : null;

  return {
    status: 'success',
    timestamp,
    machine_id,
    dispatched_to: {
      admin_email,
      admin_phone_email
    },
    message_ids: {
      email: emailInfo.messageId,
      sms: smsInfo?.messageId || null
    },
    channels: { email: 'sent', sms: smsStatus },
    has_pdf_attachment: attachments.length > 0,
    preview_url: previewUrl,
    is_test_account: isEthereal
  };
}

// Support CLI execution or JSON pipe
if (require.main === module) {
  let input = '';
  process.stdin.setEncoding('utf8');

  process.stdin.on('data', chunk => {
    input += chunk;
  });

  process.stdin.on('end', async () => {
    try {
      const payload = input.trim() ? JSON.parse(input) : {};
      const result = await sendAlert(payload);
      console.log(JSON.stringify(result, null, 2));
      process.exit(0);
    } catch (err) {
      console.error(JSON.stringify({ status: 'error', error: err.message }));
      process.exit(1);
    }
  });

  // Only use timeout fallback for direct interactive (TTY) invocation.
  // When piped from Python (server.py), stdin is NOT a TTY — always wait for 'end'.
  if (process.stdin.isTTY) {
    sendAlert({}).then(res => {
      console.log(JSON.stringify(res, null, 2));
      process.exit(0);
    }).catch(err => {
      console.error(err);
      process.exit(1);
    });
  }
}

module.exports = { sendAlert };
