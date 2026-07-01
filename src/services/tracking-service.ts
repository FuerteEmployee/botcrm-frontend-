import { useState, useEffect } from "react";
import { apiClient } from "@/lib/api-client";
import { canUseSocket, getSocket } from "@/lib/socket-client";

export interface Location {
  _id: string;
  employeeId: string;
  latitude: number;
  longitude: number;
  accuracy?: number;
  timestamp: string;
}

function normalizeLocations(raw: any): Location[] {
  const list: any[] = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.data)
    ? raw.data
    : Array.isArray(raw?.locations)
    ? raw.locations
    : [];

  return list
    .map((item) => ({
      _id: item._id ?? item.employeeId ?? "",
      employeeId:
        typeof item.employeeId === "object" && item.employeeId !== null
          ? item.employeeId._id
          : item.employeeId ?? "",
      latitude: item.latitude ?? item.lat ?? 0,
      longitude: item.longitude ?? item.lng ?? 0,
      accuracy: item.accuracy,
      timestamp: item.timestamp ?? item.updatedAt ?? new Date().toISOString(),
    }))
    .filter((l) => l.employeeId && l.latitude !== 0 && l.longitude !== 0);
}

function snapshotToLocations(snapshot: Record<string, any>): Location[] {
  return Object.entries(snapshot)
    .map(([empId, data]: [string, any]) => ({
      _id: empId,
      employeeId: empId,
      latitude: data.lat ?? data.latitude ?? 0,
      longitude: data.lng ?? data.longitude ?? 0,
      accuracy: data.accuracy,
      timestamp: new Date(data.timestamp ?? Date.now()).toISOString(),
    }))
    .filter((l) => l.latitude !== 0 && l.longitude !== 0);
}

export function useTrackingService() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // 1. Initial snapshot via REST (shows data even before socket connects)
    apiClient
      .get("/tracking/latest")
      .then(({ data }) => {
        const normalized = normalizeLocations(data);
        if (normalized.length > 0) setLocations(normalized);
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));

    // 2. Socket.IO — real-time channel the server uses
    const socket = canUseSocket() ? getSocket() : null;
    const joinAdmin = () => {
      socket?.emit("join:admin");
    };

    // Join admin room immediately (and on every reconnect)
    joinAdmin();
    socket?.on("connect", joinAdmin);

    // Full snapshot: server sends this right after 'join:admin'
    socket?.on("location:snapshot", (snapshot: Record<string, any>) => {
      const locs = snapshotToLocations(snapshot);
      setLocations(locs);
      setIsLoading(false);
    });

    // Single employee update
    socket?.on("location:broadcast", (data: any) => {
      const { employeeId, lat, lng, latitude, longitude, accuracy, timestamp } = data;
      const resolvedLat = lat ?? latitude ?? 0;
      const resolvedLng = lng ?? longitude ?? 0;
      if (!employeeId || resolvedLat === 0) return;

      const updated: Location = {
        _id: employeeId,
        employeeId,
        latitude: resolvedLat,
        longitude: resolvedLng,
        accuracy,
        timestamp: new Date(timestamp ?? Date.now()).toISOString(),
      };

      setLocations((prev) => [
        ...prev.filter((l) => l.employeeId !== employeeId),
        updated,
      ]);
    });

    // Employee went offline — remove from map
    socket?.on("employee:offline", ({ employeeId }: { employeeId: string }) => {
      setLocations((prev) => prev.filter((l) => l.employeeId !== employeeId));
    });

    // 3. REST polling fallback every 30s (covers gaps if socket events are missed)
    const pollInterval = setInterval(() => {
      apiClient
        .get("/tracking/latest")
        .then(({ data }) => {
          const normalized = normalizeLocations(data);
          if (normalized.length > 0) setLocations(normalized);
        })
        .catch(() => {});
    }, 30000);

    return () => {
      socket?.off("connect", joinAdmin);
      socket?.off("location:snapshot");
      socket?.off("location:broadcast");
      socket?.off("employee:offline");
      clearInterval(pollInterval);
    };
  }, []);

  return { locations, isLoading };
}
