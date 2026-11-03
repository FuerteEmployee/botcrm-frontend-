/**
 * One sentence an employee can act on, for a request that failed.
 *
 * Most people using the employee app read little English, so:
 *  - no response at all means the phone could not reach us -- say that, and
 *    that nothing was sent, so they know to try again rather than wait;
 *  - a 4xx carries the server's own validation message, written for people
 *    ("Please enter an amount more than ₹0.") -- show it;
 *  - a 5xx carries whatever an exception said ("Cast to Number failed for
 *    value NaN ...") -- never show that, use the caller's fallback.
 *
 * Returns null when the caller should stay silent: a 401 is already announced
 * by the api-client interceptor ("You were signed out"), and a plan-upgrade
 * 403 by the root route, so a second toast for the same tap is only noise.
 */
export function requestErrorMessage(error: unknown, fallback: string): string | null {
  const response = (error as {
    response?: { status?: number; data?: { message?: unknown; requiredUpgrade?: boolean } };
  })?.response;

  if (!response) return "Could not connect. Check your internet and try again — nothing was sent.";

  const status = response.status ?? 0;
  if (status === 401) return null;
  if (status === 403 && response.data?.requiredUpgrade) return null;
  if (status === 413) return "This file is too big. Please choose a smaller one.";

  const message = typeof response.data?.message === "string" ? response.data.message.trim() : "";
  if (status >= 400 && status < 500 && message) return message;
  return fallback;
}

/** True for the plan-gating 403 the backend sends when a module is switched off. */
export function isModuleUnavailable(error: unknown): boolean {
  const response = (error as { response?: { status?: number; data?: { requiredUpgrade?: boolean } } })?.response;
  return response?.status === 403 && !!response.data?.requiredUpgrade;
}

/**
 * React Query `retry` for list queries: the app's usual single retry, except
 * for a plan-gating 403. That can never succeed on a second try, and every
 * attempt raised another "upgrade your plan" toast at the employee.
 */
export function retryUnlessUnavailable(failureCount: number, error: unknown): boolean {
  return !isModuleUnavailable(error) && failureCount < 1;
}

/**
 * True for a 403 caused by the company's account (subscription expired,
 * paused, trial over), not by this person or this screen. The server's own
 * message then says what to do ("Please tell your admin"); "check your
 * internet" or "try again" would send people after the wrong problem.
 */
export function isCompanyBlocked(error: unknown): boolean {
  const response = (error as { response?: { status?: number; data?: { subscriptionStatus?: string; code?: string } } })?.response;
  return response?.status === 403 && (!!response.data?.subscriptionStatus || response.data?.code === "company_subscription");
}

/** The server's plain sentence for a company-account 403, or null. */
export function companyBlockedMessage(error: unknown): string | null {
  if (!isCompanyBlocked(error)) return null;
  const message = (error as { response?: { data?: { message?: unknown } } }).response?.data?.message;
  return typeof message === "string" && message.trim()
    ? message.trim()
    : "Your company's B.O.T account needs attention. Please tell your admin.";
}
