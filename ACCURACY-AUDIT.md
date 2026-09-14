# GPS Accuracy Audit Report

**Date:** 2026-09-11  
**Repository:** `botcrm-frontend-`  
**Audit Scope:** Verification that GPS accuracy flows as `number | null`, is never converted to `0` when absent, is correctly dispatched in punch/tracking payloads, and renders safely in UI.

---

## Executive Summary

- **Total Claims Audited:** 6 / 6 **VERIFIED** (0 Problems)
- **Judgement Questions:** 2 / 2 Answered (No latent null-dereferences; no sorting/best-fix bias)
- **TypeScript Diagnostics:** **156** pre-existing compiler errors across unrelated files (matches baseline). **0** errors in any of the audited files.
- **Modifications Made to `src/`:** **0** (Audit is strictly read-only).

---

## Audit Claims Verification

### Claim 1: No remaining place converts an absent accuracy to 0
**Status:** **VERIFIED**

A complete scan of `src/` was conducted for `accuracy` in conjunction with `|| 0`, `?? 0`, `Number(acc)`, `parseFloat`, and default values.

Every hit in `src/` referencing `accuracy`:

| File | Line | Code Snippet | Assessment |
| :--- | :--- | :--- | :--- |
| `src/lib/geolocation.ts` | 16-21 | Comments explaining `accuracy` is null, never 0 | **Clean** (documentation) |
| `src/lib/geolocation.ts` | 22 | `export type Coords = { lat: number; lng: number; accuracy: number \| null };` | **Clean** (type defines `number \| null`) |
| `src/lib/geolocation.ts` | 36 | `enableHighAccuracy: true` | **Clean** (Capacitor/browser option) |
| `src/lib/geolocation.ts` | 152 | `accuracy: pos.coords.accuracy ?? null,` | **Clean** (Capacitor native fix: null fallback, NOT 0) |
| `src/lib/geolocation.ts` | 175 | `accuracy: pos.coords.accuracy ?? null,` | **Clean** (Web navigator fix: null fallback, NOT 0) |
| `src/services/location-tracker.ts` | 14 | `private lastPosition: { lat: number; lng: number; accuracy: number \| null } \| null = null;` | **Clean** (type definition) |
| `src/services/location-tracker.ts` | 33 | `accuracy: pos.coords.accuracy ?? null,` | **Clean** (`watchPosition`: null fallback, NOT 0) |
| `src/services/location-tracker.ts` | 37, 61, 117 | `enableHighAccuracy: true, maximumAge: 0, timeout: 15000` | **Clean** (`maximumAge: 0` is cache option, not accuracy) |
| `src/services/location-tracker.ts` | 55 | `accuracy: pos.coords.accuracy ?? null,` | **Clean** (`getCurrentPosition` start: null fallback, NOT 0) |
| `src/services/location-tracker.ts` | 78 | `private sendLocation(pos: { lat: number; lng: number; accuracy: number \| null })` | **Clean** (method signature) |
| `src/services/location-tracker.ts` | 85 | `accuracy: pos.accuracy,` | **Clean** (passed directly to payload without default) |
| `src/services/location-tracker.ts` | 111 | `accuracy: pos.coords.accuracy ?? null,` | **Clean** (`checkPing` fix: null fallback, NOT 0) |
| `src/services/tracking-service.ts` | 11 | `accuracy?: number;` | **Clean** (see observation note below) |
| `src/services/tracking-service.ts` | 33 | `accuracy: item.accuracy,` | **Clean** (passed directly without `?? 0` or `\|\| 0`) |
| `src/services/tracking-service.ts` | 46 | `accuracy: data.accuracy,` | **Clean** (passed directly without `?? 0` or `\|\| 0`) |
| `src/services/tracking-service.ts` | 86, 96 | `const { ..., accuracy } = data; ... accuracy,` | **Clean** (passed directly without default) |
| `src/components/pages/tracking-page.tsx` | 265 | `<span ...>Tracking Accuracy</span>` / `98.5%` | **Clean** (mock UI label in demo component) |
| `src/routes/user/index.tsx` | 218 | `"Turn on Location and set mode to High accuracy / GPS."` | **Clean** (user instruction string) |
| `src/routes/user/index.tsx` | 237 | `const [locationAccuracy, setLocationAccuracy] = useState<number \| null>(null);` | **Clean** (default state is `null`, NOT 0) |
| `src/routes/user/index.tsx` | 398, 415, 586, 613, 2125 | `setLocationAccuracy(result.coords.accuracy);` | **Clean** (passes `number \| null` directly into state) |
| `src/routes/user/index.tsx` | 605 | `let currentAccuracy: number \| null = null;` | **Clean** (default is `null`, NOT 0) |
| `src/routes/user/index.tsx` | 610 | `currentAccuracy = result.coords.accuracy;` | **Clean** (passes platform accuracy or null directly) |
| `src/routes/user/index.tsx` | 620 | `// Accuracy travels with the punch...` | **Clean** (comment) |
| `src/routes/user/index.tsx` | 623 | `return { currentLocation, currentAddress, currentAccuracy };` | **Clean** (returns `number \| null`) |
| `src/routes/user/index.tsx` | 629, 666 | `const { ..., currentAccuracy } = await getFreshLocation();` | **Clean** (destructured without fallback) |
| `src/routes/user/index.tsx` | 648 | `accuracy: currentAccuracy,` (in `punchInMutation`) | **Clean** (sent as `number \| null`) |
| `src/routes/user/index.tsx` | 682 | `accuracy: currentAccuracy,` (in `punchOutMutation`) | **Clean** (sent as `number \| null`) |
| `src/routes/user/index.tsx` | 2025-2030 | `{locationAccuracy !== null && ( ... Math.round(locationAccuracy) ... )}` | **Clean** (null check guards calculation/display) |

