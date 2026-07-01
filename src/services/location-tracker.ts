import { apiClient } from "@/lib/api-client";
import { canUseSocket, getSocket } from "@/lib/socket-client";

const SEND_INTERVAL_MS = 15000;

export class LocationTracker {
  private employeeId: string;
  private watchId: number | null = null;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private isRunning: boolean = false;
  private lastPosition: { lat: number; lng: number; accuracy: number } | null = null;

  constructor(employeeId: string) {
    this.employeeId = employeeId;
  }

  start() {
    if (this.isRunning) return;
    if (typeof window === "undefined" || !navigator.geolocation) return;

    this.isRunning = true;

    const startWatch = () => {
      // Watch GPS continuously for the most accurate position
      this.watchId = navigator.geolocation.watchPosition(
        (pos) => {
          this.lastPosition = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy || 0,
          };
        },
        () => {},
        { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
      );

      // Send to server every 15 seconds
      this.intervalId = setInterval(() => {
        if (this.lastPosition) this.sendLocation(this.lastPosition);
      }, SEND_INTERVAL_MS);

      // Send immediately on the first GPS fix
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const payload = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy || 0,
          };
          this.lastPosition = payload;
          this.sendLocation(payload);
        },
        () => {},
        { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
      );
    };

    // Only start if GPS permission is already granted — never auto-prompt
    if (navigator.permissions) {
      navigator.permissions
        .query({ name: "geolocation" as PermissionName })
        .then((result) => {
          if (result.state === "granted") startWatch();
        })
        .catch(() => startWatch());
    } else {
      startWatch();
    }
  }

  private sendLocation(pos: { lat: number; lng: number; accuracy: number }) {
    const payload = {
      employeeId: this.employeeId,
      lat: pos.lat,
      lng: pos.lng,
      latitude: pos.lat,
      longitude: pos.lng,
      accuracy: pos.accuracy,
      timestamp: Date.now(),
    };

    // Send via Socket.IO (real-time channel the tracking server listens on)
    if (canUseSocket()) {
      const socket = getSocket();
      socket?.emit("location:update", payload);
    }

    // Also send via REST — covers: (a) socket not connected yet,
    // (b) HRMS backend has its own /tracking/update endpoint
    apiClient.post("/tracking/update", payload).catch(() => {});
  }

  stop() {
    if (this.watchId !== null && typeof window !== "undefined") {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    this.lastPosition = null;
  }
}

let globalTrackerInstance: LocationTracker | null = null;

export function startTracking(employeeId: string) {
  if (!globalTrackerInstance) {
    globalTrackerInstance = new LocationTracker(employeeId);
    globalTrackerInstance.start();
  }
}

export function stopTracking() {
  if (globalTrackerInstance) {
    globalTrackerInstance.stop();
    globalTrackerInstance = null;
  }
}
