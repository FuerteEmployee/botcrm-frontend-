import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient, IMAGE_BASE_URL } from "@/lib/api-client";
import { useAuth } from "@/hooks/use-auth";
import { motion, AnimatePresence } from "framer-motion";
import {
  Clock, MapPin, Camera, Coffee, CheckCircle,
  AlertTriangle, Calendar, Award, Fingerprint, ChevronLeft, ChevronRight,
  Home, RefreshCw, Sparkles
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { startTracking, stopTracking } from "@/services/location-tracker";
import { Switch } from "@/components/ui/switch";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

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
  remarks?: string;
  punchInPhoto?: string;
  punchOutPhoto?: string;
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
  todayAttendance?: AttendanceLog | null;
  recentAttendance?: AttendanceLog[];
  upcomingHolidays?: Array<{ _id: string; name: string; startDate: string }>;
  allowMultiplePunches?: boolean;
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

// Leaflet Map component specifically for showing the employee's current location in the consent modal
function UserLocationMap({ lat, lng, initials }: { lat: number; lng: number; initials: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Safety: clear any stale Leaflet stamp
    delete (container as any)._leaflet_id;

    const map = L.map(container, {
      center: [lat, lng],
      zoom: 15,
      zoomControl: false,
    });

    L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
      {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      }
    ).addTo(map);

    L.control.zoom({ position: "bottomright" }).addTo(map);

    const icon = L.divIcon({
      className: "custom-leaflet-marker",
      html: `
        <div style="position:relative;display:flex;flex-direction:column;align-items:center;cursor:pointer;">
          <span style="position:absolute;top:-4px;width:44px;height:44px;border-radius:50%;background:rgba(140,32,89,0.25);animation:ping 1.5s cubic-bezier(0,0,0.2,1) infinite;"></span>
          <div style="position:relative;width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#8C2059 0%,#501537 100%);color:white;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;border:2px solid white;box-shadow:0 4px 10px rgba(0,0,0,0.25);">
            ${initials}
          </div>
        </div>`,
      iconSize: [40, 50],
      iconAnchor: [20, 20],
    });

    const marker = L.marker([lat, lng], { icon }).addTo(map);
    mapRef.current = map;
    markerRef.current = marker;

    return () => {
      if (markerRef.current) markerRef.current.remove();
      if (mapRef.current) mapRef.current.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  // Update map view and marker position when lat/lng changes
  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (map && marker) {
      map.setView([lat, lng], 15, { animate: true });
      marker.setLatLng([lat, lng]);
    }
  }, [lat, lng]);

  return <div ref={containerRef} style={{ height: "100%", width: "100%" }} />;
}

