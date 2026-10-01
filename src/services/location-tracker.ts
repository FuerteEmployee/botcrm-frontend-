import { apiClient } from "@/lib/api-client";
import { canUseSocket, getSocket } from "@/lib/socket-client";

const SEND_INTERVAL_MS = 15000;
const PING_CHECK_INTERVAL_MS = 15000;

type Fix = { lat: number; lng: number; accuracy: number | null; /** capture time, ms */ at: number };

const toFix = (pos: GeolocationPosition): Fix => ({
  lat: pos.coords.latitude,
  lng: pos.coords.longitude,
  accuracy: pos.coords.accuracy ?? null,
  at: pos.timestamp || Date.now(),
});

export class LocationTracker {
  private employeeId: string;
  private watchId: number | null = null;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private pingIntervalId: ReturnType<typeof setInterval> | null = null;
  private lastHandledPingAt: number = 0;
  private isRunning: boolean = false;
  private lastPosition: Fix | null = null;
  // Capture time of the last fix sent, so one reading is never sent twice.
  private lastSentAt: number = 0;

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
          this.lastPosition = toFix(pos);
        },
        () => {},
        { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
      );

      // Every 15 seconds, send a CURRENT reading.
      //
      // This used to re-send `lastPosition` stamped with the send time. A
      // watch only fires when the position changes, so a phone lying still
      // (or one that lost GPS) re-sent one old reading every 15 s as if it
      // were new: "live" pins that were minutes stale, and a run of identical
      // coordinates at fresh times -- the repeated-reading pattern the auto
      // punch-out engine has to be defended against. Now each tick asks for a
      // fix no older than 10 s and sends it with the time it was taken; if the
      // phone cannot produce one, nothing is sent.
      this.intervalId = setInterval(() => {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const fix = toFix(pos);
            this.lastPosition = fix;
            this.sendLocation(fix);
          },
          () => {},
          { enableHighAccuracy: true, maximumAge: 10000, timeout: 10000 }
        );
      }, SEND_INTERVAL_MS);

      // Poll for an admin-requested "Ping" — take an immediate fix instead
      // of waiting for the next interval tick if one comes in.
      this.pingIntervalId = setInterval(() => this.checkPing(), PING_CHECK_INTERVAL_MS);

      // Send immediately on the first GPS fix
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const fix = toFix(pos);
          this.lastPosition = fix;
          this.sendLocation(fix);
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

  private sendLocation(fix: Fix) {
    if (fix.at <= this.lastSentAt) return; // this reading was already sent
    this.lastSentAt = fix.at;

    const payload = {
      employeeId: this.employeeId,
      lat: fix.lat,
      lng: fix.lng,
      latitude: fix.lat,
      longitude: fix.lng,
      accuracy: fix.accuracy,
      // When the phone took the reading, not when it was sent.
      timestamp: fix.at,
      trackedAt: new Date(fix.at).toISOString(),
    };

    // Send via Socket.IO (real-time channel the tracking server listens on)
    if (canUseSocket()) {
      const socket = getSocket();
      socket?.emit("location:update", payload);
    }

    // Also send via REST — covers: (a) socket not connected yet,
    // (b) HRMS backend has its own /tracking/update endpoint
    apiClient
      .post("/tracking/update", payload)
      .then(({ data }) => {
        // The server refuses fixes once tracking is switched off for this
        // employee. Stop asking the phone for GPS instead of posting every
        // 15 s into a refusal until the app next reloads the profile.
        if (data?.tracking === false) this.stop();
      })
      .catch(() => {});
  }

  private async checkPing() {
    try {
      const { data } = await apiClient.get("/tracking/ping-check");
      if (data?.tracking === false) {
        this.stop();
        return;
      }
      const requestedAt = data?.pingRequestedAt ? new Date(data.pingRequestedAt).getTime() : 0;
      if (requestedAt > this.lastHandledPingAt) {
        this.lastHandledPingAt = requestedAt;
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const fix = toFix(pos);
            this.lastPosition = fix;
            this.sendLocation(fix);
          },
          () => {},
          { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
        );
      }
    } catch {
      // Offline or endpoint unavailable — next interval tick tries again.
    }
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
    if (this.pingIntervalId !== null) {
      clearInterval(this.pingIntervalId);
      this.pingIntervalId = null;
    }
    this.isRunning = false;
    this.lastPosition = null;
  }
}

let globalTrackerInstance: LocationTracker | null = null;

export function startTracking(employeeId: string) {
  if (!globalTrackerInstance) {
    globalTrackerInstance = new LocationTracker(employeeId);
  }
  // start() does nothing while running, and restarts a tracker that stopped
  // itself because the server said tracking was off.
  globalTrackerInstance.start();
}

export function stopTracking() {
  if (globalTrackerInstance) {
    globalTrackerInstance.stop();
    globalTrackerInstance = null;
  }
}
