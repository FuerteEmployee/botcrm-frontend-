import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

/**
 * The employee's current position, shown in the punch location-consent modal.
 *
 * Lives in its own module so it can be lazy-loaded. It is the ONLY thing on the
 * employee home that needs Leaflet, and importing it there statically put ~148
 * KB of mapping library into the download and parse cost of every app open —
 * for a map most people never see, inside a dialog most punches never open.
 *
 * Default-exported because React.lazy expects a default.
 */
export default function UserLocationMap({ lat, lng, initials }: { lat: number; lng: number; initials: string }) {
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
      "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        maxZoom: 19,
        subdomains: "abc",
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
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

    // Leaflet reads the container's pixel size at the instant `L.map()` runs.
    // This map mounts inside a framer-motion modal that's still animating in
    // (opacity/scale/y), so the container can be zero-sized or mid-transition
    // right then — Leaflet silently freezes on that wrong size, leaving the
    // map blank/mis-centered until something else forces a resize. Force a
    // recompute once the entrance animation has settled, and keep recomputing
    // if the container itself ever resizes (e.g. the modal's own layout shifts).
    const settleTimer = setTimeout(() => map.invalidateSize(), 350);
    const resizeObserver = new ResizeObserver(() => map.invalidateSize());
    resizeObserver.observe(container);

    return () => {
      clearTimeout(settleTimer);
      resizeObserver.disconnect();
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
