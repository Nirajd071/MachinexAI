"""
IPM-MFDS Automated Maintenance Work-Order PDF Generator
Generates publication-quality, ISO-10816 stamped maintenance tickets
using ReportLab with complete equipment-specific adaptations.
"""

import os
import io
import time
from datetime import datetime, timezone
from typing import Dict, Any, Optional

from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.units import inch
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable, Image
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

# Equipment Specifications & Power Profiles
MACHINE_PROFILES = {
    'CNC-01': {
        'name': 'Haas VF-2 Vertical Machining Center',
        'type': 'CNC Milling Center (3-Axis)',
        'location': 'Smart Manufacturing Lab - Bay A1',
        'power_spec': '440V 3-Phase AC (30A LOTO Required)',
        'rpm_channel': 'Spindle Speed',
        'current_channel': 'Spindle Motor Current',
        'temp_channel': 'Spindle Bearing Temp',
        'rpm_nominal': '4,950 RPM',
        'current_nominal': '5.20 A',
        'temp_nominal': '55.0 °C',
        'vib_nominal': '2.10 mm/s',
        'crest_nominal': '2.50',
        'rpm_threshold': 'Drop (>300 RPM)',
        'current_threshold': 'Overload (>6.50 A)',
        'temp_threshold': 'Overheat (>65.0 °C)',
        'vib_threshold': 'ISO Zone D (>4.50 mm/s)',
        'crest_threshold': 'Alarm (>4.00)',
    },
    'CNC-02': {
        'name': 'DMG MORI CMX 1100V Machining Center',
        'type': 'Heavy Production CNC Mill',
        'location': 'Smart Manufacturing Lab - Bay A2',
        'power_spec': '440V 3-Phase AC (45A LOTO Required)',
        'rpm_channel': 'Spindle Speed',
        'current_channel': 'Drive Motor Current',
        'temp_channel': 'Gearbox & Spindle Temp',
        'rpm_nominal': '3,400 RPM',
        'current_nominal': '5.20 A',
        'temp_nominal': '56.0 °C',
        'vib_nominal': '2.20 mm/s',
        'crest_nominal': '2.60',
        'rpm_threshold': 'Drop (>250 RPM)',
        'current_threshold': 'Overload (>6.80 A)',
        'temp_threshold': 'Overheat (>65.0 °C)',
        'vib_threshold': 'ISO Zone D (>4.50 mm/s)',
        'crest_threshold': 'Alarm (>4.00)',
    },
    'PRN-01': {
        'name': 'Creality Ender-3 Pro Precision 3D Printer',
        'type': 'Fused Deposition Modeling (FDM)',
        'location': 'Additive Manufacturing Studio - Bench 3',
        'power_spec': '24V DC / 350W Mean Well PSU',
        'rpm_channel': 'Extruder Feed / Stepper',
        'current_channel': 'Heater & Stepper Current',
        'temp_channel': 'Hotend / Heatbed Temp',
        'rpm_nominal': 'N/A (Direct Extrusion)',
        'current_nominal': '2.40 A',
        'temp_nominal': '48.0 °C (Idle) / 205 °C',
        'vib_nominal': '1.30 mm/s',
        'crest_nominal': '2.30',
        'rpm_threshold': 'Layer Skip (>15 mm/s²)',
        'current_threshold': 'Runaway Draw (>3.60 A)',
        'temp_threshold': 'Runaway (>60 °C Idle / >235 °C)',
        'vib_threshold': 'Frame Resonance (>2.80 mm/s)',
        'crest_threshold': 'Mechanical Slap (>3.80)',
    },
    'PC-01': {
        'name': 'Acer Nitro 5 Edge Compute Host Server',
        'type': 'Physical Compute & Telemetry Gateway',
        'location': 'Control Room Server Rack / Station 1',
        'power_spec': '19.5V DC / 180W Adapter & Battery',
        'rpm_channel': 'Cooling Blower Fan Speed',
        'current_channel': 'Host Power / DC Draw',
        'temp_channel': 'CPU Package / Die Temp',
        'rpm_nominal': '2,200 RPM',
        'current_nominal': '3.50 A',
        'temp_nominal': '50.0 °C',
        'vib_nominal': '1.20 mm/s',
        'crest_nominal': '2.20',
        'rpm_threshold': 'Fan Fail (<1200 or >4500 RPM)',
        'current_threshold': 'TDP Surge (>7.50 A)',
        'temp_threshold': 'PROCHOT Throttling (>84.0 °C)',
        'vib_threshold': 'Blower Imbalance (>4.50 mm/s)',
        'crest_threshold': 'Blower Bearing Wear (>3.80)',
    }
}