**Conclusion:** Zero instances convert an absent accuracy to 0.

---

### Claim 2: `src/lib/geolocation.ts` Coords.accuracy is `number | null`, and all producers pass real value or null
**Status:** **VERIFIED**

- **Type Definition (`src/lib/geolocation.ts:22`):**
  ```typescript
  export type Coords = { lat: number; lng: number; accuracy: number | null };
  ```
- **Producers of `Coords`:**
  - **Capacitor Native Platform (`src/lib/geolocation.ts:149-154`):**
    ```typescript
    coords: {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy ?? null,
    }
    ```
  - **Web / PWA Navigator (`src/lib/geolocation.ts:172-177`):**
    ```typescript
    coords: {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy ?? null,
    }
    ```
  No other producers of `Coords` exist in the module or codebase. Both producers use `?? null`, ensuring undefined or null platform accuracy resolves to `null`.

---

### Claim 3: Every CONSUMER of Coords.accuracy compiles and behaves sensibly
**Status:** **VERIFIED**

All direct and downstream consumers of `Coords.accuracy` were inventoried:

1. **`src/routes/user/index.tsx:398`** (`passive load fetch`):
   Passes `result.coords.accuracy` to `setLocationAccuracy(accuracy)`. Target state accepts `number | null`.
2. **`src/routes/user/index.tsx:415`** (`refreshLocation`):
   Passes `result.coords.accuracy` to `setLocationAccuracy(accuracy)`. Target state accepts `number | null`.
3. **`src/routes/user/index.tsx:586`** (`beginPunch`):
   Passes `result.coords.accuracy` to `setLocationAccuracy(accuracy)`. Target state accepts `number | null`.
4. **`src/routes/user/index.tsx:610`** (`getFreshLocation`):
   Assigns `currentAccuracy = result.coords.accuracy`. Variable type is `number | null`.
5. **`src/routes/user/index.tsx:613`** (`getFreshLocation`):
   Passes `result.coords.accuracy` to `setLocationAccuracy(accuracy)`. Target state accepts `number | null`.
6. **`src/routes/user/index.tsx:2125`** (Retry button in `LocationVerification` modal):
   Passes `result.coords.accuracy` to `setLocationAccuracy(accuracy)`. Target state accepts `number | null`.
7. **`src/routes/_app/branches.tsx:104`** and **`src/components/shared/quick-add-dialogs.tsx:43`**:
   Both call `acquirePosition()` but only consume `res.coords.lat` and `res.coords.lng`. `res.coords.accuracy` is ignored.

