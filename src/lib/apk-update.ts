import { apiClient } from "@/lib/api-client";
import { getVersionInfo } from "@/lib/app-update";

/**
 * Native app updates — the half that OTA cannot deliver.
 *
 * A web bundle replaces the WebView's contents silently. Anything native — a
 * permission, a plugin, a foreground-service fix — needs a real package
 * install, and nothing in the product has ever told an employee that. This
 * asks the server what the newest published APK is and compares it against
 * what is actually installed.
 */

export interface ApkRelease {
  versionName: string;
  versionCode: number;
  url: string;
  sizeBytes: number | null;
  mandatory: boolean;
  notes: string;
  checksum?: string | null;
}

export interface ApkStatus {
  /** The published build, when one is newer than what is installed. */
  release: ApkRelease | null;
  /** Installed versionCode, or null when it could not be read. */
  installedCode: number | null;
  /** Newer build available. */
  outdated: boolean;
  /**
   * Outdated AND the publisher marked it mandatory AND we could actually read
   * the installed version. Never true on a guess — see below.
   */
  blocking: boolean;
}

const UP_TO_DATE: ApkStatus = {
  release: null, installedCode: null, outdated: false, blocking: false,
};

/**
 * Parse the installed build number.
 *
 * Capacitor's `App.getInfo().build` is a string on both platforms and is the
 * Android versionCode. Anything unparseable is reported as null rather than 0:
 * zero would compare as "infinitely out of date" and, for a mandatory release,
 * would lock an employee out of punching on the strength of a failed read.
 */
export function parseVersionCode(build: string | null | undefined): number | null {
  if (build == null) return null;
  const n = Number(String(build).trim());
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * Decide whether the installed build is behind the published one.
 *
 * Pure so it can be tested directly — this is the function that decides whether
 * somebody is allowed to record their attendance, which makes it worth more
 * than a glance.
 *
 * Compares versionCode, never versionName: "1.10" sorts before "1.9" as a
 * string, so a name comparison would tell the newest install it was out of
 * date and, if the release were mandatory, block it from working.
 */
export function evaluateApk(
  release: ApkRelease | null,
  installedCode: number | null,
): ApkStatus {
  if (!release) return UP_TO_DATE;

  // Unknown installed version: say nothing and block nothing. Same rule the
  // tracking-setup and developer-options gates follow — never act on a
  // measurement we did not actually get.
  if (installedCode == null) return { ...UP_TO_DATE, release: null };

  const outdated = release.versionCode > installedCode;
  return {
    release: outdated ? release : null,
    installedCode,
    outdated,
    blocking: outdated && release.mandatory === true,
  };
}

/** Ask the server, then compare against this device. Never throws. */
export async function checkApkUpdate(adminId?: string | null): Promise<ApkStatus> {
  try {
    const [{ data }, info] = await Promise.all([
      apiClient.get("/app/apk-release", {
        params: adminId ? { custom_id: adminId } : undefined,
      }),
      getVersionInfo(),
    ]);

    // The endpoint answers "nothing to offer" with {kind:'up_to_date'} rather
    // than an error, so a missing versionCode is a normal reply, not a fault.
    if (!data || typeof data.versionCode !== "number") return UP_TO_DATE;

    return evaluateApk(data as ApkRelease, parseVersionCode(info.nativeBuild));
  } catch {
    // A failed check must never surface as a problem the employee can act on.
    return UP_TO_DATE;
  }
}

export function formatBytes(bytes: number | null): string | null {
  if (!bytes || bytes <= 0) return null;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
