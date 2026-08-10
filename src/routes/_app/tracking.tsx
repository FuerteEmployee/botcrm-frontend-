import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo, useRef } from "react";
import { MapPin, Wifi, WifiOff, Search, Play, Square, Radio, Route as RouteIcon, Users, ChevronLeft, ChevronRight, RefreshCw, Satellite, Map as MapIcon, Navigation, Ruler } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { ViewToggle } from "@/components/shared/view-toggle";
import { FormInput } from "@/components/shared/form-input";
import { DataTable, DataTableCell, DataTableRow } from "@/components/shared/data-table";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/shared/stat-card";
import { useTrackingService, useTrackingStats, useTrackingHistory, usePingEmployee } from "@/services/tracking-service";
import { useEmployeeService } from "@/services/employee-service";
import { useAttendanceService } from "@/services/attendance-service";
import { cn, toISTDateKey } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { SkeletonLoader } from "@/components/shared/skeleton-loader";
import { useLayoutSettings } from "@/hooks/use-layout-settings";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

import L from "leaflet";
import "leaflet/dist/leaflet.css";

export const Route = createFileRoute("/_app/tracking")({
  component: TrackingPage,
});

const TILE_LAYERS = {
  street: {
    url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  },
  satellite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri",
  },
};

// Imperative Leaflet map — avoids react-leaflet's callback-ref pattern that
// triggers "Map container is already initialized" under React 19 StrictMode.
function TrackingMap({
  locations,
  employees,
  selectedId,
  onSelect,
  routePoints,
  tileMode,
}: {
  locations: any[];
  employees: any[];
  selectedId: string;
  onSelect: (id: string) => void;
  routePoints?: { latitude: number; longitude: number; timestamp: string }[];
  tileMode: "street" | "satellite";
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const routeLayerRef = useRef<L.LayerGroup | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  // Initialize Leaflet map once. Passive useEffect means StrictMode's
  // cleanup → re-run cycle calls map.remove() + delete _leaflet_id before
  // re-initializing, so the "already initialized" error never fires.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Safety: clear any stale Leaflet stamp (extra guard for StrictMode)
    delete (container as any)._leaflet_id;

    const map = L.map(container, {
      center: [20.5937, 78.9629],
      zoom: 5,
      zoomControl: false,
    });

    const initialTiles = TILE_LAYERS.street;
    tileLayerRef.current = L.tileLayer(initialTiles.url, { attribution: initialTiles.attribution }).addTo(map);

    L.control.zoom({ position: "bottomright" }).addTo(map);
    L.control.scale({ position: "bottomleft", imperial: false }).addTo(map);

    routeLayerRef.current = L.layerGroup().addTo(map);

    mapRef.current = map;

    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current.clear();
      map.remove();
      mapRef.current = null;
      tileLayerRef.current = null;
      routeLayerRef.current = null;
    };
  }, []);

  // Swap the base tile layer when the admin toggles Street / Satellite
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (tileLayerRef.current) tileLayerRef.current.remove();
    const tiles = TILE_LAYERS[tileMode];
    tileLayerRef.current = L.tileLayer(tiles.url, { attribution: tiles.attribution }).addTo(map);
    tileLayerRef.current.bringToBack();
  }, [tileMode]);

  // Draw the selected employee's route as a polyline with Start/End markers
  useEffect(() => {
    const map = mapRef.current;
    const layer = routeLayerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    if (!routePoints || routePoints.length === 0) return;

    const latlngs = routePoints.map((p) => [p.latitude, p.longitude] as L.LatLngTuple);
    L.polyline(latlngs, { color: "#2563eb", weight: 3, opacity: 0.85 }).addTo(layer);

    const pin = (color: string) => L.divIcon({
      className: "route-endpoint-marker",
      html: `<div style="width:14px;height:14px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.35);"></div>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    });

    const fmt = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true });

    L.marker(latlngs[0], { icon: pin("#16a34a") })
      .bindTooltip(`Start · ${fmt(routePoints[0].timestamp)}`, { permanent: true, direction: "top", offset: [0, -8], className: "route-time-label" })
      .addTo(layer);

    if (latlngs.length > 1) {
      L.marker(latlngs[latlngs.length - 1], { icon: pin("#dc2626") })
        .bindTooltip(`End · ${fmt(routePoints[routePoints.length - 1].timestamp)}`, { permanent: true, direction: "top", offset: [0, -8], className: "route-time-label" })
        .addTo(layer);
    }

    // Label a handful of waypoints along the way (roughly every 15 min of
    // elapsed time) so the whole day's path reads like a timeline, not just
    // its two ends — without a label crowding every single 15s-interval point.
    const WAYPOINT_INTERVAL_MS = 15 * 60 * 1000;
    const dotIcon = L.divIcon({
      className: "route-waypoint-marker",
      html: `<div style="width:9px;height:9px;border-radius:50%;background:#2563eb;border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.35);"></div>`,
      iconSize: [9, 9],
      iconAnchor: [4, 4],
    });
    let lastLabeledAt = new Date(routePoints[0].timestamp).getTime();
    for (let i = 1; i < routePoints.length - 1; i++) {
      const t = new Date(routePoints[i].timestamp).getTime();
      if (t - lastLabeledAt < WAYPOINT_INTERVAL_MS) continue;
      lastLabeledAt = t;
      L.marker(latlngs[i], { icon: dotIcon })
        .bindTooltip(fmt(routePoints[i].timestamp), { permanent: true, direction: "top", offset: [0, -5], className: "route-time-label" })
        .addTo(layer);
    }

    map.fitBounds(latlngs, { padding: [60, 60], maxZoom: 16 });
  }, [routePoints]);

  // Sync markers whenever locations, employees, or selectedId change
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const activeIds = new Set(locations.map((l) => l.employeeId));

    markersRef.current.forEach((marker, id) => {
      if (!activeIds.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    });

    locations.forEach((loc) => {
      const emp = employees.find((e: any) => e._id === loc.employeeId);
      if (!emp) return;

      const isSel = selectedId === emp._id;
      const initials = emp.name
        .split(" ")
        .map((s: string) => s[0])
        .slice(0, 2)
        .join("")
        .toUpperCase();

      const icon = L.divIcon({
        className: "custom-leaflet-marker",
        html: `
          <div style="position:relative;display:flex;flex-direction:column;align-items:center;cursor:pointer;">
            ${isSel ? '<span style="position:absolute;top:-4px;width:44px;height:44px;border-radius:50%;background:rgba(140,32,89,0.25);animation:ping 1.5s cubic-bezier(0,0,0.2,1) infinite;"></span>' : ""}
            <div style="position:relative;width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#8C2059 0%,#501537 100%);color:white;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;border:2px solid white;box-shadow:0 4px 10px rgba(0,0,0,0.25);transform:scale(${isSel ? "1.15" : "1"});transition:transform 0.2s ease-in-out;">
              ${initials}
            </div>
            <div style="margin-top:4px;background:rgba(15,23,42,0.85);color:white;font-size:9px;font-weight:600;padding:2px 6px;border-radius:4px;box-shadow:0 2px 4px rgba(0,0,0,0.15);border:1px solid rgba(255,255,255,0.1);white-space:nowrap;">
              ${emp.name.split(" ")[0]}
            </div>
          </div>`,
        iconSize: [40, 50],
        iconAnchor: [20, 20],
      });

      const existing = markersRef.current.get(loc.employeeId);
      if (existing) {
        existing.setLatLng([loc.latitude, loc.longitude]);
        existing.setIcon(icon);
      } else {
        const marker = L.marker([loc.latitude, loc.longitude], { icon });
        marker.on("click", () => onSelectRef.current(emp._id));
        marker.addTo(map);
        markersRef.current.set(loc.employeeId, marker);
      }
    });

    if (!selectedId && locations.length > 0) {
      const coords = locations.map(
        (l) => [l.latitude, l.longitude] as L.LatLngTuple
      );
      if (coords.length === 1) {
        map.setView(coords[0], 14, { animate: true });
      } else {
        map.fitBounds(coords as L.LatLngBoundsExpression, {
          padding: [50, 50],
          maxZoom: 14,
        });
      }
    }
  }, [locations, employees, selectedId]);

  // Pan to selected employee — or back to a neutral view if they have no
  // location yet, so the map doesn't just sit wherever it last was showing
  // a completely different (and now-hidden) employee's marker.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedId) return;
    const target = locations.find((l) => l.employeeId === selectedId);
    if (target) {
      map.setView([target.latitude, target.longitude], 16, { animate: true });
    } else {
      map.setView([20.5937, 78.9629], 5, { animate: true });
    }
  }, [selectedId, locations]);

  return <div ref={containerRef} style={{ height: "100%", width: "100%" }} />;
}

function TrackingPage() {
  const { employees, isLoading: loadingEmployees, updateEmployee } = useEmployeeService({ limit: 1000, status: "active" });
  const { locations: restLocations, isLoading: loadingLocations } = useTrackingService();

  // Admin toggles per-employee live tracking. updateEmployee persists the flag
  // and refetches the list, so the switch reflects the saved state. Employees
  // are only tracked while punched in AND when this is enabled.
  const toggleTracking = (e: any) => {
    updateEmployee({ id: e._id, data: { trackingEnabled: !e.trackingEnabled } }).catch(() => {});
  };

  // Fetch today's attendance in two formats — some backends need date, some need none.
  // IST-keyed (not a raw UTC slice) — attendance `date` fields are anchored to IST
  // midnight server-side regardless of what timezone either server happens to run in.
  const today = toISTDateKey(new Date());
  const { records: attendanceWithDate } = useAttendanceService(today, today);
  const { records: attendanceAll, lunchIn, lunchOut } = useAttendanceService();

  // Merge both: dated records take priority (fresher), fill gaps with undated
  const attendanceList = useMemo(() => {
    const map: Record<string, any> = {};
    attendanceAll.forEach((a) => { if (a.employeeId?._id) map[a.employeeId._id] = a; });
    attendanceWithDate.forEach((a) => { if (a.employeeId?._id) map[a.employeeId._id] = a; });
    return Object.values(map);
  }, [attendanceWithDate, attendanceAll]);

  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const { defaultLayout } = useLayoutSettings();
  const [view, setView] = useState<"grid" | "list">(defaultLayout);

  useEffect(() => {
    setView(defaultLayout);
  }, [defaultLayout]);

  const { stats } = useTrackingStats();
  const [tileMode, setTileMode] = useState<"street" | "satellite">("street");
  const [selectedDate, setSelectedDate] = useState(today);
  const isToday = selectedDate === today;
  const { points: routePoints, distanceKm, refetch: refetchHistory } = useTrackingHistory(selectedId || undefined, selectedDate);
  const { mutateAsync: pingEmployee, isPending: isPinging } = usePingEmployee();

  const shiftDate = (deltaDays: number) => {
    const d = new Date(selectedDate + "T00:00:00");
    d.setDate(d.getDate() + deltaDays);
    setSelectedDate(toISTDateKey(d));
  };

  const handlePing = async (employeeId: string) => {
    try {
      await pingEmployee(employeeId);
      toast.success("Ping sent — waiting for a fresh location.");
      setTimeout(() => refetchHistory(), 4000);
    } catch {
      toast.error("Could not reach that device.");
    }
  };

  const attendanceMap = useMemo(() => {
    const map: Record<string, any> = {};
    attendanceList.forEach((a) => {
      if (a.employeeId?._id) {
        map[a.employeeId._id] = a;
      }
    });
    return map;
  }, [attendanceList]);

  // Extract coordinates from any location format the backend might return
  const extractCoords = (record: any): { lat: number; lng: number } | null => {
    // Try every field name / nesting the HRMS backend could use
    const candidates = [
      record?.punchInLocation,
      record?.location,
      record?.punchIn,
      record?.punchInCoords,
    ];

    for (const raw of candidates) {
      if (!raw) continue;

      // Object with lat/lng or latitude/longitude
      if (typeof raw === "object" && !Array.isArray(raw)) {
        const lat = raw.lat ?? raw.latitude;
        const lng = raw.lng ?? raw.longitude;
        if (lat && lng) return { lat: Number(lat), lng: Number(lng) };
      }

      // JSON-encoded string e.g. '{"lat":22.3,"lng":70.7}'
      if (typeof raw === "string") {
        try {
          const parsed = JSON.parse(raw);
          const lat = parsed.lat ?? parsed.latitude;
          const lng = parsed.lng ?? parsed.longitude;
          if (lat && lng) return { lat: Number(lat), lng: Number(lng) };
        } catch {
          // not JSON — skip
        }

        // Comma-separated "22.3,70.7"
        const parts = raw.split(",");
        if (parts.length === 2) {
          const lat = parseFloat(parts[0]);
          const lng = parseFloat(parts[1]);
          if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
            return { lat, lng };
          }
        }
      }
    }

    // Flat fields directly on the attendance record
    const flatLat = record?.punchInLat ?? record?.lat ?? record?.latitude;
    const flatLng = record?.punchInLng ?? record?.lng ?? record?.longitude;
    if (flatLat && flatLng) {
      return { lat: Number(flatLat), lng: Number(flatLng) };
    }

    return null;
  };

  // Build location map: live tracking data takes priority; fall back to punch-in coords
  const locationMap = useMemo(() => {
    const map: Record<string, any> = {};

    // Step 1 — seed with punch-in location from today's attendance (fallback)
    attendanceList.forEach((a) => {
      if (!a.employeeId?._id || !a.punchIn) return;
      const coords = extractCoords(a);
      if (coords) {
        map[a.employeeId._id] = {
          employeeId: a.employeeId._id,
          latitude: coords.lat,
          longitude: coords.lng,
          timestamp: a.punchIn,
          isFallback: true,
        };
      }
    });

    // Step 2 — overlay live tracking positions (overrides fallback)
    restLocations.forEach((l) => {
      if (l.latitude && l.longitude) {
        map[l.employeeId] = { ...l, isFallback: false };
      }
    });

    return map;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restLocations, attendanceList]);

  // Flat list of locations to pass to the map component. With nobody selected,
  // show everyone (fleet overview). Once an employee is selected, show only
  // theirs — otherwise an unrelated employee's marker (the only one with real
  // data) stays sitting on screen and reads as "stuck on the wrong person."
  const activeLocations = useMemo(() => {
    const all = Object.values(locationMap).filter((l) => l.latitude && l.longitude);
    if (!selectedId) return all;
    return all.filter((l) => l.employeeId === selectedId);
  }, [locationMap, selectedId]);

  const selectedHasNoLocation = !!selectedId && !locationMap[selectedId];

  const filtered = useMemo(() => {
    return (employees || []).filter((e) =>
      e.name.toLowerCase().includes(search.toLowerCase())
    );
  }, [employees, search]);

  const selected = employees?.find((e) => e._id === selectedId);

  if (loadingEmployees || loadingLocations) {
    return (
      <div className="space-y-6">
        <PageHeader title="Employee Tracking" description="Real-time location monitoring of your field staff." />
        <SkeletonLoader type="table" count={10} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Employee Tracking"
        description="Real-time location monitoring of your field staff."
        actions={
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 rounded-xl border border-border/60 bg-white px-1 h-10">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => shiftDate(-1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <button
                type="button"
                onClick={() => setSelectedDate(today)}
                className={cn(
                  "text-[12px] font-semibold px-2 rounded-lg",
                  isToday ? "text-primary" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {isToday ? "Today" : selectedDate}
              </button>
              <Button variant="ghost" size="icon" className="h-8 w-8" disabled={isToday} onClick={() => shiftDate(1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-10 rounded-xl gap-2 font-semibold border-border/60"
              onClick={() => refetchHistory()}
            >
              <RefreshCw className="h-4 w-4 text-muted-foreground" />
              Refresh
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Live Now" value={stats?.liveNow ?? 0} icon={Radio} accent="success" />
        <StatCard label="Offline" value={stats?.offline ?? 0} icon={WifiOff} accent="warning" />
        <StatCard label="Tracking Points" value={stats?.trackingPoints ?? 0} icon={RouteIcon} accent="primary" />
        <StatCard label="Field Staff" value={stats?.fieldStaff ?? 0} icon={Users} accent="info" />
      </div>

      <div className="flex flex-col md:flex-row items-center justify-between gap-3 py-1">
        <div className="flex items-center gap-3 w-full md:w-auto">
          <ViewToggle view={view} onViewChange={setView} />
        </div>

        <FormInput
          placeholder="Search employee..."
          icon={Search}
          className="h-10 w-full md:w-[260px] shadow-none"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <AnimatePresence mode="wait">
        {view === "grid" ? (
          <motion.div
            key="map-view"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="grid grid-cols-1 lg:grid-cols-3 gap-4"
          >
            {/* Employee List Sidebar */}
            <Card className="p-4 border border-border/60 bg-white rounded-xl shadow-sm lg:col-span-1 flex flex-col h-[560px] transition-all hover:border-primary/40">
              <div className="flex-1 overflow-y-auto scrollbar-thin space-y-1.5 pr-1">
                {filtered.map((e) => {
                  const att = attendanceMap[e._id];
                  const loc = locationMap[e._id];
                  const isOnline = att && att.punchIn && !att.punchOut;
                  const isOnLunch = att && att.lunchInTime && !att.lunchOutTime;
                  return (
                    <motion.div
                      key={e._id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedId(e._id)}
                      whileHover={{ x: 2 }}
                      className={cn(
                        "w-full text-left flex items-center gap-3 p-2.5 rounded-lg border transition-all cursor-pointer",
                        selectedId === e._id
                          ? "border-primary/30 bg-primary/5 shadow-sm"
                          : "border-border/50 hover:bg-muted/30 hover:border-border",
                      )}
                    >
                      <div className="relative shrink-0">
                        <Avatar className="h-9 w-9">
                          <AvatarFallback className="bg-primary/10 text-primary text-[11px] font-semibold">
                            {e.name.split(" ").map((s) => s[0]).slice(0, 2).join("")}
                          </AvatarFallback>
                        </Avatar>
                        <span
                          className={cn(
                            "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-card",
                            isOnline ? (isOnLunch ? "bg-amber-500" : "bg-success") : "bg-muted-foreground/50",
                          )}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-medium truncate">{e.name}</div>
                        <div className="text-[11px] text-muted-foreground truncate flex items-center gap-1">
                          <MapPin className="h-2.5 w-2.5 shrink-0" />
                          {loc
                            ? `${loc.latitude.toFixed(4)}, ${loc.longitude.toFixed(4)}${loc.isFallback ? " (punch-in)" : ""}`
                            : "No location data"}
                        </div>
                      </div>
                      <Badge
                        variant={isOnline ? "default" : "secondary"}
                        className="capitalize text-[10px] px-1.5 py-0 shrink-0"
                      >
                        {isOnline ? (isOnLunch ? "On Lunch" : "Online") : "Away"}
                      </Badge>
                      <span
                        onClick={(ev) => ev.stopPropagation()}
                        className="shrink-0 flex items-center"
                        title={e.trackingEnabled ? "Live tracking ON" : "Live tracking OFF"}
                      >
                        <Switch checked={!!e.trackingEnabled} onCheckedChange={() => toggleTracking(e)} />
                      </span>
                    </motion.div>
                  );
                })}
              </div>
            </Card>

            {/* Map Area */}
            <Card className="p-0 border border-border/60 bg-white rounded-xl shadow-sm lg:col-span-2 overflow-hidden h-[560px] relative">
              <TrackingMap
                locations={activeLocations}
                employees={employees}
                selectedId={selectedId}
                onSelect={setSelectedId}
                routePoints={selectedId ? routePoints : undefined}
                tileMode={tileMode}
              />

              {/* Street / Satellite toggle */}
              <div className="absolute top-3 left-3 z-[1000] flex items-center gap-1 rounded-xl bg-white/95 shadow-md border border-border/50 p-1">
                <button
                  type="button"
                  onClick={() => setTileMode("street")}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wide transition-colors",
                    tileMode === "street" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted/50"
                  )}
                >
                  <MapIcon className="h-3 w-3" /> Street
                </button>
                <button
                  type="button"
                  onClick={() => setTileMode("satellite")}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wide transition-colors",
                    tileMode === "satellite" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted/50"
                  )}
                >
                  <Satellite className="h-3 w-3" /> Satellite
                </button>
              </div>

              {/* Clear empty state instead of leaving a stale/unrelated marker on screen */}
              {selectedHasNoLocation && selected && (
                <div className="absolute inset-0 z-[999] flex items-center justify-center pointer-events-none">
                  <div className="glass rounded-xl px-4 py-3 shadow-lg border border-white/20 text-center max-w-xs">
                    <p className="text-[12px] font-semibold text-foreground/80">No location reported yet for {selected.name}</p>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Tracking starts once they punch in with location permission granted.
                    </p>
                  </div>
                </div>
              )}

              {/* Info card for selected employee */}
              {selected && (
                <motion.div
                  key={selected._id}
                  initial={{ y: 16, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  className="absolute bottom-4 left-4 right-4 sm:right-auto sm:max-w-xs glass rounded-xl p-3.5 shadow-lg border border-white/20 z-[1000]"
                >
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10 ring-2 ring-primary/25 shrink-0">
                      <AvatarFallback className="bg-primary/10 text-primary text-[11px] font-semibold">
                        {selected.name.split(" ").map((s) => s[0]).slice(0, 2).join("")}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-semibold truncate">{selected.name}</div>
                      <div className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                        {attendanceMap[selected._id] && attendanceMap[selected._id].punchIn && !attendanceMap[selected._id].punchOut
                          ? <Wifi className="h-3 w-3 text-success shrink-0" />
                          : <WifiOff className="h-3 w-3 shrink-0" />
                        }
                        {attendanceMap[selected._id] && attendanceMap[selected._id].punchIn && !attendanceMap[selected._id].punchOut
                          ? (attendanceMap[selected._id].lunchInTime && !attendanceMap[selected._id].lunchOutTime ? "On Lunch Break" : "Online now")
                          : "Last seen N/A"}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 gap-1 text-[10px] font-bold shrink-0"
                      disabled={isPinging}
                      onClick={() => handlePing(selected._id)}
                    >
                      <Navigation className="h-3 w-3" /> Ping
                    </Button>
                  </div>

                  <div className="mt-2.5 space-y-1">
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <MapPin className="h-3 w-3 shrink-0" />
                      {locationMap[selected._id]
                        ? locationMap[selected._id].isFallback
                          ? `Punch-in location · ${new Date(locationMap[selected._id].timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true })}`
                          : `Live · ${new Date(locationMap[selected._id].timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true })}`
                        : "No coordinates available"}
                    </div>
                    {locationMap[selected._id] && (
                      <div className="text-[10px] font-mono text-muted-foreground/70">
                        {locationMap[selected._id].latitude.toFixed(4)}°N · {locationMap[selected._id].longitude.toFixed(4)}°E
                      </div>
                    )}
                    {routePoints.length > 0 && (
                      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground pt-0.5">
                        <Ruler className="h-3 w-3 shrink-0" />
                        {distanceKm} km travelled {isToday ? "today" : `on ${selectedDate}`} · {routePoints.length} point{routePoints.length === 1 ? "" : "s"}
                      </div>
                    )}
                  </div>

                  <div className="mt-4 flex gap-2">
                    {attendanceMap[selected._id] && attendanceMap[selected._id].punchIn && !attendanceMap[selected._id].punchOut && (
                      <>
                        {!(attendanceMap[selected._id].lunchInTime && !attendanceMap[selected._id].lunchOutTime) ? (
                          <Button
                            size="sm"
                            className="flex-1 h-8 text-[11px] font-bold bg-amber-500 hover:bg-amber-600 border-none shadow-sm"
                            onClick={() => lunchIn({ employeeId: selected._id })}
                          >
                            <Play className="h-3 w-3 mr-1.5 fill-current" />
                            START LUNCH
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            className="flex-1 h-8 text-[11px] font-bold bg-slate-800 hover:bg-slate-900 border-none shadow-sm"
                            onClick={() => lunchOut({ employeeId: selected._id })}
                          >
                            <Square className="h-3 w-3 mr-1.5 fill-current" />
                            END LUNCH
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </motion.div>
              )}
            </Card>
          </motion.div>
        ) : (
          <motion.div
            key="list-view"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <DataTable
              headers={["Employee", "Tracking", "Status", "Connectivity", "Last Location", "Last Updated"]}
              isEmpty={filtered.length === 0}
            >
              {filtered.map((e) => {
                const att = attendanceMap[e._id];
                const loc = locationMap[e._id];
                const isOnline = att && att.punchIn && !att.punchOut;
                const isOnLunch = att && att.lunchInTime && !att.lunchOutTime;
                return (
                  <DataTableRow key={e._id}>
                    <DataTableCell isFirst>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="bg-primary/10 text-primary text-[10px] font-bold">
                            {e.name.split(" ").map((n: string) => n[0]).join("")}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col">
                          <span className="font-bold text-[13px] text-foreground">{e.name}</span>
                          <span className="text-[11px] text-muted-foreground">{e.phone}</span>
                        </div>
                      </div>
                    </DataTableCell>
                    <DataTableCell>
                      <span title={e.trackingEnabled ? "Live tracking ON" : "Live tracking OFF"}>
                        <Switch checked={!!e.trackingEnabled} onCheckedChange={() => toggleTracking(e)} />
                      </span>
                    </DataTableCell>
                    <DataTableCell>
                      <Badge
                        variant={isOnline ? "default" : "secondary"}
                        className="capitalize text-[10px] px-2 py-0.5"
                      >
                        {isOnline ? (isOnLunch ? "On Lunch" : "Online") : "Away"}
                      </Badge>
                    </DataTableCell>
                    <DataTableCell>
                      <div className="flex items-center gap-1.5 text-[12px]">
                        {isOnline ? <Wifi className="h-3.5 w-3.5 text-success" /> : <WifiOff className="h-3.5 w-3.5 text-muted-foreground" />}
                        <span className={cn(
                          isOnLunch ? "text-amber-500 font-medium" : (isOnline ? "text-success font-medium" : "text-muted-foreground")
                        )}>
                          {isOnLunch ? "Lunch Break" : (isOnline ? "Active" : "Disconnected")}
                        </span>
                      </div>
                    </DataTableCell>
                    <DataTableCell className="text-[12px] text-muted-foreground italic">
                      <div className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {loc
                          ? `${loc.latitude.toFixed(4)}, ${loc.longitude.toFixed(4)}`
                          : "No data"}
                      </div>
                    </DataTableCell>
                    <DataTableCell isLast className="text-[12px] text-muted-foreground">
                      {loc
                        ? `${new Date(loc.timestamp).toLocaleString()}${loc.isFallback ? " (punch-in)" : ""}`
                        : "—"}
                    </DataTableCell>
                  </DataTableRow>
                );
              })}
            </DataTable>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
