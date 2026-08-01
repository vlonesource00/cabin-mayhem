# Changelog

## Unreleased

- Rebuilt Phase 1 as a true first-person Three.js aircraft with project-owned procedural 3D assets.
- Added pointer-lock mouse look, camera-relative movement, cabin fixture collisions and 3D prop synchronization.
- Fixed backward movement, fixed-step interaction loss and authoritative crosshair-target pickup; held props now render in the player's hands.
- Prevented Vite from watching Cargo build artifacts during `tauri dev`.

## 0.1.0 — 2026-08-01

- Reframed browser/Tauri prototype as original Cabin Mayhem Phase 1.
- Added host-authoritative flight phases, aircraft-local forces, loose cargo physics, straps, grab/throw ownership and simulated network conditions.
- Added greybox technical test scene with cockpit/cabin/cargo layout and debug triggers.
- Added Phase 1 architecture, network, authoring, test and roadmap documentation.
- Built Windows x64 executable, MSI and NSIS development artifacts.