**Arithmetic and Comparison Checks:**
- Downstream consumer in `src/routes/user/index.tsx:2025-2030`:
  `{locationAccuracy !== null && (` strictly checks that `locationAccuracy` is non-null before performing `locationAccuracy > 500` or `Math.round(locationAccuracy)`.
- No consumer performs arithmetic (`+`, `-`, `Math.round`) or relational comparisons (`<`, `>`, `<=`, `>=`) without an explicit null check.

---

### Claim 4: `src/routes/user/index.tsx` punch-in and punch-out send `accuracy` and `fixAt`
**Status:** **VERIFIED**

- **`getFreshLocation()` (`src/routes/user/index.tsx:601-624`):**
  - Declares `let currentAccuracy: number | null = null;`
  - Populates `currentAccuracy = result.coords.accuracy;` when `result.ok` is true.
  - Returns `{ currentLocation, currentAddress, currentAccuracy }`.
- **`punchInMutation` (`src/routes/user/index.tsx:627-653`):**
  - Calls `const { currentLocation, currentAddress, currentAccuracy } = await getFreshLocation();`
  - Payload constructed:
    ```typescript
    const payload = {
      location: currentLocation,
      photo: photoArg,
      isWFH: !profile?.branchId,
      address: currentAddress === "GPS permissions needed" ? "Location Capturing Bypassed" : currentAddress,
      accuracy: currentAccuracy,
      fixAt: new Date().toISOString(),
    };
    ```
  - Posts payload to `/attendance/punch-in`.
- **`punchOutMutation` (`src/routes/user/index.tsx:664-687`):**
  - Calls `const { currentLocation, currentAddress, currentAccuracy } = await getFreshLocation();`
  - Payload constructed:
    ```typescript
    const payload = {
      location: currentLocation,
      photo: photoArg,
      address: currentAddress === "GPS permissions needed" ? "Location Capturing Bypassed" : currentAddress,
      accuracy: currentAccuracy,
      fixAt: new Date().toISOString(),
    };
    ```
  - Posts payload to `/attendance/punch-out`.

Neither mutation drops `accuracy` or `fixAt`.

*(Observation: `lunchInMutation` and `lunchOutMutation` at lines 698-725 do not send `accuracy` or `fixAt`, as lunch breaks only record `location` and `address`).*

---

### Claim 5: `src/services/location-tracker.ts` payload includes `accuracy`, and no capture site coerces to 0
**Status:** **VERIFIED**

- **Payload Dispatch (`src/services/location-tracker.ts:78-98`):**
  ```typescript
  private sendLocation(pos: { lat: number; lng: number; accuracy: number | null }) {
    const payload = {
      employeeId: this.employeeId,
      lat: pos.lat,
      lng: pos.lng,
      latitude: pos.lat,
      longitude: pos.lng,
      accuracy: pos.accuracy,
      timestamp: Date.now(),
    };
    // Sent via Socket.IO:
    socket?.emit("location:update", payload);
    // Sent via REST:
    apiClient.post("/tracking/update", payload).catch(() => {});
  }
  ```
- **Capture Site 1 (`src/services/location-tracker.ts:28-35`):**
  `navigator.geolocation.watchPosition` callback:
  ```typescript
  this.lastPosition = {
    lat: pos.coords.latitude,
    lng: pos.coords.longitude,
    accuracy: pos.coords.accuracy ?? null,
  };
  ```
- **Capture Site 2 (`src/services/location-tracker.ts:50-59`):**
  Initial fix in `navigator.geolocation.getCurrentPosition`:
  ```typescript
  const payload = {
    lat: pos.coords.latitude,
    lng: pos.coords.longitude,
    accuracy: pos.coords.accuracy ?? null,
  };
  this.lastPosition = payload;
  this.sendLocation(payload);
  ```
- **Capture Site 3 (`src/services/location-tracker.ts:106-115`):**
  On-demand ping fix in `checkPing()` via `navigator.geolocation.getCurrentPosition`:
  ```typescript
  const payload = {
    lat: pos.coords.latitude,
    lng: pos.coords.longitude,
    accuracy: pos.coords.accuracy ?? null,
  };
  this.lastPosition = payload;
  this.sendLocation(payload);
  ```

