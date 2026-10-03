import React, { useEffect, useRef, memo } from 'react';
import * as THREE from 'three';
import type { Tick } from '../types';

interface Props {
  machineId: string;
  tick?: Tick;
  autoRotate?: boolean;
}

const HEX_MAP: Record<string, string> = {
  NOMINAL: '#2E9E4F',
  WARNING: '#E0A100',
  CRITICAL: '#D32F2F',
};

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export const ThreeDigitalTwin = memo(function ThreeDigitalTwin({ machineId, tick, autoRotate = true }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const labelsRef = useRef<(HTMLDivElement | null)[]>([]);

  const tickRef = useRef(tick);
  tickRef.current = tick;
  const machineIdRef = useRef(machineId);
  machineIdRef.current = machineId;
  const autoRotateRef = useRef(autoRotate);
  autoRotateRef.current = autoRotate;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(42, 1, 0.1, 100);

    // Lights
    scene.add(new THREE.HemisphereLight(0xffffff, 0xa4a7a9, 0.95));
    const key = new THREE.DirectionalLight(0xffffff, 0.9);
    key.position.set(6, 10, 8);
    scene.add(key);

    const rim = new THREE.DirectionalLight(0xfff1d6, 0.7);
    rim.position.set(-8, 5, -6);
    scene.add(rim);

    const pl = new THREE.PointLight(0x2e9e4f, 1.6, 14);
    pl.position.set(0, 3, 2);
    scene.add(pl);

    const grid = new THREE.GridHelper(36, 36, 0xb4b6b2, 0xcfd1cd);
    grid.position.y = -0.1;
    scene.add(grid);

    const root = new THREE.Group();
    scene.add(root);

    // Helpers
    const mat = (c: number, o: any = {}) =>
      new THREE.MeshStandardMaterial(Object.assign({ color: c, metalness: 0.15, roughness: 0.5 }, o));
    const box = (p: THREE.Object3D, w: number, h: number, d: number, c: number, x: number, y: number, z: number, o: any = {}) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c, o));
      m.position.set(x, y, z);
      p.add(m);
      return m;
    };
    const cyl = (p: THREE.Object3D, r: number, h: number, c: number, x: number, y: number, z: number, o: any = {}, seg = 32) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), mat(c, o));
      m.position.set(x, y, z);
      p.add(m);
      return m;
    };

    cyl(root, 7, 0.2, 0xd2d3cf, 0, 0, 0, { metalness: 0.15, roughness: 0.3 }, 64);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(6.55, 6.8, 64),
      new THREE.MeshBasicMaterial({ color: 0x2e9e4f, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.11;
    root.add(ring);

    const heatMat = mat(0x909395, { metalness: 0.15, roughness: 0.3 });
    const heatMat2 = mat(0x9a9d9f, { metalness: 0.15, roughness: 0.3 });

    // === CNC ===
    const cnc = new THREE.Group();
    root.add(cnc);
    const cBase = box(cnc, 6, 0.8, 4, 0x8b8e90, 0, 0.5, 0);
    box(cnc, 2.6, 0.6, 1.8, 0xeceeed, 0, 1.2, 0, { metalness: 0.15, roughness: 0.5 });
    box(cnc, 0.55, 4.7, 0.7, 0x696c6f, -2.9, 3.25, 0);
    box(cnc, 0.55, 4.7, 0.7, 0x696c6f, 2.9, 3.25, 0);
    box(cnc, 6.4, 0.6, 0.9, 0x7a7d80, 0, 5.3, 0);
    box(cnc, 6.2, 0.08, 0.05, 0xf59f00, 0, 5.3, 0.48, { emissive: 0xf59f00, emissiveIntensity: 1 });
    box(cnc, 0.06, 4.4, 0.05, 0x1d2024, -2.9, 3.25, 0.38, { emissive: 0x1d2024, emissiveIntensity: 0.9 });
    box(cnc, 0.06, 4.4, 0.05, 0x1d2024, 2.9, 3.25, 0.38, { emissive: 0x1d2024, emissiveIntensity: 0.9 });
    const sp = new THREE.Group();
    cnc.add(sp);
    // Spindle carriage / Z-axis slide block
    box(sp, 1.4, 1.0, 1.2, 0x9a9d9f, 0, 4.55, 0);
    // Reinforced spindle motor mounting collar (bridges block and cylindrical housing seamlessly)
    cyl(sp, 0.58, 0.35, 0x7a7d80, 0, 4.0, 0, { metalness: 0.3, roughness: 0.4 });
    // Cylindrical spindle motor housing (height 2.0, from y=2.9 to y=4.9, fully penetrating into the carriage block)
    const housing = cyl(sp, 0.46, 2.0, 0x909395, 0, 3.9, 0);
    housing.material = heatMat;
    // Spindle main bearing ring
    const bear = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.07, 12, 40), new THREE.MeshBasicMaterial({ color: 0x2e9e4f }));
    bear.rotation.x = Math.PI / 2;
    bear.position.y = 3.3;
    sp.add(bear);
    // Chuck / Toolholder collet (seamless connection from housing y=2.9 down to tool y=2.0)
    cyl(sp, 0.28, 0.6, 0xa4a7a9, 0, 2.6, 0, { metalness: 0.8, roughness: 0.2 });
    cyl(sp, 0.18, 0.4, 0x696c6f, 0, 2.2, 0, { metalness: 0.9, roughness: 0.2 });
    const tool = new THREE.Group();
    tool.position.y = 1.75;
    sp.add(tool);
    box(tool, 0.05, 0.5, 0.28, 0x3a3d40, 0, 0, 0);
    box(tool, 0.28, 0.5, 0.05, 0x3a3d40, 0, 0, 0);

    // === Printer ===
    // === Printer (High-Fidelity Ender-3 Pro Digital Twin) ===
    const prn = new THREE.Group();
    root.add(prn);

    // Aluminum base chassis frame
    const pBase = box(prn, 5.0, 0.35, 4.2, 0x1e2023, 0, 0.25, 0, { metalness: 0.6, roughness: 0.4 });
    // Y-axis 4040 central extrusion track
    box(prn, 0.8, 0.4, 4.4, 0x16181a, 0, 0.45, 0, { metalness: 0.7, roughness: 0.3 });
    // Heated Bed Under-Carriage (frosted aluminum sub-plate)
    box(prn, 3.8, 0.08, 3.4, 0x71767a, 0, 0.68, 0, { metalness: 0.8, roughness: 0.3 });
    // 4x Brass Bed Leveling Knobs / Thumbwheels under corners
    [[-1.6, -1.4], [1.6, -1.4], [-1.6, 1.4], [1.6, 1.4]].forEach(([bx, bz]) => {
      cyl(prn, 0.22, 0.12, 0xd4af37, bx, 0.58, bz, { metalness: 0.85, roughness: 0.25 });
    });
    // Textured BuildTak / PEI Heated Spring-Steel Print Surface (Grid patterned)
    const peiBed = box(prn, 3.6, 0.04, 3.2, 0x22252a, 0, 0.74, 0, { roughness: 0.85, metalness: 0.1 });
    // Subtle bed alignment grid
    const bedGrid = new THREE.GridHelper(3.2, 16, 0x555c63, 0x33383e);
    bedGrid.position.set(0, 0.77, 0);
    prn.add(bedGrid);

    // Dual Vertical V-Slot Gantry Pillars (2040 black anodized aluminum)
    box(prn, 0.4, 4.2, 0.4, 0x16181a, -2.1, 2.7, 0, { metalness: 0.7, roughness: 0.4 });
    box(prn, 0.4, 4.2, 0.4, 0x16181a, 2.1, 2.7, 0, { metalness: 0.7, roughness: 0.4 });
    // Top crossbar bracing
    box(prn, 4.6, 0.35, 0.4, 0x16181a, 0, 4.8, 0, { metalness: 0.7, roughness: 0.4 });

    // Z-Axis Precision Threaded Lead Screw (Polished steel with helical appearance)
    cyl(prn, 0.06, 4.1, 0xd8dde2, -1.75, 2.7, -0.05, { metalness: 0.95, roughness: 0.1 });
    // Z-Stepper Motor (NEMA 17 at bottom of lead screw)
    box(prn, 0.65, 0.65, 0.65, 0x2b2e33, -1.75, 0.68, -0.05, { metalness: 0.5, roughness: 0.4 });

    // Top Filament Spool Mount & Roll (Vibrant Orange PETG Filament Spool)
    const spoolBracket = box(prn, 0.12, 0.9, 0.8, 0x1a1c1e, -1.2, 5.3, 0);
    const spoolRim = cyl(prn, 0.8, 0.45, 0xe2e8f0, -1.2, 5.75, 0, { metalness: 0.3, roughness: 0.4 });
    spoolRim.rotation.z = Math.PI / 2;
    // Filament winding inside spool
    const filamentRoll = cyl(prn, 0.72, 0.4, 0xf97316, -1.2, 5.75, 0, { roughness: 0.5, metalness: 0.1 });
    filamentRoll.rotation.z = Math.PI / 2;

    // Moving X-Axis Gantry Beam (Holds hotend carriage)
    const beam = box(prn, 4.6, 0.38, 0.38, 0x22262a, 0, 2.0, 0, { metalness: 0.7, roughness: 0.3 });
    // Belt tensioner bracket on right gantry
    box(prn, 0.45, 0.4, 0.5, 0x141618, 2.15, 2.0, 0);

    // Realistic Geometric Low-Poly Vase / Spiral Architectural 3D Print
    const vaseGeom = new THREE.CylinderGeometry(0.85, 0.65, 1.0, 8, 1, false);
    vaseGeom.translate(0, 0.5, 0); // origin sits on bed
    const obj = new THREE.Mesh(
      vaseGeom,
      mat(0xf59f00, { roughness: 0.35, metalness: 0.2, emissive: 0x4a2800, emissiveIntensity: 0.3 })
    );
    obj.position.set(0, 0.77, 0); // sits flush on PEI bed surface at y=0.77
    prn.add(obj);

    // Extruder Hotend Carriage Assembly
    const hot = new THREE.Group();
    prn.add(hot);

    // Metal carriage mounting plate + rubber V-wheels
    box(hot, 1.0, 0.9, 0.1, 0x2d3136, 0, 0.7, -0.25, { metalness: 0.8, roughness: 0.3 });
    // NEMA 17 Direct-Drive Extruder Stepper Motor
    box(hot, 0.75, 0.75, 0.75, 0x1f2226, -0.32, 0.85, 0.15, { metalness: 0.6, roughness: 0.4 });
    // Filament guide PTFE Bowden pneumatic fitting
    cyl(hot, 0.08, 0.3, 0xd4af37, 0.18, 1.25, 0.15, { metalness: 0.85, roughness: 0.2 });

    // Extruder Red Anodized Aluminum Heatsink Cooling Fins
    const heatsink = box(hot, 0.55, 0.6, 0.55, 0xd32f2f, 0.18, 0.65, 0.15, { metalness: 0.7, roughness: 0.3 });
    // Part Cooling Fan Shroud (Front radial 4010 blower)
    const fanShroud = box(hot, 0.48, 0.48, 0.25, 0x141618, 0.18, 0.65, 0.52);

    // Aluminum Heater Block (Reacts to nozzle temperature)
    const hotBody = box(hot, 0.42, 0.28, 0.42, 0xb0b3b6, 0.18, 0.25, 0.15, { metalness: 0.8, roughness: 0.3 });
    hotBody.material = heatMat2;

    // Precision MK8 Brass Extruder Nozzle (Tip at y = 0.0 of the hot group!)
    const noz = new THREE.Mesh(
      new THREE.ConeGeometry(0.11, 0.24, 16),
      mat(0xd4af37, { metalness: 0.9, roughness: 0.15 })
    );
    noz.rotation.x = Math.PI; // point downwards
    noz.position.set(0.18, 0.12, 0.15); // cone height 0.24 centered at 0.12 -> tip lands EXACTLY at y = 0.0!
    hot.add(noz);

    // === PC (Pristine Arctic White Showcase Cabinet with Panorama Glass & Spectrum RGB) ===
    const pcg = new THREE.Group();
    root.add(pcg);
    pcg.visible = false;
    // 38-degree showcase angle to highlight white frame, interior chip, and RGB front fans
    pcg.rotation.y = 0.62;

    // Internal diffused warm-white LED light bar (makes the white chassis gleam brilliantly!)
    const caseLight = new THREE.PointLight(0xffffff, 2.2, 8);
    caseLight.position.set(0, 4.15, 0.4);
    pcg.add(caseLight);
    const caseLight2 = new THREE.PointLight(0xf0fdf4, 1.4, 6);
    caseLight2.position.set(0, 1.8, 0.8);
    pcg.add(caseLight2);

    // Arctic White Powder-Coated Metal Material
    const whiteMat = mat(0xffffff, { roughness: 0.25, metalness: 0.1 });

    // Corner pillars (Pristine Arctic White)
    [[-1.3, -1.8], [1.3, -1.8], [-1.3, 1.8], [1.3, 1.8]].forEach(([x, z]) => {
      box(pcg, 0.1, 4.25, 0.1, 0xffffff, x, 2.28, z, { roughness: 0.2, metalness: 0.1 });
    });
    // Top & bottom perimeter frame rails (Arctic White)
    [0.18, 4.38].forEach((y) => {
      box(pcg, 2.68, 0.1, 0.1, 0xffffff, 0, y, -1.8, { roughness: 0.2, metalness: 0.1 });
      box(pcg, 2.68, 0.1, 0.1, 0xffffff, 0, y, 1.8, { roughness: 0.2, metalness: 0.1 });
      box(pcg, 0.1, 0.1, 3.68, 0xffffff, -1.3, y, 0, { roughness: 0.2, metalness: 0.1 });
      box(pcg, 0.1, 0.1, 3.68, 0xffffff, 1.3, y, 0, { roughness: 0.2, metalness: 0.1 });
    });

    // Pure Crystal Transparent Tempered Glass Panels (Fully see-through)
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.12,
      roughness: 0.02,
      metalness: 0.05,
      transmission: 0.98,
      ior: 1.5,
      thickness: 0.08,
      depthWrite: false,
    });
    // Transparent front showcase panel
    const glassFront = new THREE.Mesh(new THREE.BoxGeometry(2.52, 4.1, 0.02), glassMat);
    glassFront.position.set(0, 2.28, 1.8);
    pcg.add(glassFront);

    // Transparent side panel (tempered glass)
    const pcCase = new THREE.Mesh(new THREE.BoxGeometry(0.02, 4.1, 3.55), glassMat);
    pcCase.position.set(1.3, 2.28, 0);
    pcg.add(pcCase);

    // Transparent top exhaust glass / magnetic dust filter frame
    const glassTop = new THREE.Mesh(new THREE.BoxGeometry(2.52, 0.02, 3.55), glassMat);
    glassTop.position.set(0, 4.38, 0);
    pcg.add(glassTop);

    // Rear Chassis Wall (Snow white stamped metal with I/O shield & fan vent)
    box(pcg, 0.06, 4.1, 3.5, 0xffffff, -1.3, 2.28, 0, { roughness: 0.3, metalness: 0.15 });

    // Motherboard Backplate Tray (Clean Glacier White interior)
    const mobo = box(pcg, 2.22, 3.2, 0.06, 0xf8fafc, 0, 2.5, -1.2, { roughness: 0.3, metalness: 0.1 });
    // Motherboard printed circuit traces (silver / chrome)
    box(pcg, 2.0, 0.02, 0.07, 0xe2e8f0, 0, 1.85, -1.18, { metalness: 0.8, roughness: 0.2 });
    box(pcg, 2.0, 0.02, 0.07, 0xe2e8f0, 0, 3.15, -1.18, { metalness: 0.8, roughness: 0.2 });

    // Motherboard VRM Aluminum Heatsinks (Glacier White CNC machined cooling fins)
    // Top VRM heatsink
    box(pcg, 1.35, 0.35, 0.22, 0xffffff, 0, 3.72, -1.1, { metalness: 0.3, roughness: 0.25 });
    // Left VRM heatsink & Rear I/O Cover Armor
    box(pcg, 0.38, 1.6, 0.24, 0xffffff, -0.85, 2.9, -1.1, { metalness: 0.3, roughness: 0.25 });
    // M.2 NVMe SSD Armor Heatsink with silver chamfer
    box(pcg, 1.25, 0.24, 0.12, 0xf1f5f9, 0, 1.95, -1.13, { metalness: 0.5, roughness: 0.2 });

    // Lower PSU Shroud Chamber (Pristine Snow White, flush with bottom frame)
    box(pcg, 2.52, 0.78, 3.52, 0xffffff, 0, 0.59, 0, { roughness: 0.22, metalness: 0.1 });
    // PSU Shroud side display window revealing white 850W Platinum PSU
    box(pcg, 0.06, 0.42, 1.4, 0x1e293b, 1.25, 0.59, 0.4);
    box(pcg, 0.08, 0.36, 1.3, 0xffffff, 1.25, 0.59, 0.4, { roughness: 0.2 });
    // Gold 80-Plus efficiency badge on PSU
    box(pcg, 0.09, 0.12, 0.28, 0xd4af37, 1.25, 0.59, 0.4, { metalness: 0.95, roughness: 0.15 });
    // Black rubber cable grommet on top of PSU shroud
    box(pcg, 0.6, 0.02, 0.25, 0x0f172a, 0.4, 0.98, -0.1);

    // 24-Pin ATX Main Power Cable (Individually-sleeved white braided cables curving into grommet)
    box(pcg, 0.16, 0.75, 0.28, 0xffffff, 0.98, 2.6, -1.08, { roughness: 0.5 });

    // ==========================================
    // GRAPHICS CARD (White Vision GPU + SafeSlot + Anti-Sag Stand)
    // ==========================================
    // Reinforced SafeSlot PCIe x16 slot on motherboard
    box(pcg, 1.85, 0.08, 0.14, 0x1e293b, 0, 1.62, -1.14);
    // Rear dual-slot PCIe metal mounting bracket screwed into rear chassis
    box(pcg, 0.06, 0.52, 0.85, 0xcfd8dc, -1.26, 1.45, -0.52, { metalness: 0.85, roughness: 0.2 });

    // PCIe GPU (Arctic White triple-fan shroud)
    box(pcg, 2.05, 0.36, 1.15, 0xffffff, 0, 1.45, -0.52, { roughness: 0.25, metalness: 0.15 });
    // Silver aluminum GPU backplate with geometric ventilation
    box(pcg, 2.03, 0.04, 1.12, 0xf1f5f9, 0, 1.64, -0.52, { metalness: 0.6, roughness: 0.25 });

    // White Anti-Sag GPU Support Stand (bridges gap from PSU shroud directly to GPU!)
    cyl(pcg, 0.06, 0.46, 0xffffff, 0.92, 1.22, -0.12, { roughness: 0.2, metalness: 0.3 });
    cyl(pcg, 0.14, 0.05, 0xffffff, 0.92, 1.01, -0.12, { roughness: 0.2, metalness: 0.3 }); // stand base

    // White braided 12VHPWR GPU power cable (bridges from GPU cleanly down to PSU shroud grommet!)
    box(pcg, 0.08, 0.46, 0.15, 0xffffff, 0.35, 1.25, 0.06, { roughness: 0.6 });

    // Dynamic RGB strip on GPU side
    const gpuRgbMat = new THREE.MeshStandardMaterial({
      color: 0xff007f,
      emissive: 0xff007f,
      emissiveIntensity: 1.3
    });
    const gpuRgb = new THREE.Mesh(new THREE.BoxGeometry(1.92, 0.05, 0.05), gpuRgbMat);
    gpuRgb.position.set(0, 1.64, 0.07);
    pcg.add(gpuRgb);

    // RAM Modules (White heat-spreaders with ARGB top diffuser)
    box(pcg, 0.08, 0.85, 0.12, 0xffffff, 0.65, 2.65, -1.05);
    box(pcg, 0.08, 0.85, 0.12, 0xffffff, 0.82, 2.65, -1.05);
    const ramRgbMat = new THREE.MeshStandardMaterial({
      color: 0x00f0ff,
      emissive: 0x00f0ff,
      emissiveIntensity: 1.2
    });
    const ramRgb = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.12, 0.14), ramRgbMat);
    ramRgb.position.set(0.74, 3.12, -1.05);
    pcg.add(ramRgb);

    // ==========================================
    // PROMINENT CENTRAL SILICON CPU CHIP ASSEMBLY
    // (100% Unobstructed, Clear View Into The Silicon Core!)
    // ==========================================
    // LGA-1700 Socket Base & Retention Lever (Nickel-plated steel)
    const socketBase = box(pcg, 1.38, 1.38, 0.08, 0xd1d5db, 0, 2.65, -1.16, { metalness: 0.9, roughness: 0.15 });
    // Socket tension lever
    box(pcg, 0.04, 1.45, 0.05, 0x9ca3af, 0.72, 2.65, -1.14, { metalness: 0.95 });

    // Organic Substrate PCB (High-density matte green)
    const cpuSubstrate = box(pcg, 1.18, 1.18, 0.05, 0x166534, 0, 2.65, -1.11, { roughness: 0.35, metalness: 0.2 });

    // Gold Integrated Heat Spreader (IHS) - Polished gold mirror surface
    const cpuIhs = box(pcg, 0.96, 0.96, 0.05, 0xd4af37, 0, 2.65, -1.06, { metalness: 0.95, roughness: 0.12 });

    // SILICON DIE / CHIP CORE (Visible glowing heart of the CPU!)
    const chipCoreMat = new THREE.MeshStandardMaterial({
      color: 0x00f0ff,
      emissive: 0x00c8ff,
      emissiveIntensity: 1.5,
      roughness: 0.1,
      metalness: 0.5
    });
    const chipCore = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.58, 0.04), chipCoreMat);
    chipCore.position.set(0, 2.65, -1.01);
    pcg.add(chipCore);

    // Microscopic silicon circuit grid etched directly on the chip die
    const chipGrid = new THREE.GridHelper(0.56, 8, 0xffffff, 0x00ffff);
    chipGrid.rotation.x = Math.PI / 2;
    chipGrid.position.set(0, 2.65, -0.98);
    pcg.add(chipGrid);

    // Internal copper cold-plate micro-fins behind chip (reacts dynamically to CPU temp)
    const coldPlate = box(pcg, 1.05, 1.05, 0.04, 0xb87333, 0, 2.65, -1.09, { metalness: 0.85, roughness: 0.3 });
    coldPlate.material = heatMat2;

    // 4x Cooler Socket Corner Standoff Thumb-nuts securing pump to motherboard
    [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]].forEach(([ox, oy]) => {
      cyl(pcg, 0.06, 0.45, 0xcfd8dc, ox, 2.65 + oy, -0.88, { metalness: 0.9, roughness: 0.15 });
    });

    // ==========================================
    // TRANSPARENT AIO PUMP BLOCK & OPEN STATUS HALO RING
    // (Completely hollow / see-through center so chip is 100% visible!)
    // ==========================================
    const aioBlockMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.16,
      roughness: 0.03,
      metalness: 0.05,
      transmission: 0.96,
      ior: 1.45,
      depthWrite: false,
    });
    // Transparent crystal acrylic housing
    const cpuBlock = new THREE.Mesh(new THREE.BoxGeometry(1.24, 1.24, 0.52), aioBlockMat);
    cpuBlock.position.set(0, 2.65, -0.7);
    pcg.add(cpuBlock);

    // OPEN Holographic Status Halo Ring (Torus ring framing the pump with open transparent center!)
    const cpuRingMat = new THREE.MeshStandardMaterial({
      color: 0x2e9e4f,
      emissive: 0x2e9e4f,
      emissiveIntensity: 1.4,
      roughness: 0.15,
      metalness: 0.2
    });
    const cpuRing = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.035, 16, 48), cpuRingMat);
    cpuRing.position.set(0, 2.65, -0.42);
    pcg.add(cpuRing);

    // Transparent LCD front lens with subtle circular HUD tachometer
    const hudRingMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.4,
      side: THREE.DoubleSide
    });
    const hudRing = new THREE.Mesh(new THREE.RingGeometry(0.38, 0.40, 36), hudRingMat);
    hudRing.position.set(0, 2.65, -0.41);
    pcg.add(hudRing);

    // ==========================================
    // TOP 360mm RADIATOR & SEAMLESS COOLANT TUBING
    // (Completely bridges the gap to the top of the case!)
    // ==========================================
    // Arctic White 360mm Radiator Body mounted flush against top ceiling
    box(pcg, 2.3, 0.22, 3.2, 0xffffff, 0, 4.24, -0.2, { roughness: 0.25, metalness: 0.15 });
    // Radiator black micro-cooling fin core
    box(pcg, 2.1, 0.12, 3.0, 0x1e293b, 0, 4.22, -0.2, { roughness: 0.7 });

    // 2x Top 120mm Exhaust Fans under radiator
    [-0.7, 0.3].forEach((fz) => {
      const topFan = cyl(pcg, 0.52, 0.08, 0xffffff, 0, 4.08, fz, { roughness: 0.3, metalness: 0.2 });
      topFan.rotation.x = 0;
    });

    // Top Radiator Knurled G1/4 Compression Fittings (Gunmetal / Chrome)
    cyl(pcg, 0.11, 0.16, 0x334155, -0.26, 4.14, -0.65, { metalness: 0.85, roughness: 0.2 });
    cyl(pcg, 0.11, 0.16, 0x334155, 0.26, 4.14, -0.65, { metalness: 0.85, roughness: 0.2 });

    // CPU Pump 90-Degree Swivel Barbs (Top of pump housing)
    cyl(pcg, 0.1, 0.14, 0x334155, -0.26, 2.98, -0.65, { metalness: 0.85, roughness: 0.2 });
    cyl(pcg, 0.1, 0.14, 0x334155, 0.26, 2.98, -0.65, { metalness: 0.85, roughness: 0.2 });

    // Flexible white braided sleeved coolant tubing (SEAMLESSLY spans from pump into top radiator!)
    const t1 = cyl(pcg, 0.075, 1.14, 0xf8fafc, -0.26, 3.56, -0.65, { roughness: 0.4, metalness: 0.1 });
    const t2 = cyl(pcg, 0.075, 1.14, 0xf8fafc, 0.26, 3.56, -0.65, { roughness: 0.4, metalness: 0.1 });

    // ==========================================
    // FRONT RADIATOR TRAY & COLORFUL VIBRANT RGB INTAKE FANS
    // (Solid Arctic White mounting frame, eliminates floating gap!)
    // ==========================================
    // Arctic White Front Fan Mounting Bracket Tray
    box(pcg, 1.25, 3.65, 0.06, 0xffffff, 0, 2.45, 1.68, { roughness: 0.25, metalness: 0.15 });

    const rgbFanMats: THREE.MeshStandardMaterial[] = [];
    const rgbRingMats: THREE.MeshStandardMaterial[] = [];

    const fans = [0, 1, 2].map((k) => {
      const fanGroup = new THREE.Group();
      fanGroup.position.set(0, 1.35 + k * 1.1, 1.72);
      pcg.add(fanGroup);

      // White outer fan frame chassis
      const fanFrame = cyl(fanGroup, 0.52, 0.08, 0xffffff, 0, 0, 0, { roughness: 0.25, metalness: 0.15 });
      fanFrame.rotation.x = Math.PI / 2;

      // Colorful glowing RGB halo ring
      const ringMat = new THREE.MeshStandardMaterial({
        color: 0x00f0ff,
        emissive: 0x00f0ff,
        emissiveIntensity: 1.5,
        roughness: 0.1
      });
      rgbRingMats.push(ringMat);
      const halo = new THREE.Mesh(new THREE.TorusGeometry(0.47, 0.035, 12, 36), ringMat);
      halo.position.set(0, 0, 0.05);
      fanGroup.add(halo);

      // Rotating translucent RGB fan rotor
      const rotor = new THREE.Group();
      fanGroup.add(rotor);

      const bladeMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0x00f0ff,
        emissiveIntensity: 0.85,
        transparent: true,
        opacity: 0.85,
        roughness: 0.2
      });
      rgbFanMats.push(bladeMat);

      // Translucent fan blades facing the front (in XY plane, rotating around Z)
      const b1 = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.14, 0.02), bladeMat);
      const b2 = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.86, 0.02), bladeMat);
      // Angled diagonal blades for realism
      const b3 = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.14, 0.02), bladeMat);
      b3.rotation.z = Math.PI / 4;
      const b4 = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.86, 0.02), bladeMat);
      b4.rotation.z = Math.PI / 4;
      rotor.add(b1);
      rotor.add(b2);
      rotor.add(b3);
      rotor.add(b4);

      // Central fan hub (Arctic White with chrome center)
      const hub = cyl(rotor, 0.18, 0.05, 0xffffff, 0, 0, 0.02, { metalness: 0.6, roughness: 0.2 });
      hub.rotation.x = Math.PI / 2;

      return rotor;
    });

    // Elevated Arctic White chassis feet with rubber vibration pads
    box(pcg, 0.32, 0.18, 3.4, 0xffffff, -1.0, 0.09, 0, { roughness: 0.3, metalness: 0.2 });
    box(pcg, 0.32, 0.18, 3.4, 0xffffff, 1.0, 0.09, 0, { roughness: 0.3, metalness: 0.2 });
    // Non-slip black rubber foot pads
    box(pcg, 0.28, 0.04, 3.3, 0x1e293b, -1.0, -0.02, 0);
    box(pcg, 0.28, 0.04, 3.3, 0x1e293b, 1.0, -0.02, 0);

    // Sparks
    const NP = 180;
    const pp = new Float32Array(NP * 3).fill(-99);
    const pv = new Float32Array(NP * 3);
    const pla = new Float32Array(NP);
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(pp, 3));
    const pts = new THREE.Points(
      pg,
      new THREE.PointsMaterial({
        color: 0xf97316,
        size: 0.14,
        transparent: true,
        opacity: 0.95,
        blending: THREE.NormalBlending,
        depthWrite: false,
      })
    );
    pts.frustumCulled = false;
    root.add(pts);

    const emit = (x: number, y: number, z: number, n: number) => {
      for (let i = 0; i < NP && n > 0; i++) {
        if (pla[i] <= 0) {
          pla[i] = 0.5 + Math.random() * 0.5;
          pp[i * 3] = x;
          pp[i * 3 + 1] = y;
          pp[i * 3 + 2] = z;
          pv[i * 3] = (Math.random() - 0.5) * 3;
          pv[i * 3 + 1] = Math.random() * 2.5 + 0.5;
          pv[i * 3 + 2] = (Math.random() - 0.5) * 3;
          n--;
        }
      }
    };

    const stepP = (dt: number) => {
      for (let i = 0; i < NP; i++) {
        if (pla[i] > 0) {
          pla[i] -= dt;
          pv[i * 3 + 1] -= 9 * dt;
          pp[i * 3] += pv[i * 3] * dt;
          pp[i * 3 + 1] += pv[i * 3 + 1] * dt;
          pp[i * 3 + 2] += pv[i * 3 + 2] * dt;
          if (pla[i] <= 0) pp[i * 3 + 1] = -99;
        }
      }
      pg.attributes.position.needsUpdate = true;
    };

    // Camera + interaction
    let el = 0.36;
    let dist = 11.2;
    let drag = false;
    let px = 0;
    let py = 0;

    const size = () => {
      const w = host.clientWidth || window.innerWidth;
      const h = host.clientHeight || window.innerHeight;
      renderer.setSize(w, h);
      cam.aspect = w / h;
      cam.updateProjectionMatrix();
    };
    size();
    window.addEventListener('resize', size);
    let ro: ResizeObserver | null = null;
    if (window.ResizeObserver) {
      ro = new ResizeObserver(size);
      ro.observe(host);
    }

    const cvs = renderer.domElement;
    const onDown = (e: PointerEvent) => {
      drag = true;
      px = e.clientX;
      py = e.clientY;
      cvs.setPointerCapture?.(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!drag) return;
      root.rotation.y += (e.clientX - px) * 0.006;
      el = clamp(el + (e.clientY - py) * 0.004, 0.1, 1.1);
      px = e.clientX;
      py = e.clientY;
    };
    const onUp = () => {
      drag = false;
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      dist = clamp(dist + e.deltaY * 0.01, 9, 24);
    };

    cvs.addEventListener('pointerdown', onDown);
    cvs.addEventListener('pointermove', onMove);
    cvs.addEventListener('pointerup', onUp);
    cvs.addEventListener('pointercancel', onUp);
    cvs.addEventListener('wheel', onWheel, { passive: false });

    const col = new THREE.Color(0x2e9e4f);
    const tgt = new THREE.Color();
    const v = new THREE.Vector3();
    const wv = new THREE.Vector3();
    const wv3 = new THREE.Vector3();
    let T = 0;
    let last = performance.now();
    let animId: number;

    const updateLabel = (
      el_: HTMLDivElement | null,
      anchor: THREE.Vector3,
      dy3d: number,
      dxScreen: number,
      dyScreen: number,
      txt: string,
      color?: string
    ) => {
      if (!el_) return;
      v.copy(anchor);
      v.y += dy3d;
      v.project(cam);
      if (v.z > 1) {
        el_.style.display = 'none';
        return;
      }
      el_.style.display = 'block';
      el_.textContent = txt;
      if (color) el_.style.setProperty('--c', color);
      const x = (v.x * 0.5 + 0.5) * host.clientWidth + dxScreen;
      const y = (-v.y * 0.5 + 0.5) * host.clientHeight + dyScreen;
      el_.style.transform = `translate(${x.toFixed(0)}px, ${y.toFixed(0)}px)`;
    };

    const loop = (now: number) => {
      animId = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      T += dt;

      const currentTick = tickRef.current;
      const currentId = machineIdRef.current;
      const tl = currentTick?.telemetry || ({} as any);
      const st = currentTick?.health?.status || 'NOMINAL';

      const type = currentId.startsWith('PRN') || currentId.includes('Ender') ? 'prn' : currentId === 'PC-01' ? 'pc' : 'cnc';

      const vib = tl.vibration_rms_mm_s ?? 1;
      const tp = tl.temperature_c ?? 42;
      const rpm = tl.spindle_rpm ?? 4900;
      const ld = tl.workload_pct ?? 60;
      const heat = clamp((tp - 45) / 45, 0, 1);
      const crit = st === 'CRITICAL' ? 1 : st === 'WARNING' ? 0.4 : 0;

      if (autoRotateRef.current && !drag) root.rotation.y += dt * 0.18;

      // TargetY = 1.35 centers the 3D twin neatly in the reduced-height viewport
      const targetY = 1.35;
      const cd = dist * Math.max(1, 1.25 / cam.aspect);
      cam.position.set(0, targetY + Math.sin(el) * cd, Math.cos(el) * cd);
      cam.lookAt(0, targetY, 0);

      tgt.set(HEX_MAP[st] || '#2E9E4F');
      col.lerp(tgt, 0.08);
      ring.material.color.copy(col);
      bear.material.color.copy(col);
      (cpuRing.material as any).color.copy(col);
      (cpuRing.material as any).emissive.copy(col);
      pl.color.copy(col);
      pl.intensity = 1.3 + crit * 1.6 * (0.6 + 0.4 * Math.sin(T * 8));

      const hc = new THREE.Color().setHSL(0.09 - heat * 0.09, 0.04 + heat * 0.8, 0.5);
      [heatMat, heatMat2].forEach((m) => {
        m.color.copy(hc);
        m.emissive.copy(hc);
        m.emissiveIntensity = heat * 0.55;
      });

      // Dynamic CPU Chip Core Silicon Glow (Cyan at idle, blazing amber/orange at heat, red at throttle)
      const chipHue = Math.max(0.0, 0.52 - heat * 0.52); // 0.52 (cyan) -> 0.08 (orange) -> 0.0 (red)
      chipCoreMat.color.setHSL(chipHue, 0.9, 0.5);
      chipCoreMat.emissive.setHSL(chipHue, 1.0, 0.45);
      chipCoreMat.emissiveIntensity = 0.6 + (ld / 100) * 0.8 + Math.sin(T * 10) * 0.2;

      bear.scale.setScalar(1 + crit * 0.12 * Math.sin(T * 9));

      cnc.visible = type === 'cnc';
      prn.visible = type === 'prn';
      pcg.visible = type === 'pc';

      const m = type === 'cnc' ? cnc : type === 'pc' ? pcg : prn;
      const sh = Math.sin(T * 55) * vib * 0.012 * (0.4 + crit);
      m.position.set(sh, 0, Math.cos(T * 47) * vib * 0.008 * (0.4 + crit));

      let ax: number, ay: number, az: number, baseM: THREE.Vector3;
      if (type === 'cnc') {
        sp.position.x = Math.sin(T * 0.7) * 1.2;
        tool.rotation.y += (rpm / 60) * dt * Math.PI * 2 * 0.06;
        ax = sp.position.x;
        ay = 1.5;
        az = 0;
        if (ld > 40) emit(ax, ay, az, Math.floor(0.3 + crit * 3 + (ld > 80 ? 1 : 0) + Math.random()));
        bear.getWorldPosition(wv);
        cBase.getWorldPosition(wv3);
        baseM = wv3;

        stepP(dt);
        renderer.render(scene, cam);

        // Separate labels cleanly: Vibration to the left, Temp above & right, Current at base
        const vibCol = vib > 4.5 ? '#D32F2F' : vib > 1.8 ? '#E0A100' : '#2E9E4F';
        const tpCol = tp >= 78 ? '#D32F2F' : tp >= 68 ? '#E0A100' : '#2E9E4F';
        const curCol = (tl.motor_current_a ?? 0) > 7.5 ? '#D32F2F' : '#16191C';

        updateLabel(labelsRef.current[0], wv, 0.3, -155, -12, `Vibration ${vib.toFixed(2)} mm/s`, vibCol);
        updateLabel(labelsRef.current[1], wv, 1.4, 20, -14, `Temp ${tp.toFixed(1)} °C`, tpCol);
        updateLabel(labelsRef.current[2], baseM, 0.3, 20, 10, `Current ${(tl.motor_current_a ?? 0).toFixed(2)} A`, curCol);
      } else if (type === 'pc') {
        // Continuous smooth rotation around front-facing Z axis
        fans.forEach((f, k) => (f.rotation.z += (rpm / 60) * dt * Math.PI * 2 * 0.08 * (1 + k * 0.08)));

        // Vibrant Chroma Spectrum Rainbow RGB Cycling across all 3 fans & internal RGB bars
        const rgbSpeed = 1.4;
        rgbRingMats.forEach((mat, i) => {
          const hue = ((T * rgbSpeed + i * 0.33) % 1.0);
          mat.color.setHSL(hue, 1.0, 0.55);
          mat.emissive.setHSL(hue, 1.0, 0.5);
        });
        rgbFanMats.forEach((mat, i) => {
          const hue = ((T * rgbSpeed + i * 0.33 + 0.15) % 1.0);
          mat.emissive.setHSL(hue, 0.95, 0.45);
        });
        // GPU & RAM rainbow sync
        gpuRgbMat.emissive.setHSL((T * rgbSpeed * 0.8) % 1.0, 1.0, 0.5);
        ramRgbMat.emissive.setHSL((T * rgbSpeed * 0.8 + 0.5) % 1.0, 1.0, 0.5);

        fans[1].getWorldPosition(wv);
        pcCase.getWorldPosition(wv3);
        baseM = wv3;

        stepP(dt);
        renderer.render(scene, cam);

        const vibCol = vib > 4.5 ? '#D32F2F' : vib > 1.8 ? '#E0A100' : '#2E9E4F';
        const tpCol = tp >= 82 ? '#D32F2F' : tp >= 70 ? '#E0A100' : '#2E9E4F';
        const curCol = (tl.motor_current_a ?? 0) > 7.5 ? '#D32F2F' : '#16191C';

        updateLabel(labelsRef.current[0], wv, 0.2, -165, -10, `Jitter ${vib.toFixed(2)} mm/s`, vibCol);
        updateLabel(labelsRef.current[1], baseM, 1.8, 28, -20, `CPU ${tp.toFixed(1)} °C`, tpCol);
        updateLabel(labelsRef.current[2], baseM, -1.2, 28, 14, `Power ${(tl.motor_current_a ?? 0).toFixed(2)} A`, curCol);
      } else {
        // Continuous organic vase printing animation
        const printCycle = (T % 18) / 18; // 18 second print cycle from layer 0 to completion
        const h = 0.2 + printCycle * 1.8; // height from 0.2 up to 2.0
        const bedY = 0.77;
        const ty = bedY + h;
        obj.scale.y = h;

        // Spiral toolpath animation: nozzle circles smoothly around the vase perimeter as it prints
        const radius = 0.45 + (h / 2.0) * 0.15;
        const nx = Math.sin(T * 3.5) * radius;
        const nz = Math.cos(T * 3.5) * radius;

        // Hotend nozzle tip (at y=0 in hot group) rides flush on the top surface of the object at ty
        hot.position.set(nx - 0.18, ty, nz - 0.15);
        beam.position.y = ty + 0.85;

        if (crit > 0.5) emit(nx, ty, nz, 2);
        hotBody.getWorldPosition(wv);
        pBase.getWorldPosition(wv3);
        baseM = wv3;

        stepP(dt);
        renderer.render(scene, cam);

        const vibCol = vib > 4.5 ? '#D32F2F' : vib > 1.8 ? '#E0A100' : '#2E9E4F';
        const tpCol = tp >= 85 ? '#D32F2F' : tp >= 75 ? '#E0A100' : '#2E9E4F';
        const curCol = (tl.motor_current_a ?? 0) > 5 ? '#D32F2F' : '#16191C';

        updateLabel(labelsRef.current[0], wv, 0.4, -155, -12, `Extrusion ${vib.toFixed(2)} mm/s`, vibCol);
        updateLabel(labelsRef.current[1], wv, 1.2, 20, -14, `Nozzle ${tp.toFixed(1)} °C`, tpCol);
        updateLabel(labelsRef.current[2], baseM, 0.3, 20, 10, `Current ${(tl.motor_current_a ?? 0).toFixed(2)} A`, curCol);
      }
    };

    animId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', size);
      ro?.disconnect();
      cvs.removeEventListener('pointerdown', onDown);
      cvs.removeEventListener('pointermove', onMove);
      cvs.removeEventListener('pointerup', onUp);
      cvs.removeEventListener('pointercancel', onUp);
      cvs.removeEventListener('wheel', onWheel);
      if (renderer.domElement.parentElement) {
        renderer.domElement.parentElement.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

  return (
    <>
      <div id="gl" ref={hostRef} />
      <div className="lbl" ref={(el) => { labelsRef.current[0] = el; }} style={{ '--c': '#5F656B' } as any} />
      <div className="lbl" ref={(el) => { labelsRef.current[1] = el; }} style={{ '--c': '#E0A100' } as any} />
      <div className="lbl" ref={(el) => { labelsRef.current[2] = el; }} style={{ '--c': '#16191C' } as any} />
    </>
  );
});