# Machine-Specific Spare Parts Library
SPARE_PARTS = {
    'PC-01': {
        'thermal': ('Phase-Change Thermal Interface Material (PTM7950) & Dual High-CFM Blower Fan Module', 'SKU: PC-COOL-PTM7950-DUAL'),
        'fan': ('Replacement Fluid Dynamic Bearing (FDB) 5V CPU/GPU Blower Fan', 'SKU: PC-FAN-FDB-5V'),
        'default': ('Host PC Heatsink Overhaul Kit & Dust Exchanger Pack', 'SKU: PC-SVC-AIR-01')
    },
    'PRN-01': {
        'thermal': ('E3D V6 All-Metal Hotend Assembly + 24V 40W Heater Cartridge & NTC Thermistor', 'SKU: PRN-HOTEND-E3DV6-24V'),
        'belt': ('Gates 2GT High-Precision Fiberglass-Reinforced Synchronous Timing Belt Kit', 'SKU: PRN-BELT-2GT-KIT'),
        'bearing': ('Bondtech BMG Dual-Drive Extruder Assembly & Anti-Backlash Lead Screw Nut', 'SKU: PRN-EXTR-BMG-17'),
        'default': ('Creality 24V Motion Subsystem & Toolhead Maintenance Pack', 'SKU: PRN-MNT-KIT-01')
    },
    'CNC-01': {
        'bearing': ('SKF 6205-2RSH Deep Groove High-Precision Ceramic Spindle Bearing', 'SKU: BRG-SKF-6205-2RSH'),
        'thermal': ('High-Flow 440V Flood Coolant Pump & Thermostatic Valve Assembly', 'SKU: CLN-PUMP-440V-HD'),
        'belt': ('Optibelt Red Power 3 Heavy-Duty Cogged Spindle Drive Belt', 'SKU: BLT-OPT-RP3-1250'),
        'drift': ('Mobil Vactra #2 Way Lube & Precision Brass Axis Alignment Shims', 'SKU: LUB-VACTRA-SHIM-01'),
        'default': ('Haas VF-2 Spindle & Guideway Preventive Maintenance Pack', 'SKU: CNC-SVC-VF2-01')
    },
    'CNC-02': {
        'bearing': ('SKF NN 3016 K Super-Precision Double Row Cylindrical Roller Bearing', 'SKU: BRG-SKF-NN3016K'),
        'thermal': ('Spindle Chiller Unit 440V Closed-Loop Oil Heat Exchanger', 'SKU: CHL-DMG-440V-XCH'),
        'belt': ('Gates Poly Chain GT Carbon High-Torque Synchronous Timing Belt', 'SKU: BLT-GATES-CARBON-8M'),
        'drift': ('Linear Guideway Wiper Seals & Ball Screw Precision Preload Kit', 'SKU: GDE-DMG-SEAL-KIT'),
        'default': ('DMG MORI Heavy Machining Center Service Overhaul Kit', 'SKU: CNC-SVC-DMG-02')
    }
}

