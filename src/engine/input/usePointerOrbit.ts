import { useEffect } from "react";

import type { CameraConfig } from "../config/types";

/**
 * Orbit controls, held outside React for the same reason as the movement axes:
 * the camera reads them every frame and nothing else needs to know.
 *
 * Dragging rather than pointer lock is deliberate. The cursor stays free, so
 * the DOM overlay and anything clickable in the world remain reachable without
 * first escaping a captured pointer.
 */
export interface OrbitState {
  yaw: number;
  pitch: number;
  distance: number;
}

export const orbitState: OrbitState = { yaw: 0, pitch: 0.45, distance: 9 };

export function usePointerOrbit(cfg: CameraConfig, element?: HTMLElement | null): void {
  useEffect(() => {
    const target: HTMLElement | Document = element ?? document;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let pointerId: number | null = null;

    function onPointerDown(event: Event) {
      const pointer = event as PointerEvent;
      // Ignore anything but the primary button, so a right-click menu or a
      // middle-click paste does not swing the camera.
      if (pointer.button !== 0) return;
      dragging = true;
      pointerId = pointer.pointerId;
      lastX = pointer.clientX;
      lastY = pointer.clientY;
    }

    function onPointerMove(event: Event) {
      if (!dragging) return;
      const pointer = event as PointerEvent;
      if (pointerId !== null && pointer.pointerId !== pointerId) return;

      const dx = pointer.clientX - lastX;
      const dy = pointer.clientY - lastY;
      lastX = pointer.clientX;
      lastY = pointer.clientY;

      const sensitivity =
        pointer.pointerType === "touch" ? cfg.sensitivity.touch : cfg.sensitivity.mouse;

      orbitState.yaw -= dx * sensitivity;
      orbitState.pitch = Math.min(
        Math.max(orbitState.pitch + dy * sensitivity, cfg.pitch.min),
        cfg.pitch.max,
      );
    }

    function onPointerUp() {
      dragging = false;
      pointerId = null;
    }

    function onWheel(event: Event) {
      const wheel = event as WheelEvent;
      wheel.preventDefault();
      const step = Math.sign(wheel.deltaY) * cfg.sensitivity.zoom;
      orbitState.distance = Math.min(
        Math.max(orbitState.distance + step, cfg.distance.min),
        cfg.distance.max,
      );
    }

    target.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    target.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      target.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      target.removeEventListener("wheel", onWheel);
    };
  }, [cfg, element]);
}
