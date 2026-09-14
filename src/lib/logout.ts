import { apiClient } from "./api-client";
import { clearSession } from "./auth";

/**
 * User-initiated sign-out. Tells the server first so the access log gets a real
 * logout event to pair with the login — sessions used to be cleared client-side
 * only, leaving the server unable to tell a sign-out from a closed tab.
 *
 * Lives in its own module because it needs both apiClient and clearSession, and
 * api-client already imports auth — putting it in either would create a cycle.
 *
 * Use this for deliberate sign-outs only. The forced logout in api-client's 401
 * handler must keep calling clearSession() directly: that token is already
 * rejected, so posting to /users/logout with it would 401 as well.
 */
export async function logoutAndClear(): Promise<void> {
  try {
    await apiClient.post("/users/logout", {});
  } catch {
    // Best-effort. The user asked to leave, so a failed audit write must never
    // strand them in a signed-in state.
  }
  clearSession();
}