# Machine-Specific SOP Step Checklists
SOPS = {
    'PC-01': {
        'thermal': [
            "<b>Step 1 · Power Isolation:</b> Disconnect 19.5V DC AC power adapter and isolate internal lithium-ion battery. Discharge residual motherboard capacitors (hold power button for 10s).",
            "<b>Step 2 · Thermal & Heatsink Inspection:</b> Remove bottom chassis enclosure. Inspect copper heatpipes and vapor chamber for micro-fractures, delamination, or mounting bracket play.",
            "<b>Step 3 · Heatsink Cleaning & TIM Re-Application:</b> Clear radiator exhaust fins of dust blockages with compressed air. Clean CPU/GPU silicon dies with 99% IPA; apply Honeywell PTM7950 phase-change material.",
            "<b>Step 4 · Post-Assembly Stress Verification:</b> Reassemble chassis and torque screws to 0.4 N·m. Boot compute gateway and execute a 5-minute sustained compute workload; verify CPU package temp stays below 74°C.",
            "<b>Step 5 · Digital Sign-Off:</b> Clear active thermal fault via MachinexAI cockpit; record thermal overhaul in SQLite audit database before returning host to production."
        ],
        'default': [
            "<b>Step 1 · Power Isolation:</b> Disconnect 19.5V DC power adapter and verify zero system power.",
            "<b>Step 2 · Chassis Servicing:</b> Remove bottom enclosure and clean dual blower fan assemblies with antistatic brush.",
            "<b>Step 3 · Component Replacement:</b> Replace noisy/imbalanced FDB cooling fan; torque housing fasteners.",
            "<b>Step 4 · Post-Assembly Verification:</b> Boot host server; run fan speed diagnostic across 1000-4500 RPM range.",
            "<b>Step 5 · Digital Sign-Off:</b> Log service completion into MachinexAI audit ledger; verify telemetry streaming."
        ]
    },
    'PRN-01': {
        'thermal': [
            "<b>Step 1 · Electrical & Burn Safety:</b> Switch off 24V Mean Well PSU. Wait 15 minutes for nozzle (200°C) and heated bed (60°C) to cool below 35°C before mechanical handling.",
            "<b>Step 2 · Hotend & Thermistor Inspection:</b> Remove silicone sock. Inspect heater block and cartridge wiring for insulation breakdown, loose thermistor grub screws, or filament leakage.",
            "<b>Step 3 · Component Replacement:</b> Install replacement E3D V6 all-metal hotend. Heat block to 250°C and torque nozzle to exactly 2.5 N·m to eliminate hotend throat gap.",
            "<b>Step 4 · Post-Assembly Verification:</b> Run M303 PID autotune at 210°C (8 cycles). Verify nozzle reaches steady state within ±0.5°C without triggering thermal runaway protection.",
            "<b>Step 5 · Digital Sign-Off:</b> Execute 20mm test cube print; record service completion in MachinexAI maintenance log."
        ],
        'default': [
            "<b>Step 1 · Power Isolation:</b> Disconnect 24V DC power connector from printer base.",
            "<b>Step 2 · Motion Subsystem Check:</b> Check X/Y axis Gates 2GT belt tension (target: 6-8 lbf / 75-80 Hz). Inspect POM V-slot wheels for flat spots and Z-axis lead screw for binding.",
            "<b>Step 3 · Component Replacement:</b> Replace worn timing belt or dual-drive extruder gears. Lubricate Z-axis lead screw with PTFE dry lube.",
            "<b>Step 4 · Post-Assembly Verification:</b> Execute automated bed leveling grid and 100mm extrusion feed test.",
            "<b>Step 5 · Digital Sign-Off:</b> Clear fault flag in MachinexAI cockpit; record technician sign-off."
        ]
    },
    'CNC-01': {
        'bearing': [
            "<b>Step 1 · NFPA 70E Lockout/Tagout:</b> Disconnect main 440V 3-phase AC spindle motor supply at breaker Q1. Apply padlock & lockout tag. Verify zero energy state on all 3 phases with multimeter.",
            "<b>Step 2 · Vibration & Runout Check:</b> Mount dial indicator on spindle nose; measure radial runout (tolerance < 0.005 mm). Tap-test spindle housing to identify bearing raceway resonance.",
            "<b>Step 3 · Bearing Replacement:</b> Remove spindle cartridge using mechanical slide hammer. Extract worn front/rear bearings; seat new matched SKF 6205-2RSH bearings using 110°C induction heater.",
            "<b>Step 4 · Post-Assembly Verification:</b> Reinstall cartridge. Execute 15-minute spindle ramp-test from 1,000 to 5,000 RPM in 1,000 RPM steps; verify vibration RMS remains below 2.8 mm/s (ISO 10816 Zone A/B).",
            "<b>Step 5 · Digital Sign-Off:</b> Clear emergency fault in MachinexAI cockpit; file technician service record in SQLite ledger."
        ],
        'thermal': [
            "<b>Step 1 · Safety Lockout/Tagout:</b> Disconnect main 440V spindle motor supply. Verify zero electrical and hydraulic pressure state.",
            "<b>Step 2 · Coolant Circuit Diagnostic:</b> Inspect flood coolant manifold, filtration mesh, and thermostatic valve for chip clogs or pump impeller cavitation.",
            "<b>Step 3 · Component Replacement:</b> Flush coolant reservoir. Install replacement 440V high-flow coolant pump and calibrated thermostatic switch.",
            "<b>Step 4 · Post-Assembly Verification:</b> Run coolant flow test at 25 L/min. Run spindle at 4,000 RPM for 10 minutes; ensure spindle housing stabilizes below 50°C.",
            "<b>Step 5 · Digital Sign-Off:</b> Sign off work order in MachinexAI cockpit; archive maintenance report."
        ],
        'belt': [
            "<b>Step 1 · Safety Lockout/Tagout:</b> Disconnect main 440V spindle motor supply. Verify zero mechanical motion.",
            "<b>Step 2 · Belt & Pulley Inspection:</b> Remove drive head casing. Inspect Optibelt cogged drive belt for tooth shear, glazing, and pulley groove wear.",
            "<b>Step 3 · Component Replacement:</b> Loosen motor mount plate; install replacement Optibelt Red Power 3 belt. Tension with acoustic belt meter to 450 N.",
            "<b>Step 4 · Post-Assembly Verification:</b> Perform 5-minute spin test across 500-4,500 RPM; verify RPM volatility < 0.02 without slip.",
            "<b>Step 5 · Digital Sign-Off:</b> File technician sign-off in MachinexAI cockpit."
        ],
        'default': [
            "<b>Step 1 · Safety Lockout/Tagout:</b> Disconnect main 440V electrical feed; lock and tag disconnect switch.",
            "<b>Step 2 · Mechanical Inspection:</b> Check axis gibs, ballscrews, and spindle drive for backlash and wear.",
            "<b>Step 3 · Maintenance Execution:</b> Perform lubrication, alignment adjustments, and bolt torque checks.",
            "<b>Step 4 · Post-Assembly Verification:</b> Execute dry-run test cycle; verify baseline sensor readings.",
            "<b>Step 5 · Digital Sign-Off:</b> Record work order completion in MachinexAI system."
        ]
    },
    'CNC-02': {
        'bearing': [
            "<b>Step 1 · Heavy CNC Lockout/Tagout:</b> Disconnect main 440V 45A supply at primary lab distribution panel. Apply OSHA LOTO padlock. Discharge high-capacity DC bus capacitor bank (verify < 10V DC).",
            "<b>Step 2 · Spindle Diagnostic:</b> Inspect DMG MORI heavy spindle cartridge. Measure axial backlash and radial play using high-precision digital micrometer.",
            "<b>Step 3 · Heavy Bearing Replacement:</b> Extract heavy spindle shaft using hydraulic puller. Heat replacement SKF NN 3016 K double-row cylindrical roller bearing to 110°C; seat against precision shoulder.",
            "<b>Step 4 · Post-Assembly Verification:</b> Execute staged run-in cycle: 800 RPM (5 min), 1,800 RPM (5 min), 3,400 RPM (10 min). Verify vibration RMS stays in ISO Zone A (< 1.8 mm/s).",
            "<b>Step 5 · Digital Sign-Off:</b> Clear maintenance alarm in MachinexAI cockpit; certify heavy machining center for lab operations."
        ],
        'thermal': [
            "<b>Step 1 · Safety Lockout/Tagout:</b> Disconnect 440V 45A power supply. Isolate pressurized oil-chiller lines.",
            "<b>Step 2 · Chiller Inspection:</b> Inspect oil-circulation heat exchanger, filter elements, and refrigerant charge level.",
            "<b>Step 3 · Component Replacement:</b> Replace oil circulation pump and service heat exchanger fins.",
            "<b>Step 4 · Post-Assembly Verification:</b> Run chiller cycle and verify spindle thermal stabilization at 3,400 RPM under load.",
            "<b>Step 5 · Digital Sign-Off:</b> Record maintenance in MachinexAI database."
        ],
        'belt': [
            "<b>Step 1 · Safety Lockout/Tagout:</b> Disconnect 440V power. Secure spindle drive lock.",
            "<b>Step 2 · Belt Inspection:</b> Inspect Gates carbon synchronous belt for chord tension loss and tooth wear.",
            "<b>Step 3 · Component Replacement:</b> Replace with Gates Poly Chain GT Carbon belt; set tension to manufacturer spec (600 N).",
            "<b>Step 4 · Post-Assembly Verification:</b> Execute test machining sequence; check for synchronous transmission.",
            "<b>Step 5 · Digital Sign-Off:</b> Record technician sign-off in MachinexAI audit ledger."
        ],
        'default': [
            "<b>Step 1 · Safety Lockout/Tagout:</b> Isolate 440V 45A electrical supply and verify zero energy state.",
            "<b>Step 2 · Machine Inspection:</b> Inspect heavy guideways, linear scales, and spindle lubrication system.",
            "<b>Step 3 · Maintenance Execution:</b> Perform OEM recommended servicing and torque recalibration.",
            "<b>Step 4 · Post-Assembly Verification:</b> Run verification program and monitor telemetry channels.",
            "<b>Step 5 · Digital Sign-Off:</b> File digital sign-off in MachinexAI system."
        ]
    }
}

