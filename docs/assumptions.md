# Assumptions

- Web/Vite plus Tauri is product platform. Unity technical direction is translated into web equivalents, not silently mixed in.
- Phase 1 proved local host/client behavior with deterministic network simulation. The current Slice 2 vertical also has an optional exactly-two-player PeerJS/WebRTC room, but it still depends on external signaling/NAT conditions and is not a production relay service.
- The static cabin shell is authored in Blender and loaded as a validated GLB with procedural fallback. Passenger avatars, service contents, loose gameplay props, emergency effects and interaction proxies remain intentionally procedural until their own production asset/animation slices.
- Phase 1 cabin object data is authored and validated separately from mutable simulation state. Save/profile authoring begins in later phases.
