import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { ExternalLink, MapPin } from "lucide-react";

// Map preview for a branch fence: the marker, the allowed radius, and the exit
// buffer drawn around it.
//
// The two circles are not decoration. The inner one is the radius a punch must
// fall inside; the outer dashed one is where an auto punch-out becomes possible
// (radius + buffer). Showing only the radius makes every auto punch-out between
// the two look like a bug, because the employee was "just outside the circle"
// on a map that never drew the line the decision actually used.
//
// Imperative Leaflet, matching routes/_app/tracking.tsx: react-leaflet's
// callback-ref pattern double-initialises under StrictMode.

/**
 * Distance past the radius before an exit counts, in metres.
 *
 * Mirrors backend `exitBufferM()` in utils/distance.js: half the radius,
 * clamped to 20-50 m, and never below the 35 m accuracy gate -- a buffer
 * tighter than the GPS error would fire on noise alone.
 */
export function exitBufferM(radiusM: number) {
  const scaled = Math.min(50, Math.max(20, Math.round((radiusM || 0) * 0.5)));
  return Math.max(35, scaled);
}

interface Props {
  lat: number;
  lng: number;
  radius: number;
  /** Dim the fence circles when the branch has geofencing switched off. */
  enabled?: boolean;
  className?: string;
}

export function GeofenceMapPreview({ lat, lng, radius, enabled = true, className }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layersRef = useRef<L.LayerGroup | null>(null);

  const hasPoint = Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0);

  // Create once.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;

    // StrictMode's mount/cleanup/mount cycle can leave a stale stamp behind.
    delete (container as unknown as { _leaflet_id?: number })._leaflet_id;

    const map = L.map(container, {
      zoomControl: false,
      attributionControl: false,
      // The preview lives inside a scrollable dialog; wheel-zoom would steal
      // the scroll the moment the pointer crossed the map.
      scrollWheelZoom: false,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(map);
    L.control.zoom({ position: "bottomright" }).addTo(map);

    mapRef.current = map;
    layersRef.current = L.layerGroup().addTo(map);

    return () => {
      map.remove();
      mapRef.current = null;
      layersRef.current = null;
    };
  }, []);

  // Redraw whenever the point, the radius or the switch changes.
  useEffect(() => {
    const map = mapRef.current;
    const layers = layersRef.current;
    if (!map || !layers) return;

    layers.clearLayers();
    if (!hasPoint) return;

    const effectiveRadius = radius > 0 ? radius : 3000;
    const buffer = exitBufferM(effectiveRadius);

    // Outer: where an exit is actually confirmed.
    L.circle([lat, lng], {
      radius: effectiveRadius + buffer,
      color: enabled ? "#f59e0b" : "#94a3b8",
      weight: 1.5,
      dashArray: "6 6",
      fillOpacity: 0,
      opacity: enabled ? 0.75 : 0.3,
    }).addTo(layers);

    // Inner: the radius a punch must fall inside.
    L.circle([lat, lng], {
      radius: effectiveRadius,
      color: enabled ? "#16a34a" : "#94a3b8",
      weight: 2,
      fillColor: enabled ? "#16a34a" : "#94a3b8",
      fillOpacity: enabled ? 0.12 : 0.05,
    }).addTo(layers);

    L.marker([lat, lng], {
      icon: L.divIcon({
        className: "geofence-branch-marker",
        html:
          '<div style="width:30px;height:30px;border-radius:50%;background:linear-gradient(135deg,#8C2059,#501537);' +
          'border:2px solid white;box-shadow:0 3px 8px rgba(0,0,0,0.3);display:flex;align-items:center;' +
          'justify-content:center;color:white;font-size:14px;">&#9679;</div>',
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      }),
    }).addTo(layers);

    // Frame the outer circle with a little breathing room.
    //
    // L.circle(...).getBounds() crashes here: Leaflet's Circle computes its
    // bounds from the map's projection (this._map.layerPointToLatLng), which
    // is only set once the circle has actually been added to a map via
    // .addTo(). A circle built just to ask its bounds and never attached has
    // no _map, so Leaflet throws "Cannot read properties of undefined
    // (reading 'layerPointToLatLng')" the moment this ran.
    //
    // LatLng.toBounds(sizeInMeters) is the API built for exactly this --
    // it needs no map or layer at all, computing the box directly from the
    // point and a size in metres. It takes the FULL width/height, not a
    // radius, so a box containing a circle of radius R needs size = 2 * R.
    map.fitBounds(
      L.latLng(lat, lng).toBounds((effectiveRadius + buffer) * 1.15 * 2),
      { animate: false },
    );
  }, [lat, lng, radius, enabled, hasPoint]);

  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground ml-1">
          Map Preview
        </span>
        {hasPoint && (
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[10px] font-black text-primary hover:underline"
          >
            Open in Google Maps <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>

      <div className="relative h-[210px] w-full overflow-hidden rounded-2xl border border-border/40 bg-muted/30">
        <div ref={containerRef} className="h-full w-full" />
        {!hasPoint && (
          <div className="absolute inset-0 grid place-items-center bg-muted/60 backdrop-blur-[1px] text-center px-4">
            <div>
              <MapPin className="h-6 w-6 text-muted-foreground/40 mx-auto mb-1.5" />
              <p className="text-[11px] font-bold text-muted-foreground">
                Set coordinates to preview the fence
              </p>
              <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                Use Auto-detect, or search the address above.
              </p>
            </div>
          </div>
        )}
      </div>

      {hasPoint && (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-semibold text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#16a34a]" />
            Allowed radius
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0 w-3 border-t-2 border-dashed border-[#f59e0b]" />
            Exit buffer (+{exitBufferM(radius > 0 ? radius : 3000)} m)
          </span>
        </div>
      )}
    </div>
  );
}