SENSOR_MAP = {
    'Spindle RPM': ('spindle_rpm', ' RPM', 'rpm_channel', 'rpm_nominal', 'rpm_threshold'),
    'Cooling Fan RPM': ('spindle_rpm', ' RPM', 'rpm_channel', 'rpm_nominal', 'rpm_threshold'),
    'Motor Current': ('motor_current_a', ' A', 'current_channel', 'current_nominal', 'current_threshold'),
    'Host Power / Current': ('motor_current_a', ' A', 'current_channel', 'current_nominal', 'current_threshold'),
    'Temperature': ('temperature_c', ' °C', 'temp_channel', 'temp_nominal', 'temp_threshold'),
    'Vibration RMS': ('vibration_rms_mm_s', ' mm/s', 'Vibration Velocity RMS', 'vib_nominal', 'vib_threshold'),
    'Vibration Crest Factor': ('vibration_crest_factor', '', 'Vibration Crest Factor', 'crest_nominal', 'crest_threshold'),
    'Temperature Rate': ('temp_rate_c_per_min', ' °C/min', 'Thermal Rise Rate', '0.02 °C/min', 'Warning (>1.50 °C/min)'),
    'RPM Volatility': ('rpm_volatility', '', 'Speed Volatility Index', '0.020', 'Warning (>0.060)'),
    'Workload Ratio': ('workload_pct', '%', 'Operating Workload', '35.0%', 'Warning (>85.0%)'),
}

