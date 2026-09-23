import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useRef, lazy, Suspense } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient, IMAGE_BASE_URL } from "@/lib/api-client";
import { useAuth } from "@/hooks/use-auth";
import { motion, AnimatePresence } from "framer-motion";
import {
  Clock, MapPin, Camera, Coffee, CheckCircle,
  AlertTriangle, Calendar, Award, Fingerprint, ChevronLeft, ChevronRight,
  Home, RefreshCw, Sparkles, Settings, Filter, ChevronDown, ListChecks,
  Loader2, CloudOff, ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { startTracking, stopTracking } from "@/services/location-tracker";
import { startBackgroundTracking, stopBackgroundTracking, getTrackerStatus, available as trackerAvailable } from "@/plugins/background-tracker";
import { getSession } from "@/lib/auth";
import { getInstallId } from "@/lib/client-telemetry";
import {
  buildSessions,
  TodaySessions,
  TodayActivity,
  type AttendanceSession,
} from "@/components/user/today-sessions";
import { hapticSuccess, haptic } from "@/lib/haptics";
import { useTrackingSetup } from "@/hooks/use-tracking-setup";
import { HapticOverlay } from "@/components/shared/haptic-overlay";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { checkApkUpdate } from "@/lib/apk-update";
import { TrackingSetupGate } from "@/components/attendance/tracking-setup-gate";
import {
  acquirePosition,
  openLocationSettings,
  getPlatform,
  isNativeApp,
  type LocationFailureReason,
} from "@/lib/geolocation";
// Lazy: Leaflet is ~148 KB and is only needed once the location-consent modal
// is actually opened. Importing it here statically made every employee pay for
// it — download and parse — on every single app open.
const UserLocationMap = lazy(() => import("@/components/user/user-location-map"));

export const Route = createFileRoute("/user/")({
  component: UserDashboard,
});

interface AttendanceLog {
  _id: string;
  date: string;
  punchIn?: string;
  punchOut?: string;
  lunchInTime?: string;
  lunchOutTime?: string;
  isWFH?: boolean;
  status: "present" | "absent" | "half-day" | "late" | "weekly-off" | "festival";
  source?: "app" | "lens" | "biometric";
  punchOutIsProvisional?: boolean;
  /**
   * Which punch fields the server's day-reconciliation INFERRED from raw device
   * taps, as opposed to the app having set them explicitly. Absent from this
   * list means somebody pressed the button on purpose.
   */
  derivedFields?: string[];
  remarks?: string;
  address?: string;
  punchInPhoto?: string;
  punchOutPhoto?: string;
  punchInLocation?: string;
  punchOutLocation?: string;
  lunchInLocation?: string;
  lunchOutLocation?: string;
  /** Metres from the nearest assigned branch at each end of the root session. */
  punchInDistance?: number | null;
  punchOutDistance?: number | null;
  punchInSource?: string | null;
  punchOutSource?: string | null;
  shifts?: AttendanceSession[];
}

interface UserProfile {
  _id: string;
  name: string;
  phone: string;
  role: string;
  email?: string;
  salary?: number;
  employmentType?: string;
  profileImage?: string;
  departmentId?: { name: string };
  branchId?: { name: string; latitude: number; longitude: number };
  shiftId?: { name: string; startTime: string; endTime: string };
  /** Server-side cap on punch-in sessions per day. Server is the authority. */
  maxDailySessions?: number;
  todayAttendance?: AttendanceLog | null;
  recentAttendance?: AttendanceLog[];
  upcomingHolidays?: Array<{ _id: string; name: string; startDate: string }>;
  allowMultiplePunches?: boolean;
  /**
   * May this employee mark a punch Work From Home?
   *
   * Resolved server-side by the same rule that accepts or refuses the punch
   * (per-employee `attendanceExceptions.remotePunch`, else the tenant default),
   * so the toggle is only offered when it would actually work.
   */
  canWorkFromHome?: boolean;
  trackingEnabled?: boolean;
}

// Sleek Custom SVG Circular Progress Gauge (Lighter stroke, balanced typography)
const CircularProgress = ({
  value,
  max,
  color,
  trackColor,
  size = 56
}: {
  value: number;
  max: number;
  color: string;
  trackColor: string;
  size?: number;
}) => {
  const radius = size * 0.38;
  const strokeWidth = size * 0.07;
  const circumference = 2 * Math.PI * radius;
  const safeVal = Math.min(value, max);
  const strokeDashoffset = max > 0 ? circumference - (safeVal / max) * circumference : circumference;

  return (
    <div className="relative flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
      <svg className="w-full h-full -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="transparent"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          fill="transparent"
          className="transition-all duration-700 ease-out"
        />
      </svg>
      <span className="absolute text-[11px] font-semibold text-slate-700 dark:text-slate-200">{value}</span>
    </div>
  );
};


// Device-appropriate instructions for enabling location, shown in the help dialog.
function locationHelpSteps(
  platform: "android" | "ios" | "web",
  reason: LocationFailureReason | null
): string[] {
  if (platform === "web") {
    return [
      "Tap the lock / location icon in your browser's address bar.",
      'Set Location to "Allow" for this site.',
      "Reload the page, then tap Retry below.",
    ];
  }
  if (reason === "unavailable") {
    return [
      'Tap "Open Location Settings" below.',
      "Turn on Location and set mode to High accuracy / GPS.",
      "Return to the app and tap Retry.",
    ];
  }
  return [
    'Tap "Open App Settings" below.',
    "Open Permissions → Location.",
    'Choose "Allow" (While using the app is fine).',
    "Return to the app and tap Retry.",
  ];
}

/** "18:30" -> "06:30 PM". Returns the raw value if it is not an HH:mm string. */
function formatShiftTime(hhmm?: string | null): string {
  if (!hhmm) return "shift end";
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return hhmm;
  const h = Number(m[1]);
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${String(h12).padStart(2, "0")}:${m[2]} ${suffix}`;
}

/**
 * When today's occurrence of `shift` ends, as a real instant, or null when the
 * shift has no usable times.
 *
 * An overnight shift (22:00-06:00) ends TOMORROW, so the end is pushed a day
 * forward whenever it would otherwise land at or before the start. Without
 * that, a night worker's punch-in control would disappear the moment they
 * arrived.
 *
 * Resolved against the handset's own clock, which is the same clock the
 * employee is reading. The server re-checks in IST and is the authority on
 * whether a punch is accepted.
 */
function useShiftEndToday(shift?: { startTime?: string; endTime?: string } | null) {
  const [end, setEnd] = useState<Date | null>(null);

  const start = shift?.startTime;
  const finish = shift?.endTime;

  useEffect(() => {
    if (!start || !finish) { setEnd(null); return; }
    const parse = (hhmm: string) => {
      const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
      if (!m) return null;
      const d = new Date();
      d.setHours(Number(m[1]), Number(m[2]), 0, 0);
      return d;
    };
    const s = parse(start);
    const e = parse(finish);
    if (!s || !e) { setEnd(null); return; }
    if (e.getTime() <= s.getTime()) e.setDate(e.getDate() + 1); // overnight
    setEnd(e);
  }, [start, finish]);

  return end;
}

function UserDashboard() {
  useAuth();

  // Coarse clock for time-of-day gating (the shift-end check below). Deliberately
  // 30s rather than the 1s ticker used for the elapsed-time readout: this only
  // has to notice a boundary, and re-rendering the whole screen every second for
  // it would cost battery on a phone that is already running a GPS service.
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  const queryClient = useQueryClient();
  const [time, setTime] = useState(new Date());
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [address, setAddress] = useState<string>("Locating...");
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationAccuracy, setLocationAccuracy] = useState<number | null>(null);
  const [showLocationVerification, setShowLocationVerification] = useState(false);

  // Work From Home, chosen for THIS punch.
  //
  // Reset every time the sheet opens (see the effect below), never remembered.
  // A remembered toggle is how somebody walks into the office on Tuesday and
  // silently records a remote day because they left it on over the weekend --
  // and the consequence is not cosmetic, since a WFH day is exempt from the
  // fence and from auto punch-out.
  const [wfhForThisPunch, setWfhForThisPunch] = useState(false);

  // Every punch starts as an office punch.
  useEffect(() => {
    if (showLocationVerification) setWfhForThisPunch(false);
  }, [showLocationVerification]);
  // "Enable Location" guided-help dialog (steps + deep link to OS settings).
  const [showLocationHelp, setShowLocationHelp] = useState(false);
  /**
   * Guard on opening a SECOND session for the day.
   *
   * Without it the button sits exactly where "Punch Out" was a moment earlier,
   * so the tap that ends a shift and the tap that starts a new one land on the
   * same pixels. The server caps the day at a fixed number of sessions, and a
   * misfire spends one of them and puts a punch on the record that has to be
   * corrected by an admin.
   */
  const [confirmNewSession, setConfirmNewSession] = useState(false);
  const [locationFailReason, setLocationFailReason] = useState<LocationFailureReason | null>(null);
  /**
   * Has the first location attempt finished?
   *
   * Needed because "we have no coordinates" and "we cannot get coordinates" are
   * different facts, and the UI was treating the first as the second: on every
   * app open the banner read "Location blocked — tap to enable GPS" in red for
   * the two or three seconds the GPS took to return, on phones where nothing
   * was blocked at all. Employees are told to stop and punch in only when that
   * warning is gone, so a false one is not cosmetic — it teaches them to
   * distrust the only warning that matters.
   */
  const [locationProbed, setLocationProbed] = useState(false);
  // Punch action queued while we wait for the user to enable location.
  const [pendingPunch, setPendingPunch] = useState<"punch-in" | "punch-out" | null>(null);

  // Custom camera scanner variables
  const [scanType, setScanType] = useState<"punch-in" | "punch-out" | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [capturedSelfie, setCapturedSelfie] = useState<string | null>(null);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanResult, setScanResult] = useState<{ type: "punch-in" | "punch-out"; workHoursLabel?: string; timeLabel?: string } | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Selected Month/Year for statistics navigation (Synchronized via localStorage)
  const [selectedDate, setSelectedDate] = useState(() => {
    const saved = localStorage.getItem("employee-portal-selected-date");
    return saved ? new Date(saved) : new Date();
  });

  // Calendar / Chronological list view state (merged in from the old History page)
  const [activeTab, setActiveTab] = useState<"calendar" | "list">("calendar");
  const [selectedDayLog, setSelectedDayLog] = useState<AttendanceLog | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showSessionDetails, setShowSessionDetails] = useState(false);

  useEffect(() => {
    localStorage.setItem("employee-portal-selected-date", selectedDate.toISOString());
    setSelectedDayLog(null);
    setShowSessionDetails(false);
  }, [selectedDate]);

  // 1. Fetch User Profile
  const { data: profile, isLoading: isProfileLoading, refetch: refetchProfile } = useQuery<UserProfile>({
    queryKey: ["user-profile"],
    queryFn: async () => {
      const { data } = await apiClient.get("/users/profile");
      return data;
    },
    // Overrides the 60s default: this carries todayAttendance, which decides
    // whether the button says Punch In or Punch Out. A punch made on the
    // biometric terminal changes it with no mutation here to invalidate the
    // cache, so this one has to re-check often enough that the screen cannot
    // disagree with the machine the employee just used.
    staleTime: 10 * 1000,
  });

  // 1.5 Fetch Unified Employee Dashboard Summary (Backend Stats)
  const { data: dashboardData, isLoading: isDashboardLoading } = useQuery({
    queryKey: ["employee-dashboard", selectedDate.getMonth() + 1, selectedDate.getFullYear()],
    queryFn: async () => {
      const { data } = await apiClient.get("/dashboard/employee", {
        params: {
          month: selectedDate.getMonth() + 1,
          year: selectedDate.getFullYear()
        }
      });
      return data;
    }
  });

  // 1.6 Fetch full day-by-day attendance history for the calendar grid + chronological list
  const { data: historyData, isLoading: isHistoryLoading, isRefetching: isHistoryRefetching } = useQuery<{ history: AttendanceLog[] }>({
    queryKey: ["user-history", selectedDate.getMonth() + 1, selectedDate.getFullYear()],
    queryFn: async () => {
      const { data } = await apiClient.get("/attendance/my-history", {
        params: { month: selectedDate.getMonth() + 1, year: selectedDate.getFullYear() }
      });
      return data;
    }
  });

  // 2. Fetch Salary Records
  const { data: salaryData } = useQuery({
    queryKey: ["user-salary", profile?._id],
    queryFn: async () => {
      if (!profile?._id) return [];
      const { data } = await apiClient.get(`/salary/employee/${profile._id}`);
      return data;
    },
    enabled: !!profile?._id,
  });

  const currentMonthSalary = salaryData?.find(
    (s: any) => s.month === (selectedDate.getMonth() + 1) && s.year === selectedDate.getFullYear()
  );

  const todayLog = profile?.todayAttendance;

  // Time-ordered and numbered. Kept next to todayLog rather than computed at
  // each render site so the strip and the activity list can never disagree
  // about which session is which.
  const todaySessions = buildSessions(todayLog);

  // The cap comes from the server (MAX_DAILY_SESSIONS). Falling back to 5 only
  // covers an older backend that does not send it; the value is never the
  // client's to decide, because the server is what actually refuses the punch.
  const maxSessions = profile?.maxDailySessions ?? 5;
  const sessionsLeft = Math.max(0, maxSessions - todaySessions.length);

  // A lens/biometric terminal never calls the app's own lunch endpoints — it
  // only reports that somebody was recognised, and the server INFERS which
  // middle taps bounded a break. That inference is a guess, so it must not be
  // shown here as fact; "Session details" (below) lists every raw tap instead.
  //
  // But it is only the INFERENCE that is unreliable. A lunch the employee
  // explicitly recorded in this app is a deliberate action and is exactly as
  // trustworthy on a day the terminal opened as on any other. Keying this off
  // `source` blanked both alike: after pressing Start Lunch on a machine-opened
  // day, the app cleared the time it had just recorded and went on offering
  // "Start Lunch", while the admin screen showed the break correctly.
  //
  // `derivedFields` is the server's own record of which fields its
  // reconciliation wrote, so a field absent from it was set deliberately. Same
  // distinction `punchOutIsProvisional` draws for the punch-out just below.
  const inferredByDevice = new Set(todayLog?.derivedFields ?? []);
  const displayLunchInTime = inferredByDevice.has("lunchInTime") ? undefined : todayLog?.lunchInTime;
  const displayLunchOutTime = inferredByDevice.has("lunchOutTime") ? undefined : todayLog?.lunchOutTime;
  // Cleared server-side the moment the employee explicitly punches out via
  // the app, even on a day that started via Lens — so an app punch-out
  // always shows immediately instead of waiting for "today" to pass.
  const displayPunchOut = todayLog?.punchOutIsProvisional ? undefined : todayLog?.punchOut;

  const isPunchedIn = !!todayLog?.punchIn;

  // Has the employee's shift finished for today?
  //
  // Only ever used to withdraw the PUNCH-IN control. Punch Out, Start Lunch
  // and End Lunch stay available at all times: somebody still on the clock at
  // shift end must be able to close their own day, and hiding that button
  // would strand the session for the 04:00 job to close at an arbitrary
  // instant -- which is the zero-length, unpayable day this rule prevents.
  //
  // The server enforces the same rule (attendance_controller.punchIn) and is
  // the authority; this only stops the employee walking into a refusal.
  const shiftEnd = useShiftEndToday(profile?.shiftId);
  const shiftIsOver = !!shiftEnd && nowTick >= shiftEnd.getTime();
  // Unconditional on any capable device -- every employee goes through the
  // same one-time permission setup, matching the reference app, whether or
  // not an admin has separately turned on this specific person's tracking
  // yet (see use-tracking-setup.ts for why). That separate flag still gates
  // the effect just below, which decides whether the native service actually
  // starts recording once punched in.
  const trackingSetup = useTrackingSetup();
  const isOnline = useOnlineStatus();

  /**
   * Does this employee's punch need a GPS fix at all?
   *
   * Having a branch is the same test `beginPunch` already uses to decide
   * whether to demand one, so field and branch-less staff keep punching exactly
   * as they do now. Inventing a second rule here is how the client would start
   * refusing punches the server would have accepted.
   */
  const locationRequired = !!profile?.branchId;

  /**
   * Location is BLOCKED — as opposed to merely not known yet.
   *
   * Only the reasons the employee can actually act on count. A `timeout` is
   * deliberately excluded: the permission is granted and location services are
   * on, the phone simply has not seen a satellite yet, and disabling the
   * buttons then would strand somebody indoors with no way forward and send
   * them into Settings to change nothing. `locationProbed` keeps "still
   * checking" from reading as "broken" during the first seconds after load.
   */
  const locationBlocked =
    locationRequired &&
    locationProbed &&
    !location &&
    (locationFailReason === "denied" ||
      locationFailReason === "unavailable" ||
      locationFailReason === "unsupported");

  // Mandatory-update gate. Defaults to false and only ever becomes true after
  // a successful check against a real installed versionCode, so a failed or
  // unreadable check leaves punching exactly as it was.
  const [apkBlocking, setApkBlocking] = useState(false);
  useEffect(() => {
    let alive = true;
    void checkApkUpdate(getSession()?.adminId).then((s) => {
      if (alive) setApkBlocking(s.blocking);
    });
    return () => { alive = false; };
  }, []);
  const isPunchedOut = !!displayPunchOut;

  // Real-time location tracking lifecycle. Tracking is enabled per-employee by
  // the admin (profile.trackingEnabled) — employees no longer choose. It runs
  // only while the employee is punched in.
  useEffect(() => {
    // NEVER touch the tracker before we know what it should be doing.
    //
    // This effect used to fold "the profile has not loaded yet" into
    // shouldTrack, so on every single app open the first render computed FALSE
    // and immediately called stopBackgroundTracking() — killing a healthy
    // foreground service before finding out whether it was supposed to be
    // running. If the restart that followed then failed or raced, the employee
    // was left silently untracked with every permission granted and no way to
    // know.
    //
    // That is what happened on 2026-09-16: an employee tracked steadily for two
    // and a half hours, punched in, and stopped three seconds later. The native
    // side had done nothing wrong — START_STICKY, onTaskRemoved and BootReceiver
    // are all in place — it was told to stop. Autostart cannot rescue a service
    // that was deliberately shut down.
    //
    // Unknown is not the same as "should be off". While it is unknown, leave the
    // service exactly as it is.
    if (!profile?._id) return;

    const shouldTrack = isPunchedIn && !isPunchedOut && !!profile.trackingEnabled;

    if (!shouldTrack) {
      stopTracking();
      stopBackgroundTracking();
      return;
    }

    // Prefer the NATIVE foreground service when this APK has it compiled in.
    // The in-app tracker below only reports while the WebView is alive, and
    // Android suspends WebView timers within seconds of the screen locking --
    // which is exactly when someone walks out of the building, i.e. precisely
    // the moment the geofence engine needs data and currently gets none.
    //
    // On any device without the plugin (every APK shipped before this, since
    // OTA cannot deliver native code) startBackgroundTracking resolves false
    // and we fall back to today's behaviour rather than failing.
    let cancelled = false;
    (async () => {
      const session = getSession();
      // The native syncer builds its own URLs as `$apiBase/api/tracking/...`
      // (see LocationSyncer.kt / LocationTrackingService.kt) -- it expects the
      // BARE HOST. VITE_API_URL, by contrast, already includes the trailing
      // "/api" everywhere else in this app, because that's axios's baseURL
      // and every other call site (apiClient.post("/attendance/punch-in"), …)
      // is written relative to it. Passing VITE_API_URL straight through here
      // produced a doubled ".../api/api/tracking/update/batch" on every
      // single native request -- a 404 every time, silently, since the
      // syncer's failure path is "retry with backoff", never "surface an
      // error" -- which is exactly why zero background-sourced fixes had ever
      // reached the server on any device, despite the native plugin itself
      // (proven by haptics, which touches no endpoint) working correctly.
      const rawApiBase = import.meta.env.VITE_API_URL || "https://gray-crab-756474.hostingersite.com/api";
      const nativeApiBase = rawApiBase.replace(/\/api\/?$/, "");
      const started = session?.token
        ? await startBackgroundTracking({
            installId: getInstallId(),
            token: session.token,
            apiBase: nativeApiBase,
            employeeId: profile._id,
          })
        : false;

      if (cancelled) return;
      // Run the in-app tracker only when the native service did NOT take over.
      // Running both would double every fix, and duplicated points bias a
      // geofence decision toward wherever the phone was reporting most often.
      //
      // On a build WITH the plugin, `started: false` now means the service was
      // asked for and did not come up -- not "this APK is too old". The web
      // tracker is still started, because one fix is better than none and the
      // employee is standing there punching in, but it is not a substitute:
      // Android suspends WebView timers within seconds of the screen locking,
      // so it goes quiet exactly when somebody walks out of the building.
      //
      // Brij Fuerte, 2026-09-22: exactly this. One `source: "app"` fix at
      // 13:37, then nothing until the watchdog revived the service at 15:14 --
      // the hour he was out of the office simply is not in the record.
      //
      // Retrying is already covered twice over and needs nothing here: the
      // native side now enqueues an expedited watchdog run the moment a start
      // fails (which survives this WebView going away), and the JS watchdog
      // below re-attempts every 60 s for as long as the app is open.
      if (!started) startTracking(profile._id);
    })();

    // ── Watchdog ─────────────────────────────────────────────────────────────
    //
    // Starting the service once and trusting it to stay up is not good enough.
    // A foreground service can die for reasons the employee has no part in and
    // no way to see: an OEM battery manager reaping it, the system reclaiming
    // memory, or a restart racing the punch-in that triggered it. Observed on
    // 2026-09-16: an employee with every permission granted tracked steadily
    // for two and a half hours, punched in, and stopped three seconds later.
    // Nothing noticed. She would have had to know to force-stop the app.
    //
    // The people using this are not going to diagnose a foreground service.
    // They grant the permissions once and expect it to work forever, which is
    // a completely reasonable expectation. So the app checks whether the
    // service is actually alive and silently restarts it if not — no prompt,
    // no message, nothing for them to understand or act on.
    //
    // Cheap by design: getStatus() is a bridge call answered from memory, once
    // a minute, only while genuinely on duty.
    const restartIfDead = async () => {
      if (cancelled || !trackerAvailable()) return;
      try {
        const status = await getTrackerStatus();
        if (cancelled || !status || status.active) return;

        const session = getSession();
        if (!session?.token) return;
        const rawBase = import.meta.env.VITE_API_URL || "";
        console.warn("[bg-tracker] service was not running while on duty — restarting");
        await startBackgroundTracking({
          installId: getInstallId(),
          token: session.token,
          apiBase: rawBase.replace(/\/api\/?$/, ""),
          employeeId: profile._id,
        });
      } catch {
        // A failed health check must never surface to the employee, and must
        // never break the punch flow. The next tick tries again.
      }
    };

    const timer = window.setInterval(restartIfDead, 60_000);

    // Returning to the app is the single most likely moment to discover the
    // service was killed while it was in the background, so check immediately
    // rather than waiting up to a minute for the next tick.
    const onResume = () => { void restartIfDead(); };
    document.addEventListener("visibilitychange", onResume);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onResume);
    };
  }, [profile?._id, isPunchedIn, isPunchedOut, profile?.trackingEnabled]);

  // Real-time Shift Progress
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (todayLog?.punchIn && !displayPunchOut) {
      const calculateDiff = () => {
        const diffMs = new Date().getTime() - new Date(todayLog.punchIn!).getTime();
        setElapsedSeconds(Math.floor(diffMs / 1000));
      };
      calculateDiff();
      const interval = setInterval(calculateDiff, 1000);
      return () => clearInterval(interval);
    } else {
      setElapsedSeconds(0);
    }
  }, [todayLog]);

  // Ticking clock
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Reverse-geocode coordinates into a readable address (best-effort; falls back to raw coords).
  const resolveAddress = async (lat: number, lng: number): Promise<string> => {
    const fallback = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    if (typeof navigator !== "undefined" && !navigator.onLine) return fallback;
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`,
        { headers: { "Accept-Language": "en", "User-Agent": "BeOnTimePortal/1.0" } }
      );
      if (response.ok) {
        const geoData = await response.json();
        return geoData.display_name || fallback;
      }
    } catch {
      /* network error — fall through to raw coordinates */
    }
    return fallback;
  };

  // Passive location fetch — only if permission is ALREADY granted. Never
  // auto-prompts; tapping Punch In / Punch Out is the intentional trigger.
  //
  // Re-run whenever the app comes back to the foreground, because the punch
  // controls are now gated on the outcome. Turning GPS on means leaving for
  // Settings and coming back, and without a re-probe the employee would return
  // to the very panel that had just sent them there, with no way to clear it.
  // It closes the other direction too: GPS switched off while the app was in
  // the background is noticed on return rather than at the next punch attempt.
  useEffect(() => {
    let cancelled = false;

    const probe = async () => {
      const result = await acquirePosition({ silent: true });
      if (cancelled) return;
      if (result.ok) {
        setLocation({ lat: result.coords.lat, lng: result.coords.lng });
        setLocationAccuracy(result.coords.accuracy);
        setLocationFailReason(null);
        setLocationProbed(true);
        const addr = await resolveAddress(result.coords.lat, result.coords.lng);
        if (!cancelled) setAddress(addr);
      } else {
        // Only NOW is it fair to say something is wrong.
        //
        // The previously-known position is dropped on a hard failure: a fix
        // from before GPS was switched off is not where the employee is now,
        // and leaving it in place would keep the buttons live and let the punch
        // be recorded against a stale location. A timeout keeps it -- nothing
        // was turned off, the phone just has not re-fixed yet.
        if (result.reason !== "timeout") {
          setLocation(null);
          setLocationAccuracy(null);
        }
        setLocationFailReason(result.reason);
        setLocationProbed(true);
        setAddress("GPS permissions needed");
      }
    };

    void probe();

    // Both signals, as use-tracking-setup does, and for the same reason: the
    // employee is sent to a SYSTEM screen to fix this, so returning is the only
    // moment the new state can be observed. If `visibilitychange` does not fire
    // in the WebView, the panel that sent them to Settings would still be there
    // when they came back, with its only button sending them there again.
    const onVisible = () => {
      if (document.visibilityState === "visible") void probe();
    };
    document.addEventListener("visibilitychange", onVisible);

    let removeAppListener: (() => void) | undefined;
    if (isNativeApp()) {
      import("@capacitor/app")
        .then(({ App }) => {
          App.addListener("appStateChange", ({ isActive }) => { if (isActive) void probe(); })
            .then((h) => { removeAppListener = () => void h.remove(); })
            .catch(() => {});
        })
        .catch(() => {});
    }

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      removeAppListener?.();
    };
  }, []);

  const refreshLocation = async () => {
    setLocationLoading(true);
    const result = await acquirePosition(); // actively requests permission if needed
    if (result.ok) {
      setLocation({ lat: result.coords.lat, lng: result.coords.lng });
      setLocationAccuracy(result.coords.accuracy);
      setLocationFailReason(null);
      const addr = await resolveAddress(result.coords.lat, result.coords.lng);
      setAddress(addr);
    } else {
      setLocationFailReason(result.reason);
      setLocationProbed(true);
      setAddress("GPS permissions needed");
      if (result.reason === "timeout") {
        toast.error(`${result.message} Please try again.`);
      } else {
        // Permission denied / GPS off / unsupported — offer the guided fix.
        setShowLocationHelp(true);
      }
    }
    setLocationLoading(false);
  };

  // Camera helpers for identity scanner modal
  const startScannerCamera = async () => {
    setCapturedSelfie(null);
    setIsScanning(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });

      // Allow a small tick for React layout mapping to guarantee ref attachment
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      }, 50);

    } catch {
      toast.error("Unable to access front camera");
      setScanType(null);
      setIsScanning(false);
    }
  };

  const stopScannerCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
    setIsScanning(false);
  };

  /**
   * Close whatever part of the punch flow is open, and say why.
   *
   * Every piece of it is torn down together: the camera keeps running and the
   * torch stays lit if `stopScannerCamera` is skipped, and a `scanType` left
   * set re-renders the scanner over the top of the home screen.
   */
  const abortPunchFlow = (message: string) => {
    stopScannerCamera();
    setScanType(null);
    setCapturedSelfie(null);
    setScanLoading(false);
    setShowLocationVerification(false);
    setPendingPunch(null);
    toast.error(message);
  };

  /**
   * Leave the punch flow if the conditions that let it open stop being true.
   *
   * Checking once, at the moment Punch In is pressed, is not enough: location
   * can be switched off in the notification shade while the map sheet or the
   * selfie camera is still on screen, and the punch would then be recorded from
   * whatever stale fix was captured before. This re-checks for as long as the
   * flow is open and backs out the moment it cannot be satisfied.
   *
   * A `timeout` is NOT a reason to back out, for the same reason it is not a
   * reason to disable the buttons: it means the phone has not got a fix yet,
   * not that anything was turned off. Backing out on one would throw people out
   * of the camera every time they stepped indoors.
   *
   * Only runs while something is open, so there is no polling on the idle home
   * screen and no battery cost outside the few seconds a punch takes.
   */
  const punchFlowOpen = showLocationVerification || !!scanType;
  useEffect(() => {
    if (!punchFlowOpen) return;

    // Network first: it needs no permission and no fix, and the punch request
    // itself cannot succeed without it.
    if (!isOnline) {
      abortPunchFlow("You went offline, so the punch was cancelled. Reconnect and try again.");
      return;
    }

    if (!locationRequired) return;

    let cancelled = false;
    let inFlight = false;

    const check = async () => {
      // A high-accuracy fix can take longer than the interval; overlapping
      // requests would queue up behind each other and report stale outcomes.
      if (inFlight || cancelled) return;
      inFlight = true;
      try {
        const result = await acquirePosition({ silent: true });
        if (cancelled || result.ok) return;
        if (result.reason === "timeout") return;

        // Record the failure as well as backing out. Closing the sheet alone
        // would leave the buttons live against the fix captured before GPS was
        // switched off, so the employee could reopen the flow immediately and
        // punch from a stale position -- which is the thing being prevented.
        setLocation(null);
        setLocationAccuracy(null);
        setLocationFailReason(result.reason);
        setLocationProbed(true);
        setAddress("GPS permissions needed");

        abortPunchFlow(
          result.reason === "unavailable"
            ? "GPS was turned off, so the punch was cancelled. Turn location on and try again."
            : "Location access was withdrawn, so the punch was cancelled.",
        );
      } finally {
        inFlight = false;
      }
    };

    const id = window.setInterval(check, 6000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [punchFlowOpen, isOnline, locationRequired]);

  // A punch request can error on the client (dropped connection, a 500 while
  // the response was serialized, etc.) even though the backend already wrote
  // the record. Refetch the profile before assuming it truly failed, so we
  // don't reopen the camera for a retry that the backend will then reject
  // with 400 "already punched in/out".
  // Messages that are clearly a raw JS runtime crash leaking through (backend
  // bug), rather than a real human-readable validation message — never show
  // these to the user as-is.
  const looksLikeRawCrash = (msg?: string) =>
    !!msg && /is not defined|cannot read propert|undefined is not a function|typeerror|referenceerror/i.test(msg);

  const nowLabel = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true });

  const handlePunchError = async (type: "punch-in" | "punch-out", err?: any) => {
    setScanLoading(false);
    const fresh = await refetchProfile();
    const freshLog = fresh.data?.todayAttendance;
    const alreadyDone = type === "punch-in" ? !!freshLog?.punchIn : !!freshLog?.punchOut;
    if (alreadyDone) {
      // The backend recorded the punch even though the request errored — show
      // the same success confirmation the happy path would, no error toast.
      //
      // The ONLY haptic still called by hand in this file. Everywhere else the
      // feedback rides on the toast (see lib/haptic-toast.ts); this branch
      // deliberately raises no toast, so without this the one path where the
      // employee most needs reassurance would be the one path that stays
      // silent. Adding a toast here instead would re-introduce the error
      // message this branch exists to suppress.
      void hapticSuccess();
      setScanResult({
        type,
        timeLabel: nowLabel(),
        workHoursLabel: type === "punch-out" && freshLog?.punchIn && freshLog?.punchOut
          ? formatWorkedDuration(freshLog.punchIn, freshLog.punchOut)
          : undefined,
      });
      setTimeout(() => {
        setScanType(null);
        setCapturedSelfie(null);
        setScanResult(null);
      }, 1800);
    } else {
      const rawMsg = err?.response?.data?.message as string | undefined;
      const fallback = `${type === "punch-in" ? "Punch In" : "Punch Out"} failed. Please try again.`;
      // Explicit, generous duration -- this is the one message that actually
      // explains why nothing happened (wrong location, poor accuracy, already
      // punched in…), so it must not rely on Sonner's shorter default and get
      // cut off before someone on a phone has read it.
      toast.error(rawMsg && !looksLikeRawCrash(rawMsg) ? rawMsg : fallback, { duration: 6000 });
      // A real pause before the camera reopens -- 200ms is barely enough time
      // to notice the toast even appeared, let alone read "You Are Not At
      // Office Location (Distance: 925.5 km)", before a full-screen, blurred
      // camera view comes back and draws every bit of attention away from it.
      setTimeout(() => {
        startScannerCamera();
      }, 1500);
    }
  };

  const captureScannerPhoto = async () => {
    if (videoRef.current) {
      // The punch selfie exists to verify identity, not for print-quality
      // detail -- the native camera resolution (often 1080p+ on the front
      // camera) produced a multi-megabyte data URL for every single punch,
      // which the employee's mobile data has to upload before the punch even
      // reaches the server. Capping the LONG EDGE at 480px and drawing the
      // video into an already-small canvas (so the browser downsamples during
      // the draw, rather than us shrinking a huge bitmap afterwards) keeps a
      // face perfectly recognisable at a fraction of the size; the JPEG
      // quality below does the rest.
      const MAX_DIMENSION = 480;
      const srcW = videoRef.current.videoWidth || 320;
      const srcH = videoRef.current.videoHeight || 240;
      const scale = Math.min(1, MAX_DIMENSION / Math.max(srcW, srcH));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(srcW * scale);
      canvas.height = Math.round(srcH * scale);
      const ctx = canvas.getContext("2d");
      if (ctx) {
        // Mirror horizontally to match the on-screen preview (video is shown with scale-x-[-1]).
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        // 0.6 rather than the browser default (~0.92): a selfie compresses
        // exceptionally well at this quality since it's mostly smooth
        // skin/background tones, not fine detail -- this is where most of the
        // size reduction actually comes from, on top of the resize above.
        const dataUrl = canvas.toDataURL("image/jpeg", 0.6);
        setCapturedSelfie(dataUrl);
        stopScannerCamera();

        setScanLoading(true);
        if (scanType === "punch-in") {
          punchInMutation.mutate(dataUrl, {
            onSuccess: () => {
              setScanLoading(false);
              setScanResult({ type: "punch-in", timeLabel: nowLabel() });
              setTimeout(() => {
                setScanType(null);
                setCapturedSelfie(null);
                setScanResult(null);
              }, 1800);
            },
            onError: (err) => handlePunchError("punch-in", err),
          });
        } else if (scanType === "punch-out") {
          // Auto-end lunch before punching out if employee is currently on a
          // lunch break. Calls the raw API directly, NOT lunchOutMutation --
          // this is housekeeping for a single punch-out tap, not a second
          // user action, so it must stay silent (no toast, no haptic) whether
          // it succeeds or fails. The punch-out mutation just below is the
          // one and only feedback the employee gets for this button press.
          if (todayLog?.lunchInTime && !todayLog?.lunchOutTime) {
            try {
              await postLunchOut();
            } catch {
              // Continue with punch-out even if lunch-out fails
            }
          }
          punchOutMutation.mutate(dataUrl, {
            onSuccess: (data) => {
              setScanLoading(false);
              setScanResult({ type: "punch-out", timeLabel: nowLabel(), workHoursLabel: data?.workHours ? `${data.workHours} hrs` : undefined });
              setTimeout(() => {
                setScanType(null);
                setCapturedSelfie(null);
                setScanResult(null);
              }, 1800);
            },
            onError: (err) => handlePunchError("punch-out", err),
          });
        }
      }
    }
  };

  // Open the selfie scanner. Location must already be gated by the caller.
  const openScanner = (type: "punch-in" | "punch-out") => {
    setScanType(type);
    setCapturedSelfie(null);
    setScanLoading(false);
    setTimeout(() => {
      startScannerCamera();
    }, 150);
  };

  // Entry point for Punch In / Punch Out. Office-based employees (with a branch)
  // must have a GPS fix; if we don't have one yet we actively request it (native
  // permission dialog / browser prompt) and, on failure, show the guided
  // "enable location" help instead of dead-ending. WFH / branch-less employees
  // skip the location gate entirely.
  const beginPunch = async (type: "punch-in" | "punch-out") => {
    // Acknowledge the PRESS, not the result.
    //
    // The success haptic already fires when the punch is recorded (via
    // haptic-toast), but that can be a second or more later — after a location
    // fix and a round trip. Without something at the moment of the tap the
    // button feels dead, which on the one control the whole app exists for is
    // exactly the "this is a web page" feeling. Medium impact: this is a
    // commitment, unlike navigation.
    void haptic("impactMedium");

    if (!profile?.branchId || location) {
      openScanner(type);
      return;
    }
    setPendingPunch(type);
    setLocationLoading(true);
    const result = await acquirePosition(); // actively prompts
    setLocationLoading(false);
    if (result.ok) {
      setLocation({ lat: result.coords.lat, lng: result.coords.lng });
      setLocationAccuracy(result.coords.accuracy);
      setLocationFailReason(null);
      resolveAddress(result.coords.lat, result.coords.lng).then(setAddress);
      setPendingPunch(null);
      openScanner(type);
    } else {
      setLocationFailReason(result.reason);
      if (result.reason === "timeout") {
        toast.error(`${result.message} Please try again.`);
      } else {
        setShowLocationHelp(true);
      }
    }
  };

  const getFreshLocation = async () => {
    let currentLocation = null;
    let currentAddress = "Locating...";

    let currentAccuracy: number | null = null;

    const result = await acquirePosition();
    if (result.ok) {
      currentLocation = { lat: result.coords.lat, lng: result.coords.lng };
      currentAccuracy = result.coords.accuracy;
      currentAddress = await resolveAddress(result.coords.lat, result.coords.lng);
      setLocation(currentLocation);
      setLocationAccuracy(result.coords.accuracy);
      setAddress(currentAddress);
      setLocationFailReason(null);
    } else {
      currentAddress = "Location Capturing Bypassed";
      setLocationFailReason(result.reason);
    }
    // Accuracy travels with the punch: the server refuses a fix too poor to
    // place someone, and stores the figure so a disputed punch can be judged
    // later. It was previously captured into state and then dropped here.
    return { currentLocation, currentAddress, currentAccuracy };
  };

  // Punch Mutators (Accept base64 selfie parameter)
  const punchInMutation = useMutation({
    mutationFn: async (photoArg: string) => {
      const { currentLocation, currentAddress, currentAccuracy } = await getFreshLocation();

      // A branch-less employee is remote by definition; anyone else is remote
      // only for a punch they explicitly marked Work From Home.
      const punchIsWFH = wfhForThisPunch || !profile?.branchId;

      // Office employees need a real location — null would make the backend
      // calculate Infinity distance and reject with 400. A WFH punch is not
      // measured against a branch at all, so a missing fix is not an obstacle
      // and demanding one here would block the very case the toggle exists for.
      if (!currentLocation && profile?.branchId && !punchIsWFH) {
        throw {
          response: {
            data: {
              message: "GPS location is required to punch in at your office branch. Please enable location in browser Site Settings and refresh.",
            },
          },
        };
      }

      const payload = {
        location: currentLocation,
        photo: photoArg,
        isWFH: punchIsWFH,
        address: currentAddress === "GPS permissions needed" ? "Location Capturing Bypassed" : currentAddress,
        accuracy: currentAccuracy,
        fixAt: new Date().toISOString(),
      };
      const { data } = await apiClient.post("/attendance/punch-in", payload);
      return data;
    },
    onSuccess: (data) => {
      toast.success(data.message || "Punched In Successfully!");
      queryClient.invalidateQueries({ queryKey: ["user-profile"] });
      queryClient.invalidateQueries({ queryKey: ["employee-dashboard"] });
    },
    // No toast here — handlePunchError (called from the scanner) decides what to
    // show, since a request can error while the punch still went through on the
    // backend; surfacing the raw error immediately would be misleading in that case.
  });

  const punchOutMutation = useMutation({
    mutationFn: async (photoArg: string) => {
      const { currentLocation, currentAddress, currentAccuracy } = await getFreshLocation();

      if (!currentLocation && profile?.branchId) {
        throw {
          response: {
            data: {
              message: "GPS location is required to punch out. Please enable location in browser Site Settings and refresh.",
            },
          },
        };
      }

      const payload = {
        location: currentLocation,
        photo: photoArg,
        address: currentAddress === "GPS permissions needed" ? "Location Capturing Bypassed" : currentAddress,
        accuracy: currentAccuracy,
        fixAt: new Date().toISOString(),
      };
      const { data } = await apiClient.post("/attendance/punch-out", payload);
      return data;
    },
    onSuccess: (data) => {
      toast.success(`Punched Out! Worked: ${data.workHours} hrs`);
      queryClient.invalidateQueries({ queryKey: ["user-profile"] });
      queryClient.invalidateQueries({ queryKey: ["employee-dashboard"] });
    },
    // No toast here — see punchInMutation above for why.
  });

  // Lunch Break Actions — use already-fetched location; never request new GPS permission
  const lunchInMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        location: location,
        address: (!address || address === "GPS permissions needed" || address === "Locating...")
          ? "Location Capturing Bypassed"
          : address,
        // Lunch is geofenced server-side too, so it needs the same fix
        // quality as a punch. Paired with `location` above -- both come
        // from the same captured position, so they describe one reading.
        accuracy: locationAccuracy,
        fixAt: new Date().toISOString(),
      };
      const { data } = await apiClient.post("/attendance/lunch-in", payload);
      return data;
    },
    onSuccess: () => {
      toast.success("Lunch Break Started!");
      queryClient.invalidateQueries({ queryKey: ["user-profile"] });
      queryClient.invalidateQueries({ queryKey: ["employee-dashboard"] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || "Lunch In Failed");
    }
  });

  // The raw API call, with NO toast/haptic/invalidate side effects of its
  // own. Pulled out of the mutation so the SILENT auto-close-before-punch-out
  // path (below, inside captureScannerPhoto) can call the same lunch-out
  // logic without also triggering the "End Lunch Break" button's feedback --
  // React Query runs a mutation's own onSuccess/onError regardless of whether
  // it was reached via .mutate() or .mutateAsync(), and regardless of any
  // try/catch the caller wraps around it, so reusing lunchOutMutation itself
  // for that internal call produced a SECOND haptic (and a second toast) for
  // one punch-out tap: a real "auto-close, then punch out" day felt like two
  // successes, and a failed auto-close felt like an error immediately
  // followed by a success, for what was still just one button press.
  const postLunchOut = async () => {
    const payload = {
      location: location,
      address: (!address || address === "GPS permissions needed" || address === "Locating...")
        ? "Location Capturing Bypassed"
        : address,
      // Lunch is geofenced server-side too, so it needs the same fix
      // quality as a punch. Paired with `location` above -- both come
      // from the same captured position, so they describe one reading.
      accuracy: locationAccuracy,
      fixAt: new Date().toISOString(),
    };
    const { data } = await apiClient.post("/attendance/lunch-out", payload);
    return data;
  };

  const lunchOutMutation = useMutation({
    mutationFn: postLunchOut,
    onSuccess: () => {
      toast.success("Lunch Break Completed!");
      queryClient.invalidateQueries({ queryKey: ["user-profile"] });
      queryClient.invalidateQueries({ queryKey: ["employee-dashboard"] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || "Lunch Out Failed");
    }
  });

  if (isProfileLoading || isDashboardLoading) {
    return (
      <div className="w-full space-y-6 animate-pulse">
        {/* Mobile Header Skeleton */}
        <div className="md:hidden block space-y-2 text-left">
          <div className="h-5 w-32 bg-slate-200 dark:bg-slate-800 rounded-md" />
          <div className="h-3 w-48 bg-slate-100 dark:bg-slate-800/60 rounded-md" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column Skeleton */}
          <div className="col-span-1 lg:col-span-5 space-y-5">
            {/* Today Clock Card Skeleton */}
            <div className="rounded-[24px] bg-slate-200 dark:bg-slate-800/80 p-5 h-[230px] flex flex-col justify-between">
              <div className="flex justify-between items-start">
                <div className="space-y-2">
                  <div className="h-8 w-28 bg-slate-300 dark:bg-slate-700 rounded-lg" />
                  <div className="h-4 w-20 bg-slate-300/60 dark:bg-slate-700/60 rounded-full" />
                </div>
                <div className="h-7 w-20 bg-slate-300/70 dark:bg-slate-700/70 rounded-full" />
              </div>
              <div className="h-16 w-full bg-slate-300/40 dark:bg-slate-700/40 rounded-xl" />
              <div className="h-3 w-32 bg-slate-300/60 dark:bg-slate-700/60 rounded-full mx-auto" />
            </div>

            {/* Action button skeleton */}
            <div className="h-11 w-full bg-slate-200 dark:bg-slate-800 rounded-[16px]" />

            {/* Shift progress card skeleton */}
            <div className="p-4 bg-slate-200 dark:bg-slate-800/40 rounded-[18px] space-y-3">
              <div className="flex justify-between items-center">
                <div className="h-3.5 w-24 bg-slate-300 dark:bg-slate-700 rounded-md" />
                <div className="h-4 w-10 bg-slate-300 dark:bg-slate-700 rounded-full" />
              </div>
              <div className="h-2 w-full bg-slate-300/60 dark:bg-slate-700/60 rounded-full" />
              <div className="flex justify-between items-center">
                <div className="h-3 w-16 bg-slate-300 dark:bg-slate-700 rounded-md" />
                <div className="h-3 w-20 bg-slate-300 dark:bg-slate-700 rounded-md" />
              </div>
            </div>
          </div>

          {/* Right Column Skeleton */}
          <div className="col-span-1 lg:col-span-7 space-y-5">
            {/* Calendar Navigator Skeleton */}
            <div className="h-12 w-full bg-slate-200 dark:bg-slate-800 rounded-[18px]" />

            {/* 4 Stats Cards Grid Skeleton */}
            <div className="grid grid-cols-2 gap-4">
              <div className="h-[135px] bg-slate-200 dark:bg-slate-800/80 rounded-[20px]" />
              <div className="h-[135px] bg-slate-200 dark:bg-slate-800/80 rounded-[20px]" />
              <div className="h-[135px] bg-slate-200 dark:bg-slate-800/80 rounded-[20px]" />
              <div className="h-[135px] bg-slate-200 dark:bg-slate-800/80 rounded-[20px]" />
            </div>

            {/* Salary card skeleton */}
            <div className="h-[100px] bg-slate-200 dark:bg-slate-800 rounded-[20px]" />

            {/* Compliance card skeleton */}
            <div className="h-[90px] bg-slate-200 dark:bg-slate-800 rounded-[20px]" />

            {/* Holidays card skeleton */}
            <div className="h-[130px] bg-slate-200 dark:bg-slate-800 rounded-[20px]" />
          </div>
        </div>
      </div>
    );
  }

  const formatElapsed = (totalSecs: number) => {
    const h = Math.floor(totalSecs / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    const s = totalSecs % 60;
    return `${h.toString().padStart(2, '0')}h ${m.toString().padStart(2, '0')}m ${s.toString().padStart(2, '0')}s`;
  };

  // Final worked duration for a completed shift (punch-in to punch-out), stable across refresh.
  const formatWorkedDuration = (punchIn?: string, punchOut?: string) => {
    if (!punchIn || !punchOut) return "00h 00m";
    const diffSecs = Math.max(0, Math.floor((new Date(punchOut).getTime() - new Date(punchIn).getTime()) / 1000));
    const h = Math.floor(diffSecs / 3600);
    const m = Math.floor((diffSecs % 3600) / 60);
    return `${h.toString().padStart(2, '0')}h ${m.toString().padStart(2, '0')}m`;
  };

  // Duration for a calendar/list day record — ticks live off `time` for an
  // in-progress shift, otherwise uses the stored punch-out timestamp.
  const formatDuration = (record: AttendanceLog) => {
    if (!record.punchIn) return "00h 00m";
    const endTime = record.punchOut ? new Date(record.punchOut) : time;
    const diff = endTime.getTime() - new Date(record.punchIn).getTime();
    if (diff <= 0) return "00h 00m";
    const hrs = Math.floor(diff / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return `${hrs.toString().padStart(2, '0')}h ${mins.toString().padStart(2, '0')}m`;
  };

  // Days-of-month grid helper for the Interactive Calendar Map
  const getDaysInMonth = (d: Date) => {
    const year = d.getFullYear();
    const month = d.getMonth();
    const date = new Date(year, month, 1);
    const days: (Date | null)[] = [];
    const firstDayIndex = date.getDay();
    for (let i = 0; i < firstDayIndex; i++) {
      days.push(null);
    }
    while (date.getMonth() === month) {
      days.push(new Date(date));
      date.setDate(date.getDate() + 1);
    }
    return days;
  };

  const getDayRecord = (day: Date | null) => {
    if (!day || !historyData?.history) return null;
    const dateString = day.toDateString();
    return historyData.history.find(log => new Date(log.date).toDateString() === dateString);
  };

  const getShiftPercent = () => {
    let totalShiftSecs = 9 * 3600; // Fallback 9 hours
    if (profile?.shiftId?.startTime && profile?.shiftId?.endTime) {
      const [startH, startM] = profile.shiftId.startTime.split(':').map(Number);
      const [endH, endM] = profile.shiftId.endTime.split(':').map(Number);
      let diffHours = endH - startH;
      let diffMins = endM - startM;
      if (diffHours < 0) diffHours += 24;
      totalShiftSecs = (diffHours * 3600) + (diffMins * 60);
    }
    if (totalShiftSecs <= 0) totalShiftSecs = 9 * 3600;
    return Math.min(100, (elapsedSeconds / totalShiftSecs) * 100);
  };

  // Time formatter.
  //
  // hour12 is explicit rather than left to the handset: without it this follows
  // the device locale while the clock above it is fixed, so the same screen
  // could show "02:56 PM" beside "14:41" on one phone and agree on another.
  const formatTimeStr = (isoString?: string) => {
    if (!isoString) return "--";
    return new Date(isoString).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true });
  };

  // Month navigation (does not allow going into the future)
  const changeMonth = (offset: number) => {
    const next = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + offset, 1);
    const today = new Date();
    const currentMonthFirst = new Date(today.getFullYear(), today.getMonth(), 1);
    if (next <= currentMonthFirst) {
      setSelectedDate(next);
    }
  };

  // Backend-powered dynamic statistics calculations
  const stats = {
    present: dashboardData?.monthlyStats?.present ?? 0,
    absent: dashboardData?.monthlyStats?.absent ?? 0,
    wfh: dashboardData?.monthlyStats?.wfh ?? 0,
    halfDay: dashboardData?.monthlyStats?.halfDays ?? 0,
  };

  // Punctuality rating calculation based on backend statistics
  const lateDays = dashboardData?.monthlyStats?.late ?? 0;
  const presentDays = stats.present + stats.halfDay;
  const onTimeDays = Math.max(0, stats.present - lateDays);
  const complianceScore = presentDays > 0
    ? Math.round((onTimeDays / presentDays) * 100)
    : 100;

  const todayVal = new Date();
  const isCurrentMonth = selectedDate.getFullYear() === todayVal.getFullYear() && selectedDate.getMonth() === todayVal.getMonth();

  const initials = (profile?.name ?? "User").split(" ").map((s) => s[0]).slice(0, 2).join("");

  const calendarDays = getDaysInMonth(selectedDate);
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const filteredLogs = historyData?.history?.filter(log => {
    if (statusFilter === "all") return true;
    if (statusFilter === "present") return log.status === "present";
    if (statusFilter === "late") return log.status === "late";
    if (statusFilter === "absent") return log.status === "absent";
    if (statusFilter === "wfh") return log.isWFH === true;
    return true;
  }) || [];

  return (
    <div className="w-full space-y-6">
      {/* Keyframe scanner animation stylesheet */}
      <style>{`
        @keyframes scanMotion {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(224px); }
        }
        .scanner-line {
          animation: scanMotion 2.2s infinite ease-in-out;
        }
      `}</style>

      {/* Mobile Title */}
      <div className="md:hidden block text-left">
        <h2 className="text-[17px] font-semibold text-slate-800 dark:text-slate-100">Attendance Portal</h2>
        <p className="text-[11px] text-slate-500">Track and manage your workspace hours.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

        {/* LEFT COLUMN: Premium Clock Card, Actions & Shift Progress */}
        <div className="col-span-1 lg:col-span-5 space-y-5">

          {/* Today's Ticking Clock Plum-Burgundy Card */}
          <div className="rounded-[24px] overflow-hidden bg-gradient-to-br from-[#2D061A] via-[#501537] to-[#8C2059] text-white p-5 shadow-xl relative border border-white/10">
            <div className="absolute inset-0 bg-radial-at-t from-white/10 to-transparent pointer-events-none" />

            <div className="relative z-10 flex flex-col gap-4">
              {/* Header inside clock card */}
              <div className="flex items-start justify-between">
                <div className="text-left">
                  <h3 className="text-4xl font-semibold tracking-tight text-white drop-shadow-sm">
                    {time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true })}
                  </h3>
                  <div className="flex items-center gap-2 mt-1.5">
                    <Badge className={`border-none px-2.5 py-0.5 text-[8px] font-bold uppercase tracking-wider rounded-full shadow-xs ${isPunchedIn && !isPunchedOut
                      ? "bg-emerald-500 text-white animate-pulse"
                      : "bg-white/15 text-white/90"
                      }`}>
                      {isPunchedIn && !isPunchedOut ? "PUNCHED IN" : "NOT PUNCHED IN"}
                    </Badge>
                  </div>
                </div>

                {/* Date on the right */}
                <div className="flex items-center gap-2">
                  <div className="text-right">
                    <span className="text-[11px] font-bold text-white/90 tracking-wide uppercase block">TODAY</span>
                    <span className="text-[9.5px] text-white/60 font-semibold block mt-0.5">
                      {time.toLocaleDateString("en-US", { day: "numeric", month: "short", weekday: "short" })}
                    </span>
                  </div>
                  <button className="h-7 w-7 rounded-full border border-white/15 bg-white/10 flex items-center justify-center hover:bg-white/20 transition-all text-white/80 shrink-0">
                    <Clock className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Inner status grid card */}
              <div className="p-4 rounded-[18px] bg-black/15 border border-white/10 backdrop-blur-md flex items-center gap-4">
                {/* User avatar */}
                <Avatar className="h-14 w-14 ring-2 ring-white/10 shrink-0 shadow-md">
                  <AvatarImage
                    src={profile?.profileImage
                      ? (profile.profileImage.startsWith('http')
                        ? profile.profileImage
                        : `${IMAGE_BASE_URL}${profile.profileImage}`)
                      : undefined}
                    className="object-cover"
                  />
                  <AvatarFallback className="bg-gradient-to-br from-[#8C2059] to-[#501537] text-white font-semibold text-base">
                    {initials}
                  </AvatarFallback>
                </Avatar>

                {/* 2x2 grid with exact light weight / size requirements */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 flex-1 text-left">
                  <div>
                    <span className="text-[8px] font-semibold text-white/40 uppercase tracking-wider block">PUNCH-IN</span>
                    <span className="text-[13.5px] font-medium text-white block mt-0.5">
                      {formatTimeStr(todayLog?.punchIn)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[8px] font-semibold text-white/40 uppercase tracking-wider block">PUNCH-OUT</span>
                    <span className="text-[13.5px] font-medium text-white block mt-0.5">
                      {formatTimeStr(displayPunchOut)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[7.5px] font-semibold text-white/30 uppercase tracking-wider block">LUNCH-IN</span>
                    <span className="text-[11.5px] font-normal text-white/80 block mt-0.5">
                      {formatTimeStr(displayLunchInTime)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[7.5px] font-semibold text-white/30 uppercase tracking-wider block">LUNCH-OUT</span>
                    <span className="text-[11.5px] font-normal text-white/80 block mt-0.5">
                      {formatTimeStr(displayLunchOutTime)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Each in/out pair for today. Hidden on a single-session day —
                  the grid above already says it. */}
              <TodaySessions sessions={todaySessions} />

              {/* Selfie previews of today's attendance */}
              {(todayLog?.punchInPhoto || todayLog?.punchOutPhoto) && (
                <div className="flex items-center justify-start gap-3 p-2 bg-white/5 rounded-xl border border-white/5">
                  {todayLog.punchInPhoto && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-[7.5px] font-semibold text-white/40 uppercase tracking-wider">In:</span>
                      <div className="h-5 w-8 rounded overflow-hidden border border-white/10 relative shadow-xs">
                        <img
                          src={todayLog.punchInPhoto.startsWith('http') ? todayLog.punchInPhoto : `${IMAGE_BASE_URL}${todayLog.punchInPhoto}`}
                          alt="Punch In selfie"
                          className="w-full h-full object-cover"
                        />
                      </div>
                    </div>
                  )}
                  {todayLog.punchOutPhoto && (
                    <div className="flex items-center gap-1.5 border-l border-white/10 pl-2">
                      <span className="text-[7.5px] font-semibold text-white/40 uppercase tracking-wider">Out:</span>
                      <div className="h-5 w-8 rounded overflow-hidden border border-white/10 relative shadow-xs">
                        <img
                          src={todayLog.punchOutPhoto.startsWith('http') ? todayLog.punchOutPhoto : `${IMAGE_BASE_URL}${todayLog.punchOutPhoto}`}
                          alt="Punch Out selfie"
                          className="w-full h-full object-cover"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Location indicator.
                  Three states, not two. Waiting is not failing — see
                  locationProbed. And a timeout is not a block: telling someone
                  to go and enable a permission they already granted sends them
                  into Settings to change nothing. */}
              <div className="flex items-center justify-center gap-1.5 text-[9px] pt-0.5">
                {!location && (!locationProbed || locationLoading) ? (
                  <>
                    <Loader2 className="h-3 w-3 shrink-0 animate-spin text-white/70" />
                    <span className="font-medium truncate text-white/70">Checking your location…</span>
                  </>
                ) : !location ? (
                  <>
                    <MapPin className="h-3 w-3 shrink-0 text-red-400" />
                    <button
                      onClick={() => (locationFailReason === "timeout" ? void refreshLocation() : setShowLocationHelp(true))}
                      className="font-semibold text-red-400 underline underline-offset-2 truncate"
                    >
                      {locationFailReason === "timeout"
                        ? "Couldn't get a fix — tap to retry"
                        : locationFailReason === "unavailable"
                          ? "GPS is off — tap to turn it on"
                          : "Location blocked — tap to enable GPS"}
                    </button>
                  </>
                ) : (
                  <>
                    <MapPin className="h-3 w-3 shrink-0 text-white/80" />
                    <span className="font-medium truncate text-white/60">{address}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Dynamic Primary Actions Card */}
          <div className="space-y-3">
            {/* First-run gate. Punching in is withheld until this phone can
                actually record location in the background, because the failure
                it prevents is SILENT: punch in with "While using the app" and
                recording stops as soon as the screen locks, with nobody finding
                out until the hours are already missing.

                Only ever shown when the device can satisfy it -- a browser, a
                PWA, or an APK predating the tracker plugin reports
                applicable:false and punches in exactly as before, so shipping
                this cannot lock out anyone already working. */}
            {/* Offline comes FIRST, ahead of every punch action.
                A punch needs the server: it is timestamped there and checked
                against the geofence there. Offline it cannot succeed, so
                letting the button be pressed only produces a failure toast the
                employee has to interpret. Saying why up front is the whole
                difference between "the app is broken" and "I need signal".
                Note this hides lunch and punch-out too, which is deliberate --
                none of them can reach the server either. */}
            {/* A build the publisher has declared unsafe for attendance. Sits
                beside the offline case rather than anywhere else, because both
                answer the same question -- can this person record a punch right
                now -- and splitting that across two places is how one of them
                ends up forgotten. The rest of the app stays open to them. */}
            {apkBlocking ? (
              <div className="w-full rounded-[16px] border border-destructive/20 bg-destructive/5 px-4 py-3.5 text-center">
                <div className="mb-1 flex items-center justify-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-destructive" />
                  <span className="text-[12px] font-bold text-destructive">App update required</span>
                </div>
                <p className="text-[11px] leading-relaxed text-destructive/80">
                  Punching is turned off until you install the latest app version. Open the update
                  prompt to download it.
                </p>
              </div>
            ) : !isOnline ? (
              <div className="w-full rounded-[16px] border border-amber-200 bg-amber-50/80 px-4 py-3.5 text-center dark:border-amber-500/20 dark:bg-amber-500/10">
                <div className="mb-1 flex items-center justify-center gap-2">
                  <CloudOff className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  <span className="text-[12px] font-bold text-amber-900 dark:text-amber-200">
                    Connect to the internet
                  </span>
                </div>
                <p className="text-[11px] leading-relaxed text-amber-800/80 dark:text-amber-200/70">
                  You need a connection to punch in or out. Your location is still being
                  recorded and will upload by itself.
                </p>
              </div>
            ) : locationBlocked ? (
              // Gates ALL FOUR actions -- punch in, punch out, start and end
              // lunch -- because every one of them is geofenced server-side and
              // would be refused anyway. Better to say so here than to let
              // someone tap, wait, and read a rejection.
              //
              // A panel rather than disabled buttons, for the reason given on
              // the shift-ended branch below: a greyed-out control explains
              // nothing, and the employee's real question is "why can I not
              // punch". This names the cause and opens the fix.
              <div className="p-4 rounded-[18px] bg-red-500/10 border border-red-500/20 text-center space-y-2.5">
                <div className="flex items-center justify-center gap-2">
                  <MapPin className="h-4 w-4 text-red-600 dark:text-red-400" />
                  <span className="text-[12px] font-bold text-red-900 dark:text-red-200">
                    {locationFailReason === "unavailable"
                      ? "Turn on GPS to punch"
                      : locationFailReason === "unsupported"
                        ? "This device cannot share location"
                        : "Allow location to punch"}
                  </span>
                </div>
                <p className="text-[11px] leading-relaxed text-red-800/80 dark:text-red-200/70">
                  {locationFailReason === "unavailable"
                    ? "Your attendance is recorded against your branch, so location has to be on before you can punch in or out."
                    : locationFailReason === "unsupported"
                      ? "Ask your admin to record today through Attendance Regularization — your work still counts."
                      : "Location permission is off for this app, so punches cannot be verified against your branch."}
                </p>
                {locationFailReason !== "unsupported" && (
                  <Button
                    onClick={() => setShowLocationHelp(true)}
                    className="w-full h-10 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-[14px] border-none text-xs tracking-wider"
                  >
                    {locationFailReason === "unavailable" ? "Turn on location" : "Enable location"}
                  </Button>
                )}
              </div>
            ) : !isPunchedIn && shiftIsOver ? (
              // A greyed-out button explains nothing -- same reasoning as the
              // session-limit panel further down. The employee's real question
              // is "why can I not punch in", and the answer names the time and
              // the way to fix it.
              <div className="p-4 rounded-[18px] bg-slate-500/10 border border-slate-500/20 text-center space-y-1">
                <p className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                  {profile?.shiftId?.name ? `${profile.shiftId.name} shift` : "Your shift"} ended at{" "}
                  {formatShiftTime(profile?.shiftId?.endTime)}
                </p>
                <p className="text-[10px] leading-relaxed text-slate-600/80 dark:text-slate-400/80">
                  Punch-in is closed for today. If you worked, ask your admin to add it
                  through Attendance Regularization &mdash; your work still counts.
                </p>
              </div>
            ) : !isPunchedIn && trackingSetup.applicable && !trackingSetup.ready ? (
              <TrackingSetupGate setup={trackingSetup} />
            ) : !isPunchedIn ? (
              // Not punched in: Primary "Punch In" button (opens location consent and map verification popup first)
              <Button
                onClick={() => {
                  if (!location) {
                    refreshLocation();
                  }
                  setShowLocationVerification(true);
                }}
                className="w-full h-11 bg-gradient-to-r from-[#501537] to-[#7B2453] hover:from-[#6B1C4B] hover:to-[#912D64] text-white font-semibold rounded-[16px] shadow-md border-none flex items-center justify-center gap-2 active:scale-98 cursor-pointer transition-all duration-300 text-xs tracking-wider relative overflow-hidden group"
              >
                <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                {/* iOS only, and only because a real finger must touch the
                    control -- see components/shared/haptic-overlay.tsx. The tap
                    bubbles on to this button's own onClick unchanged. */}
                <HapticOverlay radius="16px" />
                <Fingerprint className="h-4.5 w-4.5 text-white group-hover:scale-110 transition-transform duration-300" />
                <span>Punch In</span>
              </Button>
            ) : !isPunchedOut ? (
              // Punched in, not punched out
              <div className="flex flex-col gap-3">
                {/* Lunch states layout */}
                {!displayLunchInTime ? (
                  // Punched In but hasn't started lunch: Can start lunch OR punch out
                  <div className="grid grid-cols-2 gap-3">
                    <Button
                      onClick={() => beginPunch("punch-out")}
                      className="relative h-11 bg-gradient-to-r from-rose-600 to-red-500 hover:from-rose-700 hover:to-red-600 text-white font-semibold rounded-[16px] shadow-xs border-none flex items-center justify-center gap-2 active:scale-98 cursor-pointer transition-all text-xs tracking-wider"
                    >
                      <HapticOverlay radius="16px" />
                      <Fingerprint className="h-4 w-4 text-white" />
                      <span>Punch Out</span>
                    </Button>
                    <Button
                      onClick={() => lunchInMutation.mutate()}
                      disabled={lunchInMutation.isPending}
                      className="relative h-11 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-semibold rounded-[16px] shadow-xs border-none flex items-center justify-center gap-2 active:scale-98 cursor-pointer transition-all text-xs tracking-wider"
                    >
                      <HapticOverlay radius="16px" />
                      {lunchInMutation.isPending ? (
                        <RefreshCw className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Coffee className="h-4 w-4 text-white" />
                          <span>Start Lunch</span>
                        </>
                      )}
                    </Button>
                  </div>
                ) : !displayLunchOutTime ? (
                  // Currently on lunch: Must end lunch break
                  <Button
                    onClick={() => lunchOutMutation.mutate()}
                    disabled={lunchOutMutation.isPending}
                    className="relative w-full h-11 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-semibold rounded-[16px] shadow-md border-none flex items-center justify-center gap-2 active:scale-98 cursor-pointer transition-all duration-300 text-xs tracking-wider"
                  >
                    <HapticOverlay radius="16px" />
                    {lunchOutMutation.isPending ? (
                      <RefreshCw className="h-4.5 w-4.5 animate-spin" />
                    ) : (
                      <>
                        <Coffee className="h-4.5 w-4.5 text-white" />
                        <span>End Lunch Break</span>
                      </>
                    )}
                  </Button>
                ) : (
                  // Lunch completed: Only Punch Out button is available
                  <Button
                    onClick={() => beginPunch("punch-out")}
                    className="relative w-full h-11 bg-gradient-to-r from-rose-600 to-red-500 hover:from-rose-700 hover:to-red-600 text-white font-semibold rounded-[16px] shadow-md border-none flex items-center justify-center gap-2 active:scale-98 cursor-pointer transition-all duration-300 text-xs tracking-wider group"
                  >
                    <HapticOverlay radius="16px" />
                    <Fingerprint className="h-4.5 w-4.5 text-white group-hover:scale-110 transition-transform duration-300" />
                    <span>Punch Out</span>
                  </Button>
                )}

                {/* Real-time progress bar of the shift */}
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-4 bg-white dark:bg-slate-900/50 backdrop-blur-md rounded-[18px] border border-slate-100 dark:border-white/5 shadow-xs space-y-2.5"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-emerald-500" />
                      <span className="text-[9.5px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Shift Progress</span>
                    </div>
                    <Badge variant="outline" className="text-[8.5px] font-bold tracking-widest bg-emerald-500/10 text-emerald-500 border-none px-2 py-0.5 rounded-full">
                      {Math.round(getShiftPercent())}%
                    </Badge>
                  </div>

                  {/* Progress track */}
                  <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-300"
                      style={{ width: `${getShiftPercent()}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[9.5px] font-medium">
                    <span className="text-slate-500 dark:text-slate-400">Total Worked:</span>
                    <span className="text-slate-700 dark:text-slate-200 font-mono font-semibold">{formatElapsed(elapsedSeconds)}</span>
                  </div>
                </motion.div>
              </div>
            ) : (
              // Punched out today
              <div className="flex flex-col gap-3">
                <div className="p-4 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-[18px] border border-emerald-500/20 text-center font-semibold text-xs flex items-center justify-center gap-2 shadow-xs">
                  <CheckCircle className="h-4.5 w-4.5 text-emerald-500" />
                  <span>Today's Shift Successfully Completed!</span>
                </div>

                {/* Final worked hours — computed from stored punch times, so it stays correct on refresh */}
                <div className="p-4 bg-white dark:bg-slate-900/50 backdrop-blur-md rounded-[18px] border border-slate-100 dark:border-white/5 shadow-xs flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-emerald-500" />
                    <span className="text-[9.5px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Total Worked Today</span>
                  </div>
                  <span className="text-[13px] font-mono font-bold text-slate-700 dark:text-slate-200">
                    {formatWorkedDuration(todayLog?.punchIn, displayPunchOut)}
                  </span>
                </div>

                {profile?.allowMultiplePunches && sessionsLeft <= 0 ? (
                  // A greyed-out button explains nothing. The employee's actual
                  // question is "why can I not punch in again", and only an
                  // admin can resolve it, so say that instead of leaving a dead
                  // control on screen.
                  <div className="p-4 rounded-[18px] bg-amber-500/10 border border-amber-500/20 text-center space-y-1">
                    <p className="text-[11px] font-bold text-amber-700 dark:text-amber-400">
                      Daily limit of {maxSessions} sessions reached
                    </p>
                    <p className="text-[10px] leading-relaxed text-amber-700/80 dark:text-amber-400/80">
                      Today's hours are still recorded in full. Ask your admin if you need another session.
                    </p>
                  </div>
                ) : profile?.allowMultiplePunches && shiftIsOver ? (
                  // Day already closed and the shift is over: no further
                  // session can be opened, so say so rather than offering a
                  // button the server will refuse.
                  <div className="p-4 rounded-[18px] bg-slate-500/10 border border-slate-500/20 text-center space-y-1">
                    <p className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                      Shift ended at {formatShiftTime(profile?.shiftId?.endTime)}
                    </p>
                    <p className="text-[10px] leading-relaxed text-slate-600/80 dark:text-slate-400/80">
                      Today's hours are recorded in full. Ask your admin if you need another session.
                    </p>
                  </div>
                ) : profile?.allowMultiplePunches ? (
                  <Button
                    onClick={() => setConfirmNewSession(true)}
                    className="w-full h-11 bg-gradient-to-r from-[#501537] to-[#7B2453] hover:from-[#6B1C4B] hover:to-[#912D64] text-white font-semibold rounded-[16px] shadow-md border-none flex items-center justify-center gap-2 active:scale-98 cursor-pointer transition-all duration-300 text-xs tracking-wider relative overflow-hidden group"
                  >
                    <Fingerprint className="h-4.5 w-4.5 text-white group-hover:scale-110 transition-transform duration-300" />
                    <span>Punch In For Next Shift</span>
                  </Button>
                ) : null}
              </div>
            )}
          </div>

          {/* Every punch today, in order, with how far from the branch each one
              was taken. The distance is what makes a disputed punch checkable
              instead of a matter of recollection. */}
          <TodayActivity sessions={todaySessions} branchName={profile?.branchId?.name} />

        </div>

        {/* RIGHT COLUMN: Calendar Month Navigator, Attendance Gauges & Salary Cards */}
        <div className="col-span-1 lg:col-span-7 space-y-5">

          {/* Month Selector header (Perfectly synchronized style with History) */}
          <div className="flex items-center justify-between bg-white dark:bg-slate-900 px-6 py-4.5 rounded-2xl shadow-xs border border-slate-100/50 dark:border-slate-800/20">
            <button
              onClick={() => changeMonth(-1)}
              className="text-[#501537] dark:text-[#7B2453] hover:bg-[#501537]/5 dark:hover:bg-[#7B2453]/10 p-2 rounded-xl transition-all cursor-pointer"
            >
              <ChevronLeft className="h-5 w-5 stroke-[3px]" />
            </button>

            <h4 className="font-black text-sm text-slate-750 dark:text-white uppercase tracking-wider">
              {selectedDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })} Summary
            </h4>

            <button
              onClick={() => changeMonth(1)}
              disabled={isCurrentMonth}
              className={`text-[#501537] dark:text-[#7B2453] p-2 rounded-xl transition-all ${isCurrentMonth
                ? "opacity-30 cursor-not-allowed"
                : "hover:bg-[#501537]/5 dark:hover:bg-[#7B2453]/10 cursor-pointer"
                }`}
            >
              <ChevronRight className="h-5 w-5 stroke-[3px]" />
            </button>
          </div>

          {/* Stat Cards Grid (Curated, harmonized and modern HSL glassmorphism) */}
          <div className="grid grid-cols-2 gap-4">

            {/* PRESENT CARD */}
            <div className="bg-white dark:bg-slate-900/40 backdrop-blur-md border border-slate-100 dark:border-white/5 rounded-[24px] p-5 shadow-xs hover:shadow-md transition-all duration-300 flex flex-col justify-between h-[135px] relative text-left group overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-tr from-purple-500/5 to-transparent pointer-events-none" />
              <div className="flex items-start justify-between relative z-10">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-[#501537] dark:text-[#8C2059]">Present</span>
                </div>
                {/* Purple calendar icon */}
                <div className="h-7 w-7 rounded-xl bg-purple-50 dark:bg-purple-950/20 text-[#501537] dark:text-[#8C2059] flex items-center justify-center shrink-0">
                  <Calendar className="h-3.5 w-3.5" />
                </div>
              </div>

              <div className="mt-1 relative z-10">
                <span className="text-3xl font-black text-slate-800 dark:text-white leading-none font-sans tracking-tight">{stats.present}</span>
                <span className="text-[9px] text-slate-400 dark:text-slate-500 block font-medium mt-1">Days Logged</span>
              </div>

              {/* Thick bottom progress bar */}
              <div className="w-full mt-2 relative z-10">
                <div className="w-full h-1.5 bg-purple-100 dark:bg-purple-950/20 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[#501537] to-[#8C2059] rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, (stats.present / 24) * 100)}%` }}
                  />
                </div>
              </div>
            </div>

            {/* ABSENT CARD */}
            <div className="bg-white dark:bg-slate-900/40 backdrop-blur-md border border-slate-100 dark:border-white/5 rounded-[24px] p-5 shadow-xs hover:shadow-md transition-all duration-300 flex flex-col justify-between h-[135px] relative text-left group overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-tr from-rose-500/5 to-transparent pointer-events-none" />
              <div className="flex items-start justify-between relative z-10">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-rose-500">Absent</span>
                </div>
                {/* Rose icon badge */}
                <div className="h-7 w-7 rounded-xl bg-rose-50 dark:bg-rose-950/20 text-rose-500 flex items-center justify-center shrink-0">
                  <AlertTriangle className="h-3.5 w-3.5" />
                </div>
              </div>

              <div className="mt-1 flex items-end justify-between relative z-10">
                <div>
                  <span className="text-3xl font-black text-slate-800 dark:text-white leading-none font-sans tracking-tight">{stats.absent}</span>
                  <span className="text-[9px] text-slate-400 dark:text-slate-500 block font-medium mt-1">Unexcused</span>
                </div>
                <CircularProgress
                  value={stats.absent}
                  max={6}
                  color="#EF4444"
                  trackColor="rgba(239, 68, 68, 0.1)"
                  size={44}
                />
              </div>

              <div className="w-full mt-2 relative z-10">
                <div className="w-full h-1.5 bg-rose-100 dark:bg-rose-950/20 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-rose-500 to-red-400 rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, (stats.absent / 6) * 100)}%` }}
                  />
                </div>
              </div>
            </div>

            {/* WFHs CARD */}
            <div className="bg-white dark:bg-slate-900/40 backdrop-blur-md border border-slate-100 dark:border-white/5 rounded-[24px] p-5 shadow-xs hover:shadow-md transition-all duration-300 flex flex-col justify-between h-[135px] relative text-left group overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-tr from-emerald-500/5 to-transparent pointer-events-none" />
              <div className="flex items-start justify-between relative z-10">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">WFH</span>
                </div>
                {/* Green Home Icon Badge */}
                <div className="h-7 w-7 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 text-emerald-500 flex items-center justify-center shrink-0">
                  <Home className="h-3.5 w-3.5" />
                </div>
              </div>

              <div className="mt-1 flex items-end justify-between relative z-10">
                <div>
                  <span className="text-3xl font-black text-slate-800 dark:text-white leading-none font-sans tracking-tight">{stats.wfh}</span>
                  <span className="text-[9px] text-slate-400 dark:text-slate-500 block font-medium mt-1">Remote</span>
                </div>
                <CircularProgress
                  value={stats.wfh}
                  max={10}
                  color="#10B981"
                  trackColor="rgba(16, 185, 129, 0.1)"
                  size={44}
                />
              </div>

              <div className="w-full mt-2 relative z-10">
                <div className="w-full h-1.5 bg-emerald-100 dark:bg-emerald-950/20 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, (stats.wfh / 10) * 100)}%` }}
                  />
                </div>
              </div>
            </div>

            {/* HALF DAYS CARD */}
            <div className="bg-white dark:bg-slate-900/40 backdrop-blur-md border border-slate-100 dark:border-white/5 rounded-[24px] p-5 shadow-xs hover:shadow-md transition-all duration-300 flex flex-col justify-between h-[135px] relative text-left group overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-tr from-blue-500/5 to-transparent pointer-events-none" />
              <div className="flex items-start justify-between relative z-10">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-blue-600">Half Day</span>
                </div>
                {/* Blue Clock Icon Badge */}
                <div className="h-7 w-7 rounded-xl bg-blue-50 dark:bg-blue-950/20 text-blue-500 flex items-center justify-center shrink-0">
                  <Clock className="h-3.5 w-3.5" />
                </div>
              </div>

              <div className="mt-1 flex items-end justify-between relative z-10">
                <div>
                  <span className="text-3xl font-black text-slate-800 dark:text-white leading-none font-sans tracking-tight">{stats.halfDay}</span>
                  <span className="text-[9px] text-slate-400 dark:text-slate-500 block font-medium mt-1">Short Shift</span>
                </div>
                <CircularProgress
                  value={stats.halfDay}
                  max={6}
                  color="#3B82F6"
                  trackColor="rgba(59, 130, 246, 0.1)"
                  size={44}
                />
              </div>

              <div className="w-full mt-2 relative z-10">
                <div className="w-full h-1.5 bg-blue-100 dark:bg-blue-950/20 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-sky-400 rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, (stats.halfDay / 6) * 100)}%` }}
                  />
                </div>
              </div>
            </div>

          </div>

          {/* SALARY CARD */}
          <Card className="border border-slate-100 dark:border-white/5 shadow-xs bg-white dark:bg-slate-900 rounded-[20px] overflow-hidden text-left relative group">
            <div className="absolute top-0 left-0 w-1.5 h-full bg-amber-500" />
            <CardContent className="p-4 flex items-center justify-between gap-4">
              <div className="space-y-1 flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <Badge className="bg-amber-100 dark:bg-amber-950/25 text-amber-600 dark:text-amber-550 font-bold text-[8px] uppercase tracking-wider border-none">
                    SALARY
                  </Badge>
                  {currentMonthSalary && (
                    <Badge className={`border-none font-semibold text-[8px] px-1.5 py-0.5 uppercase tracking-wider rounded-md ${currentMonthSalary.status === "paid"
                      ? "bg-emerald-500/10 text-emerald-500"
                      : "bg-amber-500/10 text-amber-555"
                      }`}>
                      {currentMonthSalary.status}
                    </Badge>
                  )}
                </div>

                <h4 className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mt-1">
                  {selectedDate.toLocaleDateString("en-US", { month: "long" })} Earnings
                  {dashboardData?.salary?.isMTD === true && (
                    <span className="ml-1.5 text-[8px] bg-blue-100 text-blue-600 rounded px-1 py-0.5 font-bold normal-case">MTD</span>
                  )}
                  {dashboardData?.salary?.isMTD === false && (
                    <span className="ml-1.5 text-[8px] bg-emerald-100 text-emerald-600 rounded px-1 py-0.5 font-bold normal-case">Final</span>
                  )}
                </h4>

                <div className="flex items-baseline gap-1.5 mt-0.5">
                  <span className="text-2xl font-semibold text-slate-800 dark:text-white leading-none font-sans">
                    ₹{(currentMonthSalary
                      ? currentMonthSalary.totalSalary
                      : (dashboardData?.salary?.estimatedEarnings ?? profile?.salary ?? 0)
                    ).toLocaleString()}
                  </span>
                  <span className="text-[9.5px] text-slate-400 font-medium uppercase tracking-wider">
                    {currentMonthSalary?.employmentType || profile?.employmentType || "monthly"}
                  </span>
                </div>

                {/* Projected full-month salary when engine is active and in MTD mode */}
                {!currentMonthSalary && dashboardData?.salary?.projectedFull != null && dashboardData?.salary?.isMTD && (
                  <p className="text-[8.5px] text-slate-400 font-medium mt-0.5">
                    Projected full month: ₹{dashboardData.salary.projectedFull.toLocaleString()}
                  </p>
                )}

                {dashboardData?.salary?.needsReview && (
                  <p className="text-[8.5px] text-amber-500 font-semibold mt-0.5">
                    ⚠ Payroll flagged for review
                  </p>
                )}

                {currentMonthSalary?.remarks ? (
                  <p className="text-[8.5px] text-slate-400 font-medium truncate mt-1">
                    {currentMonthSalary.remarks}
                  </p>
                ) : (
                  <p className="text-[8.5px] text-slate-400 font-medium truncate mt-1">
                    Estimated · {dashboardData?.salary?.remarks || "prorated by attendance"}
                  </p>
                )}
              </div>

              {/* Wallet/Money logo icon */}
              <div className="h-10 w-10 rounded-xl bg-amber-500/10 text-amber-550 flex items-center justify-center shrink-0">
                <Award className="h-5 w-5 text-amber-500" />
              </div>
            </CardContent>
          </Card>

          {/* COMPLIANCE RATING */}
          <Card className="border border-slate-100 dark:border-white/5 shadow-xs bg-gradient-to-r from-[#200514] via-[#501537] to-[#1C1635] text-white rounded-[20px] overflow-hidden relative group">
            <div className="absolute inset-0 bg-radial-at-t from-white/5 to-transparent pointer-events-none" />
            <CardContent className="p-4 flex items-center justify-between gap-6 relative z-10">
              <div className="space-y-1 flex-1 text-left">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-amber-400 animate-pulse" />
                  <span className="text-[8.5px] font-bold uppercase tracking-widest text-slate-350">Punctuality Score</span>
                </div>
                <h4 className="text-xs font-semibold tracking-tight text-white leading-none">Monthly Compliance Rating</h4>
                <p className="text-[9.5px] text-slate-350 leading-normal mt-1">
                  Ratio of On-Time arrivals. Late arrivals affect your overall score.
                </p>
              </div>

              <div className="relative h-14 w-14 flex items-center justify-center shrink-0 bg-white/10 rounded-xl border border-white/10 backdrop-blur-md shadow-inner">
                <div className="text-center">
                  <span className="text-base font-semibold block tracking-tight text-amber-300 leading-none">{complianceScore}%</span>
                  <span className="text-[7px] font-bold uppercase tracking-wider text-slate-400 mt-0.5 block">Rating</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Corporate Holidays list */}
          <Card className="border border-slate-100 dark:border-white/5 shadow-xs bg-white dark:bg-slate-900 rounded-[20px] overflow-hidden">
            <CardContent className="p-4">
              <h4 className="text-[9px] font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-2 mb-3 text-left">
                <Award className="h-3.5 w-3.5 text-[#501537] dark:text-[#8C2059]" /> Corporate Holidays & Events
              </h4>
              <div className="space-y-2.5">
                {profile?.upcomingHolidays && profile.upcomingHolidays.length > 0 ? (
                  profile.upcomingHolidays.map((holiday) => (
                    <div key={holiday._id} className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/40 pb-2 last:border-b-0 last:pb-0">
                      <div className="text-left">
                        <p className="text-[11.5px] font-semibold text-slate-700 dark:text-slate-200 leading-none">{holiday.name}</p>
                        <span className="text-[9px] text-slate-400 font-medium block mt-0.5">
                          {new Date(holiday.startDate).toLocaleDateString("en-US", { month: "short", day: "numeric", weekday: "short" })}
                        </span>
                      </div>
                      <Badge variant="outline" className="text-[7.5px] font-semibold uppercase tracking-wider bg-[#501537]/5 text-[#501537] dark:bg-[#8C2059]/10 dark:text-[#8C2059] border-none px-2 py-0.5 rounded-full">
                        Paid Holiday
                      </Badge>
                    </div>
                  ))
                ) : (
                  <p className="text-[9.5px] text-slate-400 text-center py-1.5">No upcoming festivals this month</p>
                )}
              </div>
            </CardContent>
          </Card>

        </div>

      </div>

      {/* ATTENDANCE CALENDAR & CHRONOLOGICAL HISTORY (merged in from the old History page) */}
      <div className="space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="text-left">
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Attendance Calendar & History</h3>
            <p className="text-slate-500 text-xs mt-1">
              Review detailed timeline summaries, compliance metrics, and interactive maps for {selectedDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })}.
            </p>
          </div>

          {/* Tab switch buttons */}
          <div className="p-1 rounded-xl bg-slate-100/80 dark:bg-slate-900/60 border border-slate-200/50 dark:border-white/5 backdrop-blur-md flex items-center self-start shrink-0">
            <button
              onClick={() => setActiveTab("calendar")}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${activeTab === "calendar"
                  ? "bg-white dark:bg-slate-800 text-primary shadow-sm"
                  : "text-slate-505 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                }`}
            >
              <Calendar className="h-3.5 w-3.5 text-primary/80" />
              <span>Interactive Calendar Map</span>
            </button>
            <button
              onClick={() => setActiveTab("list")}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${activeTab === "list"
                  ? "bg-white dark:bg-slate-800 text-primary shadow-sm"
                  : "text-slate-505 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                }`}
            >
              <Clock className="h-3.5 w-3.5 text-primary/80" />
              <span>Chronological List</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

          {/* LEFT: Legend (calendar tab only) */}
          {activeTab === "calendar" && (
            <div className="col-span-1 lg:col-span-4 space-y-6 order-2 lg:order-1">
              <Card className="border-0 shadow-xs bg-white dark:bg-slate-900 rounded-2xl p-5">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-3.5">
                  Calendar Status Legend
                </h4>
                <div className="grid grid-cols-2 gap-x-2 gap-y-3">
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full bg-emerald-500/10 border border-emerald-500 shrink-0" />
                    <span className="text-[10px] text-slate-600 dark:text-slate-300 font-bold">On-Time Present</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full bg-amber-500/10 border border-amber-500 shrink-0" />
                    <span className="text-[10px] text-slate-600 dark:text-slate-300 font-bold">Late Arrival</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full bg-blue-500/10 border border-blue-500 shrink-0" />
                    <span className="text-[10px] text-slate-600 dark:text-slate-300 font-bold">Half-Day Log</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full bg-rose-500/10 border border-rose-500 shrink-0" />
                    <span className="text-[10px] text-slate-600 dark:text-slate-300 font-bold">Absent / LOP</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full bg-indigo-500/10 border border-indigo-500 shrink-0" />
                    <span className="text-[10px] text-slate-600 dark:text-slate-300 font-bold">Work From Home</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shrink-0" />
                    <span className="text-[10px] text-slate-600 dark:text-slate-300 font-bold">Off Day / Future</span>
                  </div>
                </div>
              </Card>

              {/* CALENDAR CLICK DETAIL PANEL */}
              <AnimatePresence mode="wait">
                {selectedDayLog && (
                  <motion.div
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 15 }}
                    transition={{ duration: 0.3 }}
                  >
                    <Card className="border border-white/10 shadow-[0_20px_50px_rgba(80,21,55,0.15)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.4)] bg-gradient-to-br from-[#2D061A] via-[#501537] to-[#8C2059] text-white rounded-[24px] overflow-hidden relative">
                      <div className="absolute inset-0 bg-radial-at-t from-white/10 to-transparent pointer-events-none" />
                      <CardContent className="p-6 space-y-4 relative z-10">
                        <div className="flex items-center justify-between border-b border-white/10 pb-3">
                          <div className="space-y-0.5">
                            <span className="text-[9px] font-black text-white/50 uppercase tracking-widest leading-none">Session Breakdown</span>
                            <h4 className="text-[14px] font-black text-white">
                              {new Date(selectedDayLog.date).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
                            </h4>
                          </div>
                          <div className="flex items-center gap-2">
                            {(selectedDayLog.shifts?.length ?? 0) > 0 && (
                              <button
                                type="button"
                                onClick={() => setShowSessionDetails((v) => !v)}
                                className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-white/70 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-full px-2.5 py-1 transition-colors"
                              >
                                <ListChecks className="h-3 w-3" />
                                Session details
                                <ChevronDown className={`h-3 w-3 transition-transform ${showSessionDetails ? "rotate-180" : ""}`} />
                              </button>
                            )}
                            <Badge className={`border-none text-[8.5px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full shadow-xs ${selectedDayLog.status === "present"
                                ? "bg-emerald-500 text-white"
                                : selectedDayLog.status === "late"
                                  ? "bg-amber-500 text-slate-900"
                                  : selectedDayLog.status === "absent"
                                    ? "bg-rose-500 text-white"
                                    : "bg-white/10 text-white/70"
                              }`}>
                              {selectedDayLog.isWFH ? "WFH SESSION" : selectedDayLog.status}
                            </Badge>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 pt-2">
                          <div className="p-3 bg-white/5 rounded-xl border border-white/10">
                            <span className="text-[8px] font-bold text-white/40 block uppercase tracking-widest mb-1">PUNCH IN</span>
                            <span className="text-[13px] font-black text-white">{formatTimeStr(selectedDayLog.punchIn)}</span>
                          </div>
                          <div className="p-3 bg-white/5 rounded-xl border border-white/10">
                            <span className="text-[8px] font-bold text-white/40 block uppercase tracking-widest mb-1">PUNCH OUT</span>
                            <span className="text-[13px] font-black text-white">{formatTimeStr(selectedDayLog.punchOut)}</span>
                          </div>
                          <div className="p-3 bg-white/5 rounded-xl border border-white/10">
                            <span className="text-[8px] font-bold text-white/40 block uppercase tracking-widest mb-1">TOTAL WORKED</span>
                            <span className="text-[13px] font-black text-amber-300 font-mono">{formatDuration(selectedDayLog)}</span>
                          </div>
                          <div className="p-3 bg-white/5 rounded-xl border border-white/10">
                            <span className="text-[8px] font-bold text-white/40 block uppercase tracking-widest mb-1">LUNCH BREAK</span>
                            <span className="text-[13px] font-black text-white font-mono">
                              {selectedDayLog.lunchInTime ? "Break Taken" : "No Break Log"}
                            </span>
                          </div>
                        </div>

                        <AnimatePresence>
                          {showSessionDetails && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={{ duration: 0.25 }}
                              className="overflow-hidden"
                            >
                              <div className="pt-1 pb-1">
                                <span className="text-[8px] font-bold text-white/40 block uppercase tracking-widest mb-2">
                                  All Sessions Today ({selectedDayLog.shifts?.length ?? 0})
                                </span>
                                <div className="max-h-48 overflow-y-auto pr-1 space-y-2 rounded-xl">
                                  {(selectedDayLog.shifts ?? []).map((shift, i) => (
                                    <div
                                      key={i}
                                      className="flex items-center justify-between p-2.5 bg-white/5 rounded-lg border border-white/10 text-[11px]"
                                    >
                                      <span className="text-white/40 font-bold w-14">#{i + 1}</span>
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-emerald-300 font-black">{formatTimeStr(shift.punchIn)}</span>
                                        <span className="text-white/30">→</span>
                                        <span className="text-rose-300 font-black">{shift.punchOut ? formatTimeStr(shift.punchOut) : "Still In"}</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>

                        <div className="space-y-3.5 pt-2 text-[11px] border-t border-white/5">
                          {selectedDayLog.punchInLocation && (
                            <div className="flex items-start gap-2.5">
                              <MapPin className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                              <div className="leading-tight text-left">
                                <span className="text-[8px] font-bold text-white/40 block uppercase tracking-widest mb-0.5">Punch-In Location</span>
                                <span className="text-white/80 font-bold">{selectedDayLog.punchInLocation}</span>
                              </div>
                            </div>
                          )}
                          {selectedDayLog.punchOutLocation && (
                            <div className="flex items-start gap-2.5">
                              <MapPin className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
                              <div className="leading-tight text-left">
                                <span className="text-[8px] font-bold text-white/40 block uppercase tracking-widest mb-0.5">Punch-Out Location</span>
                                <span className="text-white/80 font-bold">{selectedDayLog.punchOutLocation}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* RIGHT: Calendar grid OR Chronological list */}
          <div className={`col-span-1 ${activeTab === "calendar" ? "lg:col-span-8 order-1 lg:order-2" : "lg:col-span-12"} space-y-6`}>

            {activeTab === "calendar" ? (
              <Card className="border-0 shadow-xs bg-white dark:bg-slate-900 rounded-[28px] overflow-hidden p-6">
                <div className="grid grid-cols-7 gap-2.5 text-center mb-3">
                  {weekdays.map(d => (
                    <span key={d} className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block py-1">
                      {d}
                    </span>
                  ))}
                </div>

                {isHistoryLoading || isHistoryRefetching ? (
                  <div className="grid grid-cols-7 gap-2.5 animate-pulse">
                    {Array.from({ length: 31 }).map((_, idx) => (
                      <div key={idx} className="aspect-square bg-slate-200 dark:bg-slate-800/80 rounded-xl sm:rounded-2xl" />
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-7 gap-2.5">
                    {calendarDays.map((day, idx) => {
                      if (!day) {
                        return <div key={`empty-${idx}`} className="aspect-square bg-slate-50/20 dark:bg-slate-950/5 rounded-xl border border-slate-100/10" />;
                      }

                      const record = getDayRecord(day);
                      const dayNum = day.getDate();
                      const isToday = day.toDateString() === new Date().toDateString();

                      const todayMidnight = new Date();
                      todayMidnight.setHours(0, 0, 0, 0);
                      const isFuture = day.getTime() > todayMidnight.getTime() && day.toDateString() !== todayMidnight.toDateString();

                      let circleClass = "bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-100 dark:bg-slate-950/40 dark:hover:bg-slate-950/80 dark:text-slate-300 dark:border-slate-800/40";

                      if (isFuture) {
                        circleClass = "bg-slate-100/30 text-slate-400/40 border-slate-200/10 dark:bg-slate-950/10 dark:text-slate-650 dark:border-slate-900/15 cursor-not-allowed opacity-50";
                      } else if (record) {
                        if (record.isWFH) {
                          circleClass = "bg-indigo-500/10 text-indigo-600 border-indigo-500/30 hover:bg-indigo-500/20 dark:text-indigo-400 dark:border-indigo-500/20";
                        } else if (record.status === "present") {
                          circleClass = "bg-emerald-500/10 text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/20 dark:text-emerald-400 dark:border-emerald-500/20";
                        } else if (record.status === "late") {
                          circleClass = "bg-amber-500/10 text-amber-600 border-amber-500/30 hover:bg-amber-500/20 dark:text-amber-400 dark:border-amber-500/20";
                        } else if (record.status === "half-day") {
                          circleClass = "bg-blue-500/10 text-blue-600 border-blue-500/30 hover:bg-blue-500/20 dark:text-blue-400 dark:border-blue-500/20";
                        } else if (record.status === "absent") {
                          circleClass = "bg-rose-500/10 text-rose-600 border-rose-500/30 hover:bg-rose-500/20 dark:text-rose-400 dark:border-rose-500/20";
                        }
                      }

                      const isSelected = selectedDayLog && new Date(selectedDayLog.date).toDateString() === day.toDateString();

                      return (
                        <button
                          key={day.toISOString()}
                          onClick={() => {
                            if (isFuture) return;
                            if (record) setSelectedDayLog(record);
                            else setSelectedDayLog({
                              _id: `mock-${day.toISOString()}`,
                              date: day.toISOString(),
                              status: "weekly-off",
                              remarks: "No duty session logged / Off Day"
                            });
                          }}
                          disabled={isFuture}
                          className={`aspect-square rounded-xl sm:rounded-2xl border flex flex-col items-center justify-between p-1.5 sm:p-2.5 transition-all duration-300 relative group ${isFuture ? "cursor-not-allowed" : "cursor-pointer hover:scale-[1.03]"} ${circleClass} ${isSelected
                              ? "ring-2 ring-primary ring-offset-2 dark:ring-offset-slate-900 border-transparent shadow-md"
                              : ""
                            }`}
                        >
                          <div className="flex items-center justify-between w-full">
                            <span className={`text-[10px] sm:text-xs font-black ${isToday ? "h-4.5 w-4.5 sm:h-5 sm:w-5 bg-[#501537] text-white flex items-center justify-center rounded-full text-[9px] sm:text-[10px]" : ""}`}>
                              {dayNum}
                            </span>
                            {record && (
                              <span className="h-1 w-1 sm:h-1.5 sm:w-1.5 rounded-full bg-current shrink-0" />
                            )}
                          </div>
                          <span className="text-[7.5px] font-black uppercase tracking-widest opacity-60 leading-none truncate w-full text-center hidden sm:block">
                            {isFuture ? "Upcoming" : record ? (record.isWFH ? "WFH" : record.status) : ""}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </Card>
            ) : (
              <div className="space-y-4">
                {/* Quick Filter Badges */}
                <div className="flex flex-wrap items-center gap-2 bg-white dark:bg-slate-900 px-5 py-3 rounded-2xl shadow-xs border border-slate-100/50 dark:border-slate-800/20">
                  <span className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 mr-2 flex items-center gap-1.5">
                    <Filter className="h-3.5 w-3.5" /> Filter Status:
                  </span>
                  {[
                    { value: "all", label: "All Logs" },
                    { value: "present", label: "On-Time" },
                    { value: "late", label: "Late Marks" },
                    { value: "wfh", label: "WFH Logs" },
                    { value: "absent", label: "Absents" },
                  ].map(f => (
                    <button
                      key={f.value}
                      onClick={() => setStatusFilter(f.value)}
                      className={`px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${statusFilter === f.value
                          ? "bg-[#501537] text-white"
                          : "bg-slate-100 hover:bg-slate-200 text-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-400"
                        }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                {isHistoryLoading || isHistoryRefetching ? (
                  <div className="space-y-3.5 animate-pulse">
                    {Array.from({ length: 3 }).map((_, idx) => (
                      <div key={idx} className="p-5 bg-slate-200 dark:bg-slate-800/40 rounded-[24px] h-[130px]" />
                    ))}
                  </div>
                ) : filteredLogs.length > 0 ? (
                  <div className="space-y-3.5">
                    {filteredLogs.map((record) => {
                      const dateObj = new Date(record.date);
                      const dayStr = dateObj.toLocaleDateString("en-US", { day: "numeric", month: "short" });
                      const weekdayStr = dateObj.toLocaleDateString("en-US", { weekday: "short" });

                      const isLate = record.status === "late";
                      const isHalfDay = record.status === "half-day";
                      const isAbsent = record.status === "absent";
                      const isWFHRecord = record.isWFH;

                      return (
                        <motion.div
                          key={record.date}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="p-5 bg-white dark:bg-slate-900 rounded-[24px] shadow-xs flex flex-col gap-4 border border-slate-100/50 dark:border-slate-800/30 hover:border-slate-250 dark:hover:border-slate-800 transition-all duration-300 hover:shadow-soft"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-black text-slate-850 dark:text-slate-100">
                                {dayStr}, {weekdayStr}
                              </span>
                              {isWFHRecord ? (
                                <Badge className="border-none bg-indigo-500/10 text-indigo-500 text-[8.5px] font-black uppercase tracking-wider px-2 py-0">Remote WFH</Badge>
                              ) : isAbsent ? (
                                <Badge className="border-none bg-rose-500/10 text-rose-500 text-[8.5px] font-black uppercase tracking-wider px-2 py-0">LOP Absent</Badge>
                              ) : isLate ? (
                                <Badge className="border-none bg-amber-500/10 text-amber-600 dark:text-amber-500 text-[8.5px] font-black uppercase tracking-wider px-2 py-0">Late Arrival</Badge>
                              ) : isHalfDay ? (
                                <Badge className="border-none bg-blue-500/10 text-blue-500 text-[8.5px] font-black uppercase tracking-wider px-2 py-0">Half Day</Badge>
                              ) : (
                                <Badge className="border-none bg-emerald-500/10 text-emerald-500 text-[8.5px] font-black uppercase tracking-wider px-2 py-0">Present On-Time</Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 text-slate-400 dark:text-slate-500 shrink-0">
                              <Clock className="h-3.5 w-3.5 text-slate-400" />
                              <span className="text-xs font-black text-slate-700 dark:text-slate-300 font-mono">
                                {formatDuration(record)}
                              </span>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px] font-bold text-slate-400 border-t border-slate-50 dark:border-slate-800/40 pt-3">
                            <div>
                              Punch-In: <span className="text-slate-800 dark:text-slate-200 font-black">{formatTimeStr(record.punchIn)}</span>
                            </div>
                            <div>
                              Punch-Out: <span className="text-slate-800 dark:text-slate-200 font-black">{formatTimeStr(record.punchOut)}</span>
                            </div>
                            {record.remarks && (
                              <div className="col-span-2 text-[10px] text-slate-400 dark:text-slate-500 italic mt-1 leading-relaxed">
                                Remarks: "{record.remarks}"
                              </div>
                            )}
                            {record.punchInLocation && (
                              <div className="col-span-2 text-[9.5px] text-slate-400/85 font-medium flex items-center gap-1.5 truncate mt-0.5">
                                <MapPin className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                                <span className="truncate">In: {record.punchInLocation}</span>
                              </div>
                            )}
                            {record.punchOutLocation && (
                              <div className="col-span-2 text-[9.5px] text-slate-400/85 font-medium flex items-center gap-1.5 truncate">
                                <MapPin className="h-3.5 w-3.5 text-rose-500 shrink-0" />
                                <span className="truncate">Out: {record.punchOutLocation}</span>
                              </div>
                            )}
                            {(record.punchInPhoto || record.punchOutPhoto) && (
                              <div className="col-span-2 flex items-center gap-3 mt-2 pt-2.5 border-t border-slate-50 dark:border-slate-800/20">
                                {record.punchInPhoto && (
                                  <div className="flex flex-col gap-1">
                                    <span className="text-[7.5px] font-bold text-slate-400 uppercase tracking-widest">In Selfie</span>
                                    <div className="h-10 w-16 rounded-lg overflow-hidden border border-slate-100 dark:border-slate-800 relative group/listphoto cursor-zoom-in">
                                      <img
                                        src={record.punchInPhoto.startsWith('http') ? record.punchInPhoto : `${IMAGE_BASE_URL}${record.punchInPhoto}`}
                                        alt="Punch In"
                                        className="w-full h-full object-cover group-hover/listphoto:scale-110 transition-transform duration-300"
                                      />
                                    </div>
                                  </div>
                                )}
                                {record.punchOutPhoto && (
                                  <div className="flex flex-col gap-1">
                                    <span className="text-[7.5px] font-bold text-slate-400 uppercase tracking-widest">Out Selfie</span>
                                    <div className="h-10 w-16 rounded-lg overflow-hidden border border-slate-100 dark:border-slate-800 relative group/listphoto cursor-zoom-in">
                                      <img
                                        src={record.punchOutPhoto.startsWith('http') ? record.punchOutPhoto : `${IMAGE_BASE_URL}${record.punchOutPhoto}`}
                                        alt="Punch Out"
                                        className="w-full h-full object-cover group-hover/listphoto:scale-110 transition-transform duration-300"
                                      />
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 text-center py-12 bg-white dark:bg-slate-900 rounded-2xl shadow-xs border border-slate-100/50 dark:border-slate-800/20">
                    No chronological logs matched the filter.
                  </p>
                )}
              </div>
            )}
          </div>

        </div>
      </div>

      {/* Location Verification Modal */}
      <AnimatePresence>
        {showLocationVerification && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.93, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.93, y: 15 }}
              className="bg-white dark:bg-slate-900 rounded-[28px] overflow-hidden max-w-md w-full shadow-2xl border border-slate-100 dark:border-white/5 relative p-5 flex flex-col gap-4"
            >
              {/* Header */}
              <div className="w-full text-center">
                <h4 className="text-sm font-semibold text-slate-800 dark:text-white uppercase tracking-wider">
                  Location Verification
                </h4>
                <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">
                  Confirm your current coordinates before you punch in.
                </p>
              </div>

              {/* Leaflet Map Box */}
              <div className="relative w-full h-52 rounded-2xl overflow-hidden border border-slate-100 dark:border-white/5 flex items-center justify-center bg-slate-950 shadow-inner">
                {locationLoading ? (
                  <div className="absolute inset-0 bg-black/50 backdrop-blur-xs flex flex-col items-center justify-center gap-2 z-10">
                    <RefreshCw className="h-6 w-6 animate-spin text-[#8C2059]" />
                    <span className="text-[9.5px] font-semibold text-white tracking-widest uppercase">Fetching Location...</span>
                  </div>
                ) : null}

                {location ? (
                  <Suspense
                    fallback={
                      <div className="flex h-full w-full items-center justify-center bg-slate-100 dark:bg-white/5">
                        <span className="text-[9.5px] font-semibold uppercase tracking-widest text-slate-400">
                          Loading map…
                        </span>
                      </div>
                    }
                  >
                    <UserLocationMap
                      lat={location.lat}
                      lng={location.lng}
                      initials={initials}
                    />
                  </Suspense>
                ) : (
                  <div className="flex flex-col items-center justify-center text-center p-4 text-slate-400 gap-2">
                    <MapPin className="h-8 w-8 text-rose-500 animate-bounce" />
                    <p className="text-xs font-semibold text-rose-500">GPS Permission or Coordinates Required</p>
                    <p className="text-[10px] text-slate-500">Enable location access to continue</p>
                    <Button
                      size="sm"
                      onClick={() => setShowLocationHelp(true)}
                      className="mt-1 h-7 px-3 text-[10px] font-bold bg-rose-500 hover:bg-rose-600 text-white rounded-lg flex items-center gap-1"
                    >
                      <Settings className="h-3 w-3" /> Enable Location
                    </Button>
                  </div>
                )}
              </div>

              {/* Location address and coordinates metadata */}
              <div className="bg-slate-50 dark:bg-slate-950/40 border border-slate-100 dark:border-white/5 p-3 rounded-xl space-y-1.5 text-left">
                <div className="flex items-center justify-between">
                  <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">CURRENT POSITION</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={refreshLocation}
                    disabled={locationLoading}
                    className="h-6 px-2 text-[9px] font-bold text-primary cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800/40"
                  >
                    <RefreshCw className={`h-2.5 w-2.5 mr-1 ${locationLoading ? "animate-spin" : ""}`} />
                    REFRESH GPS
                  </Button>
                </div>
                <p className="text-xs font-medium text-slate-700 dark:text-slate-200 line-clamp-2 leading-relaxed">
                  {address}
                </p>
                {location && (
                  <p className="text-[9.5px] font-mono text-slate-400 dark:text-slate-500">
                    LAT: {location.lat.toFixed(6)} · LNG: {location.lng.toFixed(6)}
                  </p>
                )}
                {locationAccuracy !== null && (
                  <p className={`text-[9px] font-semibold mt-0.5 ${locationAccuracy > 500 ? "text-amber-500" : "text-emerald-500"}`}>
                    {locationAccuracy > 500
                      ? `⚠ Low accuracy (±${Math.round(locationAccuracy)}m) — browser using WiFi/IP. Enable device GPS for exact location.`
                      : `✓ Accuracy: ±${Math.round(locationAccuracy)}m`}
                  </p>
                )}
              </div>

              {/* Work From Home.
                  Hidden unless the server says this employee may use it
                  (profile.canWorkFromHome, resolved with the same rule that
                  accepts the punch), and hidden for branch-less employees who
                  are already remote on every punch — for them it would be a
                  control that changes nothing. */}
              {profile?.canWorkFromHome && profile?.branchId && (
                <div
                  className={`w-full rounded-xl border p-3 text-left transition-colors ${
                    wfhForThisPunch
                      ? "border-indigo-400/50 bg-indigo-500/10"
                      : "border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-slate-950/40"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Home className={`h-3.5 w-3.5 ${wfhForThisPunch ? "text-indigo-500" : "text-slate-400"}`} />
                      <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200">
                        Working from home today
                      </span>
                    </div>
                    <Switch
                      checked={wfhForThisPunch}
                      onCheckedChange={setWfhForThisPunch}
                      aria-label="Mark this punch as Work From Home"
                    />
                  </div>
                  <p className="mt-1.5 text-[9.5px] leading-relaxed text-slate-500 dark:text-slate-400">
                    {wfhForThisPunch
                      ? "Office distance is not checked and you will not be punched out automatically for leaving the area. Your location is still recorded on the punch."
                      : "Turn on if you are not coming to the office. Skips the branch distance check and auto punch-out for today."}
                  </p>
                </div>
              )}

              {/* Action buttons */}
              <div className="w-full flex gap-3 mt-2">
                <button
                  onClick={() => {
                    setShowLocationVerification(false);
                  }}
                  className="flex-1 py-2 text-center text-xs font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-all border border-slate-200 dark:border-slate-800 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <Button
                  onClick={() => {
                    // A WFH punch is never measured against a branch, so a
                    // missing fix is not a blocker — sending them to the
                    // location-help screen would be a dead end.
                    if (profile?.branchId && !location && !wfhForThisPunch) {
                      setShowLocationHelp(true);
                      return;
                    }
                    setShowLocationVerification(false);
                    openScanner("punch-in");
                  }}
                  className="flex-1 h-9 bg-gradient-to-r from-[#501537] to-[#7B2453] hover:from-[#6B1C4B] hover:to-[#912D64] text-white font-semibold rounded-xl shadow-xs border-none flex items-center justify-center cursor-pointer transition-all text-xs"
                >
                  Confirm & Proceed
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Start-another-session confirmation. Deliberately plain: the employee
          needs to know this opens a NEW stretch rather than editing the one
          they just closed, and that they should be at work before they tap. */}
      <AnimatePresence>
        {confirmNewSession && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.93, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.93, y: 15 }}
              className="bg-white dark:bg-slate-900 rounded-[28px] overflow-hidden max-w-sm w-full shadow-2xl border border-slate-100 dark:border-white/5 p-5 flex flex-col gap-4"
            >
              <div className="w-full text-center">
                <div className="mx-auto mb-2 h-12 w-12 rounded-2xl bg-[#501537]/10 flex items-center justify-center">
                  <Fingerprint className="h-6 w-6 text-[#8C2059]" />
                </div>
                <h4 className="text-sm font-semibold text-slate-800 dark:text-white">
                  Start session {todaySessions.length + 1} of {maxSessions}?
                </h4>
                <p className="text-[10.5px] text-slate-500 mt-1.5 leading-relaxed">
                  This opens a new punch-in for today; it does not change the
                  {" "}{todaySessions.length === 1 ? "one" : todaySessions.length} you have already recorded.
                  <span className="block mt-1 font-semibold text-slate-600 dark:text-slate-300">
                    Make sure you are at your workplace.
                  </span>
                </p>
              </div>

              <div className="flex flex-col gap-2">
                <Button
                  onClick={() => {
                    setConfirmNewSession(false);
                    if (!location) refreshLocation();
                    setShowLocationVerification(true);
                  }}
                  className="w-full h-11 bg-gradient-to-r from-[#501537] to-[#7B2453] hover:from-[#6B1C4B] hover:to-[#912D64] text-white font-semibold rounded-[16px] border-none text-xs tracking-wider flex items-center justify-center gap-2"
                >
                  <Fingerprint className="h-4 w-4" />
                  Yes, punch in
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setConfirmNewSession(false)}
                  className="w-full h-10 rounded-[16px] text-xs font-semibold text-slate-500"
                >
                  Cancel
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Location Access Help Dialog — device-aware steps + deep link to OS settings + retry */}
      <AnimatePresence>
        {showLocationHelp && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.93, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.93, y: 15 }}
              className="bg-white dark:bg-slate-900 rounded-[28px] overflow-hidden max-w-md w-full shadow-2xl border border-slate-100 dark:border-white/5 relative p-5 flex flex-col gap-4"
            >
              {/* Header */}
              <div className="w-full text-center">
                <div className="mx-auto mb-2 h-12 w-12 rounded-2xl bg-rose-500/10 flex items-center justify-center">
                  <MapPin className="h-6 w-6 text-rose-500" />
                </div>
                <h4 className="text-sm font-semibold text-slate-800 dark:text-white uppercase tracking-wider">
                  {locationFailReason === "unavailable" ? "Turn On Location" : "Location Access Needed"}
                </h4>
                <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">
                  {locationFailReason === "unavailable"
                    ? "Your device location (GPS) is switched off. Turn it on so we can verify you're at your branch."
                    : "We couldn't access your location. Please allow location access to punch in and out."}
                </p>
              </div>

              {/* Step-by-step instructions */}
              <div className="bg-slate-50 dark:bg-slate-950/40 border border-slate-100 dark:border-white/5 p-3.5 rounded-xl text-left">
                <ol className="space-y-2.5">
                  {locationHelpSteps(getPlatform(), locationFailReason).map((step, i) => (
                    <li key={i} className="flex gap-2.5 items-start">
                      <span className="shrink-0 h-4 w-4 rounded-full bg-[#501537] dark:bg-[#8C2059] text-white text-[8px] font-bold flex items-center justify-center mt-0.5">
                        {i + 1}
                      </span>
                      <span className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">{step}</span>
                    </li>
                  ))}
                </ol>
              </div>

              {/* Actions */}
              <div className="w-full flex flex-col gap-2">
                {getPlatform() !== "web" && (
                  <Button
                    onClick={async () => {
                      const opened = await openLocationSettings(locationFailReason ?? undefined);
                      if (!opened) {
                        toast.error("Couldn't open settings automatically. Please open your device Settings manually.");
                      }
                    }}
                    className="w-full h-10 bg-gradient-to-r from-[#501537] to-[#7B2453] hover:from-[#6B1C4B] hover:to-[#912D64] text-white font-semibold rounded-xl text-xs flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Settings className="h-4 w-4" />
                    {locationFailReason === "unavailable" ? "Open Location Settings" : "Open App Settings"}
                  </Button>
                )}
                <Button
                  onClick={async () => {
                    setLocationLoading(true);
                    const result = await acquirePosition();
                    setLocationLoading(false);
                    if (result.ok) {
                      setLocation({ lat: result.coords.lat, lng: result.coords.lng });
                      setLocationAccuracy(result.coords.accuracy);
                      setLocationFailReason(null);
                      resolveAddress(result.coords.lat, result.coords.lng).then(setAddress);
                      setShowLocationHelp(false);
                      const resume = pendingPunch;
                      setPendingPunch(null);
                      if (resume) openScanner(resume);
                    } else {
                      setLocationFailReason(result.reason);
                      toast.error(result.message);
                    }
                  }}
                  disabled={locationLoading}
                  variant="outline"
                  className="w-full h-10 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer"
                >
                  <RefreshCw className={`h-4 w-4 ${locationLoading ? "animate-spin" : ""}`} />
                  {locationLoading ? "Checking..." : "I've Enabled It — Retry"}
                </Button>
                <button
                  onClick={() => {
                    setShowLocationHelp(false);
                    setPendingPunch(null);
                  }}
                  className="w-full py-1.5 text-center text-[11px] font-semibold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Selfie Verification Scanner Modal (Framer Motion AnimatePresence overlay) */}
      <AnimatePresence>
        {scanType && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.93, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.93, y: 15 }}
              className="bg-white dark:bg-slate-900 rounded-[28px] overflow-hidden max-w-xs w-full shadow-2xl border border-slate-100 dark:border-white/5 relative p-5 flex flex-col items-center gap-5"
            >
              {/* Header */}
              <div className="w-full text-center">
                <h4 className="text-sm font-semibold text-slate-800 dark:text-white uppercase tracking-wider">
                  {scanType === "punch-in" ? "Punch In Scanner" : "Punch Out Scanner"}
                </h4>
                <p className="text-[9.5px] text-slate-500 mt-1 leading-relaxed">
                  Verify your identity by capturing a selfie photo.
                </p>
              </div>

              {/* Camera Circular Window */}
              <div className="relative w-56 h-56 rounded-full overflow-hidden border-2 border-dashed border-[#501537] dark:border-[#8C2059] flex items-center justify-center bg-slate-950 shadow-inner group">
                {/* Live Camera Feed (Always rendered inside DOM, hidden using CSS to ensure robust ref mapping) */}
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  className={`w-full h-full object-cover scale-x-[-1] ${capturedSelfie ? "hidden" : "block"}`}
                />

                {/* Captured Selfie Preview */}
                {capturedSelfie && (
                  <img
                    src={capturedSelfie}
                    alt="Captured Selfie"
                    className="w-full h-full object-cover"
                  />
                )}

                {/* Shading ring overlay */}
                <div className="absolute inset-0 pointer-events-none rounded-full ring-[12px] ring-black/40" />

                {/* Glowing scan radar line */}
                {!capturedSelfie && (
                  <div className="absolute inset-x-0 h-1 bg-[#8C2059] shadow-[0_0_10px_#8C2059] pointer-events-none scanner-line"
                    style={{ top: "0%" }}
                  />
                )}

                {/* Processing/Uploading Loader Overlay */}
                {scanLoading && (
                  <div className="absolute inset-0 bg-black/75 backdrop-blur-xs flex flex-col items-center justify-center gap-2">
                    <RefreshCw className="h-7 w-7 animate-spin text-[#8C2059]" />
                    <span className="text-[9.5px] font-semibold text-white tracking-widest uppercase animate-pulse">Uploading Selfie...</span>
                  </div>
                )}

                {/* Success confirmation overlay, shown after the punch is recorded */}
                {scanResult && (
                  <div className="absolute inset-0 bg-black/80 backdrop-blur-xs flex flex-col items-center justify-center gap-2 text-center px-4">
                    <CheckCircle className="h-9 w-9 text-emerald-400" />
                    <span className="text-[12px] font-bold text-white tracking-wide">
                      {scanResult.type === "punch-in" ? "Punched In Successfully!" : "Punched Out Successfully!"}
                    </span>
                    {scanResult.timeLabel && (
                      <span className="text-[10px] text-white/70 font-mono">
                        {scanResult.type === "punch-in" ? "Punch In" : "Punch Out"}: {scanResult.timeLabel}
                      </span>
                    )}
                    {scanResult.type === "punch-out" && scanResult.workHoursLabel && (
                      <span className="text-[10px] text-emerald-300 font-mono">Worked: {scanResult.workHoursLabel}</span>
                    )}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="w-full flex flex-col gap-2">
                {!capturedSelfie ? (
                  <Button
                    onClick={captureScannerPhoto}
                    disabled={!isScanning}
                    className="w-full h-10 bg-gradient-to-r from-[#501537] to-[#7B2453] hover:from-[#6B1C4B] hover:to-[#912D64] text-white font-semibold rounded-xl shadow-xs border-none flex items-center justify-center gap-2 cursor-pointer transition-all text-xs"
                  >
                    <Camera className="h-4 w-4" />
                    <span>Capture Selfie & Done</span>
                  </Button>
                ) : scanResult ? (
                  <div className="text-[9px] font-bold text-emerald-500 uppercase tracking-widest flex items-center justify-center gap-1 py-1.5">
                    <CheckCircle className="h-4 w-4 text-emerald-500" />
                    <span>Done</span>
                  </div>
                ) : (
                  <div className="text-[9px] font-bold text-emerald-500 uppercase tracking-widest flex items-center justify-center gap-1 py-1.5 animate-pulse">
                    <CheckCircle className="h-4 w-4 text-emerald-500" />
                    <span>Processing Session...</span>
                  </div>
                )}

                {!scanResult && (
                  <button
                    onClick={() => {
                      stopScannerCamera();
                      setScanType(null);
                      setCapturedSelfie(null);
                    }}
                    disabled={scanLoading}
                    className="w-full py-2 text-center text-xs font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-all border border-slate-200 dark:border-slate-850 rounded-xl cursor-pointer"
                  >
                    Cancel Scanner
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
