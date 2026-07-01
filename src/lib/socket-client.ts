import { io, Socket } from "socket.io-client";

// Socket.IO is only enabled when an explicit socket endpoint is configured.
// Do not derive a socket URL from the API host unless the backend supports Socket.IO.
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "";
const isSocketEnabled = Boolean(SOCKET_URL);

let socket: Socket | null = null;

export function canUseSocket(): boolean {
  return isSocketEnabled;
}

export function getSocket(): Socket | null {
  if (!socket && isSocketEnabled) {
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