def generate_work_order_pdf(machine_id: str, tick_data: Optional[Dict[str, Any]] = None) -> bytes:
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=40,
        leftMargin=40,
        topMargin=40,
        bottomMargin=40
    )

    styles = getSampleStyleSheet()

    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=17,
        leading=21,
        textColor=colors.HexColor('#0F172A'),
        spaceAfter=3
    )

    subtitle_style = ParagraphStyle(
        'DocSubtitle',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9.5,
        leading=13,
        textColor=colors.HexColor('#64748B'),
        spaceAfter=12
    )

    section_heading = ParagraphStyle(
        'SectionHeading',
        parent=styles['Heading2'],
        fontName='Helvetica-Bold',
        fontSize=10.5,
        leading=14,
        textColor=colors.HexColor('#1E293B'),
        spaceBefore=12,
        spaceAfter=6
    )

    body_style = ParagraphStyle(
        'Body',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8.5,
        leading=12,
        textColor=colors.HexColor('#334155')
    )

    bold_body = ParagraphStyle(
        'BoldBody',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8.5,
        leading=12,
        textColor=colors.HexColor('#0F172A')
    )

    elements = []

    # 1. Header with MachinexAI Emblem Logo
    logo_path = "/home/niraj/Desktop/Hackathon/MachinexAI Predictive Maintenance Emblem.png"
    header_text_elements = [
        Paragraph("MachinexAI · AUTOMATED WORK ORDER", title_style),
        Paragraph(
            "Intelligent Predictive Maintenance & Machine Failure Detection System",
            subtitle_style
        )
    ]
    if os.path.exists(logo_path):
        logo_img = Image(logo_path, width=44, height=44)
        header_table = Table([[logo_img, header_text_elements]], colWidths=[52, 480])
        header_table.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('LEFTPADDING', (0, 0), (-1, -1), 0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 0),
            ('TOPPADDING', (0, 0), (-1, -1), 0),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ]))
        elements.append(header_table)
    else:
        elements.extend(header_text_elements)

    elements.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor('#2563EB'), spaceAfter=12))

    # Resolve Machine Profile
    profile = MACHINE_PROFILES.get(machine_id, MACHINE_PROFILES['CNC-01'])
    now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

    health = tick_data.get("health", {}) if tick_data else {}
    diag = tick_data.get("diagnostics", {}) if tick_data else {}
    tel = tick_data.get("telemetry", {}) if tick_data else {}
    prog = tick_data.get("prognostics", {}) if tick_data else {}

    status = health.get("status", "CRITICAL")
    score = health.get("score", 24.2)
    if score is None:
        score = 100.0
    else:
        try:
            score = float(score)
        except (ValueError, TypeError):
            score = 100.0

    iso_zone = health.get("iso_zone", "Zone D (Danger)")
    probable_fault = diag.get("probable_fault", "Nominal Operation")
    confidence = diag.get("confidence_pct", 95.0)
    if confidence is None:
        confidence = 95.0
    else:
        try:
            confidence = float(confidence)
        except (ValueError, TypeError):
            confidence = 95.0

    rul = prog.get("rul_hours")
    if rul is not None:
        try:
            rul_str = f"Approx. {abs(float(rul)):.1f} Operating Hours"
        except (ValueError, TypeError):
            rul_str = f"{rul} Hours"
    else:
        rul_str = ">1,000 Hours (Nominal Baseline)"

    xai_contributors = diag.get("xai_contributors", [])

    # Status Colors
    status_bg = colors.HexColor('#FEE2E2') if status == 'CRITICAL' else colors.HexColor('#FEF3C7')
    status_fg = colors.HexColor('#991B1B') if status == 'CRITICAL' else colors.HexColor('#92400E')

    # 2. Metadata Grid Table
    meta_data = [
        [
            Paragraph("<b>Target Equipment:</b>", body_style),
            Paragraph(f"<b>{machine_id}</b> — {profile['name']}", bold_body),
            Paragraph("<b>Generated Timestamp:</b>", body_style),
            Paragraph(now_str, body_style)
        ],
        [
            Paragraph("<b>Facility Location:</b>", body_style),
            Paragraph(profile['location'], body_style),
            Paragraph("<b>Equipment Type:</b>", body_style),
            Paragraph(profile['type'], body_style)
        ],
        [
            Paragraph("<b>Health Condition:</b>", body_style),
            Paragraph(f"<b>{status} ({score:.1f}%)</b>", ParagraphStyle('St', fontName='Helvetica-Bold', fontSize=8.5, textColor=status_fg)),
            Paragraph("<b>Regulatory Standard:</b>", body_style),
            Paragraph(f"<b>ISO 10816-3: {iso_zone}</b>", ParagraphStyle('Iso', fontName='Helvetica-Bold', fontSize=8.5, textColor=colors.HexColor('#DC2626')))
        ],
        [
            Paragraph("<b>Diagnosed Failure:</b>", body_style),
            Paragraph(f"<b>{probable_fault}</b> ({confidence:.1f}% Conf)", bold_body),
            Paragraph("<b>Estimated Time-to-Failure:</b>", body_style),
            Paragraph(f"<b>{rul_str}</b>", bold_body)
        ],
        [
            Paragraph("<b>Power & Safety Spec:</b>", body_style),
            Paragraph(f"<b>{profile['power_spec']}</b>", ParagraphStyle('Pw', fontName='Helvetica-Bold', fontSize=8.5, textColor=colors.HexColor('#B91C1C'))),
            Paragraph("<b>Work Order ID:</b>", body_style),
            Paragraph(f"WO-{machine_id}-{int(time.time()) % 100000:05d}", bold_body)
        ]
    ]

    meta_table = Table(meta_data, colWidths=[1.5*inch, 2.3*inch, 1.6*inch, 2.2*inch])
    meta_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#F8FAFC')),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor('#CBD5E1')),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor('#E2E8F0')),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
    ]))
    elements.append(meta_table)
    elements.append(Spacer(1, 10))

    # 3. Diagnostic Sensor Evidence & XAI Attribution Table
    elements.append(Paragraph("1. DIAGNOSTIC SENSOR EVIDENCE & XAI ATTRIBUTION", section_heading))

    evidence_data = [
        ["Telemetry Channel", "Observed Value", "Nominal Baseline", "Engineering Threshold", "XAI Risk Weight"]
    ]

    is_pc = machine_id.startswith("PC")
    is_prn = machine_id.startswith("PRN")

    if not xai_contributors:
        # Fallback to key telemetry channels if no XAI list
        evidence_data.append([
            profile['temp_channel'],
            f"{tel.get('temperature_c', 0):.1f} °C",
            profile['temp_nominal'],
            profile['temp_threshold'],
            "52.4% [PRIMARY DRIVER]"
        ])
        evidence_data.append([
            "Vibration Velocity RMS",
            f"{tel.get('vibration_rms_mm_s', 0):.2f} mm/s",
            profile['vib_nominal'],
            profile['vib_threshold'],
            "31.6%"
        ])
        evidence_data.append([
            profile['current_channel'],
            f"{tel.get('motor_current_a', 0):.2f} A",
            profile['current_nominal'],
            profile['current_threshold'],
            "16.0%"
        ])
    else:
        xai_sorted = sorted(xai_contributors, key=lambda x: x.get('weight', 0), reverse=True)
        for idx, contrib in enumerate(xai_sorted):
            raw_sensor = contrib.get('sensor', 'Unknown Sensor')

            # Map sensor name domain-specifically
            if is_pc and 'RPM' in raw_sensor:
                display_sensor = profile['rpm_channel']
            elif is_pc and ('Current' in raw_sensor or 'Power' in raw_sensor):
                display_sensor = profile['current_channel']
            elif is_prn and 'RPM' in raw_sensor:
                display_sensor = profile['rpm_channel']
            elif is_prn and 'Current' in raw_sensor:
                display_sensor = profile['current_channel']
            else:
                display_sensor = raw_sensor

            weight = contrib.get('weight', 0)
            weight_pct = f"{weight * 100:.1f}%"
            weight_str = f"{weight_pct} [PRIMARY DRIVER]" if idx == 0 else weight_pct

            # Look up baseline & threshold
            if 'RPM' in raw_sensor or 'Fan' in raw_sensor or 'Extruder' in raw_sensor:
                baseline = profile['rpm_nominal']
                threshold = profile['rpm_threshold']
                obs_val = f"{tel.get('spindle_rpm', 0):.0f} RPM" if not is_prn else "Extrusion Active"
            elif 'Current' in raw_sensor or 'Power' in raw_sensor:
                baseline = profile['current_nominal']
                threshold = profile['current_threshold']
                obs_val = f"{tel.get('motor_current_a', 0):.2f} A"
            elif 'Temp' in raw_sensor or 'Temperature' in raw_sensor:
                if 'Rate' in raw_sensor:
                    baseline = "0.02 °C/min"
                    threshold = "Warning (>1.50 °C/min)"
                    obs_val = f"{tel.get('temp_rate_c_per_min', 0):.2f} °C/min"
                else:
                    baseline = profile['temp_nominal']
                    threshold = profile['temp_threshold']
                    obs_val = f"{tel.get('temperature_c', 0):.1f} °C"
            elif 'Crest' in raw_sensor:
                baseline = profile['crest_nominal']
                threshold = profile['crest_threshold']
                obs_val = f"{tel.get('vibration_crest_factor', 0):.2f}"
            elif 'Vibration' in raw_sensor or 'RMS' in raw_sensor:
                baseline = profile['vib_nominal']
                threshold = profile['vib_threshold']
                obs_val = f"{tel.get('vibration_rms_mm_s', 0):.2f} mm/s"
            elif 'Volatility' in raw_sensor:
                baseline = "0.020"
                threshold = "Warning (>0.060)"
                obs_val = f"{tel.get('rpm_volatility', 0):.3f}"
            else:
                baseline = "Nominal"
                threshold = "Tolerance Limit"
                obs_val = "Observed"

            evidence_data.append([display_sensor, obs_val, baseline, threshold, weight_str])

    ev_table = Table(evidence_data, colWidths=[1.8*inch, 1.4*inch, 1.4*inch, 1.7*inch, 1.3*inch])
    table_style = [
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#1E293B')),
        ('TEXTCOLOR', (0,0), (-1,0), colors.white),
        ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
        ('FONTSIZE', (0,0), (-1,0), 8),
        ('BACKGROUND', (0,1), (-1,-1), colors.HexColor('#FFFFFF')),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#E2E8F0')),
        ('FONTNAME', (0,1), (-1,-1), 'Helvetica'),
        ('FONTSIZE', (0,1), (-1,-1), 8),
        ('TOPPADDING', (0,0), (-1,-1), 4.5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4.5),
    ]
    if len(evidence_data) > 1:
        table_style.append(('TEXTCOLOR', (4,1), (4,1), colors.HexColor('#DC2626')))
        table_style.append(('FONTNAME', (4,1), (4,1), 'Helvetica-Bold'))

    ev_table.setStyle(TableStyle(table_style))
    elements.append(ev_table)
    elements.append(Spacer(1, 12))

    # 4. Prescribed Replacement Parts & Maintenance SOP
    elements.append(Paragraph("2. PRESCRIBED REPAIR & MAINTENANCE SOP CHECKLIST", section_heading))

    # Resolve Spare Part for Machine and Fault
    fault_lower = str(probable_fault).lower()
    machine_parts = SPARE_PARTS.get(machine_id, SPARE_PARTS['CNC-01'])
    if 'thermal' in fault_lower or 'overheat' in fault_lower or 'throttling' in fault_lower or 'runaway' in fault_lower:
        part_name, part_sku = machine_parts.get('thermal', machine_parts['default'])
    elif 'bearing' in fault_lower or 'spall' in fault_lower or 'extruder' in fault_lower or 'jam' in fault_lower or 'stepper' in fault_lower:
        part_name, part_sku = machine_parts.get('bearing', machine_parts['default'])
    elif 'fan' in fault_lower:
        part_name, part_sku = machine_parts.get('fan', machine_parts['default'])
    elif 'belt' in fault_lower or 'slip' in fault_lower or 'slack' in fault_lower or 'axis' in fault_lower:
        part_name, part_sku = machine_parts.get('belt', machine_parts['default'])
    elif 'drift' in fault_lower:
        part_name, part_sku = machine_parts.get('drift', machine_parts['default'])
    else:
        part_name, part_sku = machine_parts['default']

    sop_data = [
        [Paragraph(f"<b>REQUIRED REPLACEMENT COMPONENT:</b> {part_name} &nbsp;·&nbsp; <b>{part_sku}</b>", ParagraphStyle('Sp', fontName='Helvetica-Bold', fontSize=8.5, textColor=colors.HexColor('#1E3A8A')))],
    ]

    # Resolve SOP Steps
    machine_sops = SOPS.get(machine_id, SOPS['CNC-01'])
    chosen_steps = None
    if 'thermal' in fault_lower or 'overheat' in fault_lower or 'throttling' in fault_lower or 'runaway' in fault_lower:
        chosen_steps = machine_sops.get('thermal')
    elif 'bearing' in fault_lower or 'spall' in fault_lower:
        chosen_steps = machine_sops.get('bearing')
    elif 'belt' in fault_lower or 'slip' in fault_lower:
        chosen_steps = machine_sops.get('belt')

    if not chosen_steps:
        chosen_steps = machine_sops.get('default', list(machine_sops.values())[0])

    for step_txt in chosen_steps:
        sop_data.append([Paragraph(step_txt, body_style)])

    sop_table = Table(sop_data, colWidths=[7.6*inch])
    sop_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#EFF6FF')),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor('#93C5FD')),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor('#E2E8F0')),
        ('TOPPADDING', (0,0), (-1,-1), 4.5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4.5),
    ]))
    elements.append(sop_table)
    elements.append(Spacer(1, 14))

    # 5. Sign-off Footer
    sign_data = [
        ["Technician Name: _______________________", "Signature: _______________________", "Date: _________________"],
        ["Lab Manager Approval: ___________________", "Status: [  ] RESOLVED   [  ] PENDING", "Work Order Closed: ____:____"]
    ]
    sign_table = Table(sign_data, colWidths=[2.6*inch, 2.6*inch, 2.4*inch])
    sign_table.setStyle(TableStyle([
        ('FONTNAME', (0,0), (-1,-1), 'Helvetica'),
        ('FONTSIZE', (0,0), (-1,-1), 8),
        ('TEXTCOLOR', (0,0), (-1,-1), colors.HexColor('#64748B')),
        ('TOPPADDING', (0,0), (-1,-1), 6),
    ]))
    elements.append(sign_table)

    doc.build(elements)
    pdf_bytes = buffer.getvalue()
    buffer.close()
    return pdf_bytes

if __name__ == "__main__":
    for m in ['CNC-01', 'CNC-02', 'PRN-01', 'PC-01']:
        pdf = generate_work_order_pdf(m)
        out_file = f"/tmp/sample_work_order_{m}.pdf"
        with open(out_file, "wb") as f:
            f.write(pdf)
        print(f"Generated sample PDF for {m} ({len(pdf)} bytes) at {out_file}")
