import { io, Socket } from "socket.io-client";

// Derive socket URL from API URL if VITE_SOCKET_URL is not explicitly set.
// This way, if the HRMS backend itself has Socket.IO (same server), it just works.
const apiBase = import.meta.env.VITE_API_URL || "https://gray-crab-756474.hostingersite.com/api";
const derivedSocketUrl = apiBase.replace(/\/api\/?$/, ""); // strip /api suffix
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || derivedSocketUrl;

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(SOCKET_URL, {
      transports: ["websocket", "polling"],
      autoConnect: true,
      reconnection: true,
      reconnectionDelay: 2000,
      reconnectionAttempts: Infinity,
    });
  }
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