All three sites use `pos.coords.accuracy ?? null`. None coerce to 0.

---

### Claim 6: Displayed accuracy renders safely when null
**Status:** **VERIFIED**

The single place where accuracy is rendered in user-facing UI is in **`src/routes/user/index.tsx:2025-2031`**:

```tsx
{locationAccuracy !== null && (
  <p className={`text-[9px] font-semibold mt-0.5 ${locationAccuracy > 500 ? "text-amber-500" : "text-emerald-500"}`}>
    {locationAccuracy > 500
      ? `⚠ Low accuracy (±${Math.round(locationAccuracy)}m) — browser using WiFi/IP. Enable device GPS for exact location.`
      : `✓ Accuracy: ±${Math.round(locationAccuracy)}m`}
  </p>
)}
```

- When `locationAccuracy` is `null`:
  The condition `{locationAccuracy !== null && ...}` evaluates to `false`. React skips rendering the entire `<p>` element.
- It is impossible for literal `"null"` or `"0m"` or `"±nullm"` to appear on the screen.

---

## Judgement Questions

### A. Does any code treat a SMALL accuracy number as better than null in a way that would now behave differently? (Sorting, "best fix" selection, etc.)
**Answer:** **NO.**
- **Investigation:**
  - Scanned for `.sort()`, filter pipelines, and comparison algorithms operating on position data.
  - In `src/services/location-tracker.ts`, incoming GPS fixes from `watchPosition` unconditionally update `lastPosition`; there is no filtering or rejection of fixes based on whether previous fixes had smaller or larger accuracy values.
  - In `src/routes/user/index.tsx`, `getFreshLocation()` takes the single immediate position returned by `acquirePosition()` without comparing against cached positions.
  - In `src/routes/_app/tracking.tsx`, locations are stored in a dictionary keyed by `employeeId`. Fallback attendance punch positions are overwritten by live tracking positions regardless of accuracy value.
  - All geofence threshold validations and accuracy filtering are deferred to the server backend.
  - Client-side code does not rank, sort, or select fixes by accuracy number against null.

### B. `setLocationAccuracy` stores accuracy in React state. Is that state read anywhere that assumes a number? If so it is now a latent null-deref.
**Answer:** **NO.**
- **Investigation:**
  - `locationAccuracy` state declaration (`src/routes/user/index.tsx:237`):
    `const [locationAccuracy, setLocationAccuracy] = useState<number | null>(null);`
  - Writers: Lines 398, 415, 586, 613, and 2125 all supply `result.coords.accuracy` (`number | null`).
  - Readers: The only reader in the entire application is `src/routes/user/index.tsx:2025`:
    `{locationAccuracy !== null && ( ... )}`
  - TypeScript's control flow analysis narrows `locationAccuracy` to `number` inside that block.
  - `Math.round(locationAccuracy)` and `locationAccuracy > 500` are strictly unreachable when `locationAccuracy` is `null`.
  - There are no other readers in the application. No latent null-dereference exists.

---

## Secondary Observation (Informational Only)

- In `src/services/tracking-service.ts:11`, the interface is declared as:
  ```typescript
  export interface Location {
    _id: string;
    employeeId: string;
    latitude: number;
    longitude: number;
    accuracy?: number; // optionally present number
    timestamp: string;
  }
  ```
  If the tracking backend returns `{ accuracy: null }`, this field holds `null` at runtime. Because lines 33, 46, and 96 map from `any` payloads and `Location.accuracy` is never consumed or dereferenced in the admin tracking UI, this causes no runtime error or type error, but could be typed as `accuracy?: number | null;` in future maintenance.

---

## Verification Note

- **Command Executed:** `npx tsc --noEmit`
- **Compiler Result:** Exited with code 1 (156 pre-existing errors in unrelated modules, matching the baseline).
- **Diagnostics Naming Audited Files:** **0**
  - `src/lib/geolocation.ts`: 0 diagnostics
  - `src/routes/user/index.tsx`: 0 diagnostics
  - `src/services/location-tracker.ts`: 0 diagnostics
  - `src/services/tracking-service.ts`: 0 diagnostics
  - `src/components/pages/tracking-page.tsx`: 0 diagnostics