function UserDashboard() {
  useAuth();
  const queryClient = useQueryClient();
  const [time, setTime] = useState(new Date());
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [address, setAddress] = useState<string>("Locating...");
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationAccuracy, setLocationAccuracy] = useState<number | null>(null);
  const [showLocationVerification, setShowLocationVerification] = useState(false);
  const [liveTrackingConsent, setLiveTrackingConsent] = useState(true);

  // Custom camera scanner variables
  const [scanType, setScanType] = useState<"punch-in" | "punch-out" | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [capturedSelfie, setCapturedSelfie] = useState<string | null>(null);
  const [scanLoading, setScanLoading] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Selected Month/Year for statistics navigation (Synchronized via localStorage)
  const [selectedDate, setSelectedDate] = useState(() => {
    const saved = localStorage.getItem("employee-portal-selected-date");
    return saved ? new Date(saved) : new Date();
  });

  useEffect(() => {
    localStorage.setItem("employee-portal-selected-date", selectedDate.toISOString());
  }, [selectedDate]);

  // 1. Fetch User Profile
  const { data: profile, isLoading: isProfileLoading } = useQuery<UserProfile>({
    queryKey: ["user-profile"],
    queryFn: async () => {
      const { data } = await apiClient.get("/users/profile");
      return data;
    },
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
  const isPunchedIn = !!todayLog?.punchIn;
  const isPunchedOut = !!todayLog?.punchOut;

  // Sync live tracking consent toggle with stored preference when profile loads
  useEffect(() => {
    if (profile?._id) {
      setLiveTrackingConsent(localStorage.getItem(`live-tracking-allowed-${profile._id}`) !== "false");
    }
  }, [profile?._id]);

  // Real-time location tracking lifecycle
  useEffect(() => {
    if (profile?._id && isPunchedIn && !isPunchedOut) {
      const trackingAllowed = localStorage.getItem(`live-tracking-allowed-${profile._id}`) !== "false";
      if (trackingAllowed) {
        startTracking(profile._id);
      } else {
        stopTracking();
      }
    } else {
      stopTracking();
    }
  }, [profile?._id, isPunchedIn, isPunchedOut]);

  // Real-time Shift Progress
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (todayLog?.punchIn && !todayLog?.punchOut) {
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

  // Geolocation Setup — only fetch silently if permission is already granted.
  // Never auto-prompt on page load; the Punch In button is the intentional trigger.
  useEffect(() => {
    if (typeof window === "undefined" || !navigator.geolocation) return;

    const fetchSilently = () => {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          setLocation({ lat, lng });
          setLocationAccuracy(pos.coords.accuracy);
          if (navigator.onLine) {
            try {
              const response = await fetch(
                `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`,
                { headers: { "Accept-Language": "en", "User-Agent": "BeOnTimePortal/1.0" } }
              );
              if (response.ok) {
                const geoData = await response.json();
                setAddress(geoData.display_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`);
              } else {
                setAddress(`${lat.toFixed(4)}, ${lng.toFixed(4)}`);
              }
            } catch {
              setAddress(`${lat.toFixed(4)}, ${lng.toFixed(4)}`);
            }
          } else {
            setAddress(`${lat.toFixed(4)}, ${lng.toFixed(4)}`);
          }
        },
        () => { setAddress("GPS permissions needed"); },
        { enableHighAccuracy: true, maximumAge: 30000, timeout: 15000 }
      );
    };

    if (navigator.permissions) {
      navigator.permissions.query({ name: "geolocation" as PermissionName }).then((result) => {
        if (result.state === "granted") {
          fetchSilently();
        } else if (result.state === "denied") {
          setAddress("GPS permissions needed");
        }
        // state === "prompt" → do nothing; wait for user to click Punch In
      }).catch(() => {
        // Permissions API not supported (old Android browsers) — fall back to direct call
        fetchSilently();
      });
    } else {
      fetchSilently();
    }
  }, []);

  const refreshLocation = async () => {
    if (typeof window === "undefined" || !navigator.geolocation) {
      toast.error("Geolocation is not supported by your browser");
      return;
    }
    setLocationLoading(true);
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          maximumAge: 0,
          timeout: 15000,
        });
      });
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      setLocation({ lat, lng });
      setLocationAccuracy(pos.coords.accuracy);

      if (navigator.onLine) {
        try {
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`,
            { headers: { "Accept-Language": "en", "User-Agent": "BeOnTimePortal/1.0" } }
          );
          if (response.ok) {
            const geoData = await response.json();
            setAddress(geoData.display_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`);
          } else {
            setAddress(`${lat.toFixed(4)}, ${lng.toFixed(4)}`);
          }
        } catch {
          setAddress(`${lat.toFixed(4)}, ${lng.toFixed(4)}`);
        }
      } else {
        setAddress(`${lat.toFixed(4)}, ${lng.toFixed(4)}`);
      }
    } catch {
      toast.error("Failed to fetch location. Please make sure location permissions are enabled.");
      setAddress("GPS permissions needed");
    } finally {
      setLocationLoading(false);
    }
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

  const captureScannerPhoto = async () => {
    if (videoRef.current) {
      const canvas = document.createElement("canvas");
      canvas.width = 320;
      canvas.height = 240;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg");
        setCapturedSelfie(dataUrl);
        stopScannerCamera();

        setScanLoading(true);
        if (scanType === "punch-in") {
          punchInMutation.mutate(dataUrl, {
            onSuccess: () => {
              setScanLoading(false);
              setScanType(null);
              setCapturedSelfie(null);
            },
            onError: () => {
              setScanLoading(false);
              setTimeout(() => {
                startScannerCamera();
              }, 200);
            }
          });
        } else if (scanType === "punch-out") {
          // Auto-end lunch before punching out if employee is currently on a lunch break
          if (todayLog?.lunchInTime && !todayLog?.lunchOutTime) {
            try {
              await lunchOutMutation.mutateAsync();
            } catch {
              // Continue with punch-out even if lunch-out fails
            }
          }
          punchOutMutation.mutate(dataUrl, {
            onSuccess: () => {
              setScanLoading(false);
              setScanType(null);
              setCapturedSelfie(null);
            },
            onError: () => {
              setScanLoading(false);
              setTimeout(() => {
                startScannerCamera();
              }, 200);
            }
          });
        }
      }
    }
  };

  const handleOpenScanner = (type: "punch-in" | "punch-out") => {
    // Office-based employees must have location. If GPS is blocked, show a
    // clear instruction rather than letting them reach "Distance: Infinity".
    if (profile?.branchId && !location) {
      toast.error(
        "Location access is blocked. Open browser Site Settings, allow Location, then refresh the page.",
        { duration: 6000 }
      );
      return;
    }
    setScanType(type);
    setCapturedSelfie(null);
    setScanLoading(false);
    setTimeout(() => {
      startScannerCamera();
    }, 150);
  };

  const getFreshLocation = async () => {
    let currentLocation = location;
    let currentAddress = address;

    if (!currentLocation || currentAddress === "Locating...") {
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });
        });
        currentLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };

        if (navigator.onLine) {
          try {
            const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${pos.coords.latitude}&lon=${pos.coords.longitude}`);
            if (response.ok) {
              const geoData = await response.json();
              currentAddress = geoData.display_name || `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`;
            } else {
              currentAddress = `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`;
            }
          } catch {
            currentAddress = `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`;
          }
        } else {
          currentAddress = `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`;
        }
        setLocation(currentLocation);
        setAddress(currentAddress);
      } catch (e) {
        currentAddress = "Location Capturing Bypassed";
      }
    }
    return { currentLocation, currentAddress };
  };

  // Punch Mutators (Accept base64 selfie parameter)
  const punchInMutation = useMutation({
    mutationFn: async (photoArg: string) => {
      const { currentLocation, currentAddress } = await getFreshLocation();

      // Office employees need a real location — null would make the backend
      // calculate Infinity distance and reject with 400.
      if (!currentLocation && profile?.branchId) {
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
        isWFH: !profile?.branchId,
        address: currentAddress === "GPS permissions needed" ? "Location Capturing Bypassed" : currentAddress,
      };
      const { data } = await apiClient.post("/attendance/punch-in", payload);
      return data;
    },
    onSuccess: (data) => {
      toast.success(data.message || "Punched In Successfully!");
      queryClient.invalidateQueries({ queryKey: ["user-profile"] });
      queryClient.invalidateQueries({ queryKey: ["employee-dashboard"] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || "Punch In Failed");
    }
  });

  const punchOutMutation = useMutation({
    mutationFn: async (photoArg: string) => {
      const { currentLocation, currentAddress } = await getFreshLocation();

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
      };
      const { data } = await apiClient.post("/attendance/punch-out", payload);
      return data;
    },
    onSuccess: (data) => {
      toast.success(`Punched Out! Worked: ${data.workHours} hrs`);
      queryClient.invalidateQueries({ queryKey: ["user-profile"] });
      queryClient.invalidateQueries({ queryKey: ["employee-dashboard"] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || "Punch Out Failed");
    }
  });

  // Lunch Break Actions — use already-fetched location; never request new GPS permission
  const lunchInMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        location: location,
        address: (!address || address === "GPS permissions needed" || address === "Locating...")
          ? "Location Capturing Bypassed"
          : address,
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

  const lunchOutMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        location: location,
        address: (!address || address === "GPS permissions needed" || address === "Locating...")
          ? "Location Capturing Bypassed"
          : address,
      };
      const { data } = await apiClient.post("/attendance/lunch-out", payload);
      return data;
    },
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

  // Time formatter
  const formatTimeStr = (isoString?: string) => {
    if (!isoString) return "--";
    return new Date(isoString).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
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
                    {time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })}
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
                      {formatTimeStr(todayLog?.punchOut)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[7.5px] font-semibold text-white/30 uppercase tracking-wider block">LUNCH-IN</span>
                    <span className="text-[11.5px] font-normal text-white/80 block mt-0.5">
                      {formatTimeStr(todayLog?.lunchInTime)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[7.5px] font-semibold text-white/30 uppercase tracking-wider block">LUNCH-OUT</span>
                    <span className="text-[11.5px] font-normal text-white/80 block mt-0.5">
                      {formatTimeStr(todayLog?.lunchOutTime)}
                    </span>
                  </div>
                </div>
              </div>

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

              {/* Location indicator */}
              <div className="flex items-center justify-center gap-1.5 text-[9px] pt-0.5">
                <MapPin className={`h-3 w-3 shrink-0 ${!location ? "text-red-400" : "text-white/80"}`} />
                <span className={`font-medium truncate ${!location ? "text-red-400" : "text-white/60"}`}>
                  {!location
                    ? "Location blocked — enable GPS in Site Settings"
                    : address}
                </span>
              </div>
            </div>
          </div>

          {/* Dynamic Primary Actions Card */}
          <div className="space-y-3">
            {!isPunchedIn ? (
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
                <Fingerprint className="h-4.5 w-4.5 text-white group-hover:scale-110 transition-transform duration-300" />
                <span>Punch In</span>
              </Button>
            ) : !isPunchedOut ? (
              // Punched in, not punched out
              <div className="flex flex-col gap-3">
                {/* Lunch states layout */}
                {!todayLog?.lunchInTime ? (
                  // Punched In but hasn't started lunch: Can start lunch OR punch out
                  <div className="grid grid-cols-2 gap-3">
                    <Button
                      onClick={() => handleOpenScanner("punch-out")}
                      className="h-11 bg-gradient-to-r from-rose-600 to-red-500 hover:from-rose-700 hover:to-red-600 text-white font-semibold rounded-[16px] shadow-xs border-none flex items-center justify-center gap-2 active:scale-98 cursor-pointer transition-all text-xs tracking-wider"
                    >
                      <Fingerprint className="h-4 w-4 text-white" />
                      <span>Punch Out</span>
                    </Button>
                    <Button
                      onClick={() => lunchInMutation.mutate()}
                      disabled={lunchInMutation.isPending}
                      className="h-11 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-semibold rounded-[16px] shadow-xs border-none flex items-center justify-center gap-2 active:scale-98 cursor-pointer transition-all text-xs tracking-wider"
                    >
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
                ) : !todayLog?.lunchOutTime ? (
                  // Currently on lunch: Must end lunch break
                  <Button
                    onClick={() => lunchOutMutation.mutate()}
                    disabled={lunchOutMutation.isPending}
                    className="w-full h-11 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-semibold rounded-[16px] shadow-md border-none flex items-center justify-center gap-2 active:scale-98 cursor-pointer transition-all duration-300 text-xs tracking-wider"
                  >
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
                    onClick={() => handleOpenScanner("punch-out")}
                    className="w-full h-11 bg-gradient-to-r from-rose-600 to-red-500 hover:from-rose-700 hover:to-red-600 text-white font-semibold rounded-[16px] shadow-md border-none flex items-center justify-center gap-2 active:scale-98 cursor-pointer transition-all duration-300 text-xs tracking-wider group"
                  >
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
                {profile?.allowMultiplePunches && (
                  <Button
                    onClick={() => {
                      if (!location) {
                        refreshLocation();
                      }
                      setShowLocationVerification(true);
                    }}
                    className="w-full h-11 bg-gradient-to-r from-[#501537] to-[#7B2453] hover:from-[#6B1C4B] hover:to-[#912D64] text-white font-semibold rounded-[16px] shadow-md border-none flex items-center justify-center gap-2 active:scale-98 cursor-pointer transition-all duration-300 text-xs tracking-wider relative overflow-hidden group"
                  >
                    <Fingerprint className="h-4.5 w-4.5 text-white group-hover:scale-110 transition-transform duration-300" />
                    <span>Punch In For Next Shift</span>
                  </Button>
                )}
              </div>
            )}
          </div>

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
                </h4>

                <div className="flex items-baseline gap-1.5 mt-0.5">
                  <span className="text-2xl font-semibold text-slate-800 dark:text-white leading-none font-sans">
                    ₹{currentMonthSalary ? currentMonthSalary.totalSalary.toLocaleString() : (profile?.salary || 0).toLocaleString()}
                  </span>
                  <span className="text-[9.5px] text-slate-400 font-medium uppercase tracking-wider">
                    {currentMonthSalary?.employmentType || profile?.employmentType || "monthly"}
                  </span>
                </div>

                {currentMonthSalary?.remarks && (
                  <p className="text-[8.5px] text-slate-400 font-medium truncate mt-1">
                    {currentMonthSalary.remarks}
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
                  Confirm your coordinates and choose your tracking settings.
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
                  <UserLocationMap
                    lat={location.lat}
                    lng={location.lng}
                    initials={initials}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center text-center p-4 text-slate-400 gap-2">
                    <MapPin className="h-8 w-8 text-rose-500 animate-bounce" />
                    <p className="text-xs font-semibold text-rose-500">GPS Permission or Coordinates Required</p>
                    <p className="text-[10px] text-slate-500">Enable location access in browser settings</p>
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

              {/* Live Tracking Consent toggle switch */}
              <div className="flex items-center justify-between p-3 bg-[#501537]/5 dark:bg-white/5 rounded-xl border border-[#501537]/10 dark:border-white/5">
                <div className="flex flex-col text-left gap-0.5 max-w-[85%]">
                  <span className="text-[9.5px] font-bold text-[#501537] dark:text-white uppercase tracking-wider">
                    Enable Real-time Tracking
                  </span>
                  <span className="text-[9px] text-slate-500 dark:text-slate-400 leading-tight">
                    Allows reporting your live position to the manager during this shift.
                  </span>
                </div>
                <Switch
                  checked={liveTrackingConsent}
                  onCheckedChange={setLiveTrackingConsent}
                />
              </div>

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
                    if (profile?.branchId && !location) {
                      toast.error("Location access is required to punch in at your office branch.");
                      return;
                    }
                    localStorage.setItem(`live-tracking-allowed-${profile?._id}`, liveTrackingConsent ? "true" : "false");
                    setShowLocationVerification(false);
                    handleOpenScanner("punch-in");
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
                ) : (
                  <div className="text-[9px] font-bold text-emerald-500 uppercase tracking-widest flex items-center justify-center gap-1 py-1.5 animate-pulse">
                    <CheckCircle className="h-4 w-4 text-emerald-500" />
                    <span>Processing Session...</span>
                  </div>
                )}

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
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}

export default UserDashboard;
