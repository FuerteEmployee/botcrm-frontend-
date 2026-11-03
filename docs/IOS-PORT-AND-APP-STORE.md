  # Shipping B.O.T HRMS to the App Store (iOS / iPhone)

  Status: **planning document, nothing built.** There is no `ios/` directory in
  this repo. Written 2026-09-18 against `versionCode 10` / `versionName 1.9`.

  ---

  ## 1. The short answer

  **Most of the app ports for free. One subsystem does not, and one has to be
  deleted.**

  | | Verdict |
  |---|---|
  | Admin panel, super-admin console, employee self-service **UI** | Ports unchanged. It is a WebView; the same bundle runs. |
  | Punch in/out, geolocation-on-punch, selfie camera, PWA | Works. Minor plist + config work. |
  | **Background GPS tracker** | **Does not port.** ~2,400 lines of Kotlin with no iOS equivalent. Needs a Swift rewrite *and* a different architecture, and it will be weaker than Android's. |
  | **In-app APK download + install** | **Must be removed on iOS.** Apple forbids it outright (Guideline 2.5.2). |
  | **Developer Options mock-location gate** | No iOS equivalent. Replace with a better iOS-native check. |
  | OTA web-bundle updates (Capgo) | Allowed, with caveats. See §6. |
  | Admin "Ping this device" | **Breaks on iOS** without adding push notifications. See §5.4. |
  | Auto punch-out geofence engine | Will effectively never fire on iOS as currently tuned. See §5.5. |

  You cannot build any of it on this machine. **iOS builds require macOS.** That
  is the first cost, before any code is written.

  Realistic budget: **₹2.5–5 lakh / $3,000–6,000 all-in for year one**, and
  **8–12 weeks of calendar time**, most of which is the tracker rewrite and App
  Review iterations. Full breakdown in §8.

  ---

  ## 2. What we actually have today

  Read this before estimating anything — the Android app is not a thin wrapper.

  ### 2.1 Capacitor setup

  - Capacitor **8.4.0**, `appId` **`com.bot.admin`**, `webDir` `dist`.
  - Config: [capacitor.config.ts](../capacitor.config.ts)
  - Android only. `@capacitor/android` installed, `@capacitor/ios` is not.

  Six community/official plugins, **all of which support iOS**:

  | Plugin | iOS support | Notes for the port |
  |---|---|---|
  | `@capacitor/app` | Yes | resume/pause events, `getInfo()` |
  | `@capacitor/device` | Yes | |
  | `@capacitor/geolocation` | Yes | Needs `NSLocationWhenInUseUsageDescription` |
  | `@capacitor/haptics` | Yes | Maps to `UIImpactFeedbackGenerator` |
  | `@capgo/capacitor-updater` | Yes | See §6 for the App Store legality |
  | `capacitor-native-settings` | Partial | iOS can only open the app's own Settings page. Android's deep-links to Location / Battery / OEM-autostart screens **have no iOS counterpart** — iOS exposes exactly one URL, `UIApplication.openSettingsURLString`. |

  ### 2.2 The custom native Android tracker — the actual problem

  `android/app/src/main/java/com/bot/admin/tracker/` — **2,435 lines of Kotlin**
  that exist nowhere else:

  | File | Lines | What it does |
  |---|---|---|
  | `LocationTrackingService.kt` | 689 | Foreground service, FusedLocationProvider, 15s capture, 30s poll loop, 45s batch sync, `START_STICKY`, `onTaskRemoved` restart |
  | `BackgroundTrackerPlugin.kt` | 425 | Capacitor bridge — the JS API in [src/plugins/background-tracker.ts](../src/plugins/background-tracker.ts) |
  | `DeviceStateWatcher.kt` | 281 | Watches GPS toggle / network / battery-saver while on duty |
  | `TrackerEventLog.kt` | 240 | Native event timeline shipped to the backend |
  | `sync/LocationSyncer.kt` | 170 | Batch POST `/api/tracking/update/batch` with back-off |
  | `TrackerWatchdogWorker.kt` | 158 | WorkManager, 15-min floor — restarts the service after an OEM process kill |
  | `sync/EventSyncer.kt` | 125 | |
  | `CrashReporter.kt` | 106 | Native uncaught-exception capture |
  | `db/*.kt` | 89 | Room/SQLite offline queue |
  | `Prefs.kt` | 78 | |
  | `BootReceiver.kt` | 56 | Restart tracking after reboot |

  Plus 11 Android permissions in the manifest, several of which
  (`SCHEDULE_EXACT_ALARM`, `RECEIVE_BOOT_COMPLETED`, `FOREGROUND_SERVICE_LOCATION`,
  `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`, `REQUEST_INSTALL_PACKAGES`) describe
  capabilities **iOS does not have at all**.

  ### 2.3 Self-hosted distribution, in two layers

  - **OTA web bundles** — Capgo pointed at our own
    `https://api.beontimeofficial.com/api/app/update`, with `appReadyTimeout`
    rollback. Ships JS only.
  - **APK releases** — super admin uploads a `.apk`
    ([backend/src/routes/app_release_routes.js](../../backend/src/routes/app_release_routes.js)),
    and the app prompts employees to download and install it
    ([src/components/shared/apk-update-prompt.tsx](../src/components/shared/apk-update-prompt.tsx),
    [src/lib/apk-update.ts](../src/lib/apk-update.ts)).

  The second layer is the one Apple kills. See §5.2.

  ---

  ## 3. Hard requirements before a single line is written

  ### 3.1 A Mac. Non-negotiable.

  Xcode runs only on macOS, and there is no supported way around it. Signing,
  building, the Simulator, and App Store upload all require it. Three options:

  | Option | Cost | Verdict |
  |---|---|---|
  | **Mac mini (M4, 16 GB)** | ~₹60,000 / $599 one-time | **Recommended.** Cheapest path to owning the build box. Pays for itself against cloud rental in ~6 months. |
  | Cloud Mac (MacinCloud / MacStadium) | ~$30–150 / month | Fine for an occasional build, painful for day-to-day native debugging. |
  | CI-only (Codemagic / Bitrise / GitHub Actions macOS runners) | Free tier → ~$0.10/min | Good for *release* builds. **Cannot** replace a Mac for developing the Swift tracker. |

  You are writing a background-location plugin. You need a Mac at a desk, not a
  CI runner.

  ### 3.2 A real iPhone. Also non-negotiable.

  The Simulator has **no real GPS, no real app termination, no real Low Power
  Mode, and no real "Always" permission lifecycle**. Every single thing that is
  hard about this port is invisible in the Simulator.

  Buy at least one physical iPhone; two is better (one on the current iOS, one
  two versions back). A used iPhone SE 3 / iPhone 12 at ₹15,000–25,000 is
  sufficient.

  ### 3.3 Apple Developer Program membership

  - **$99 USD / year** (Apple India lists ₹9,900/year inclusive of tax — verify
    at enrolment, Apple changes local pricing).
  - Enrol as an **Organization**, not an Individual. An Individual account puts
    your personal name on the App Store listing; an Organization account puts
    the company name on it, and clients notice.
  - Organization enrolment requires a **D-U-N-S number** — free from Dun &
    Bradstreet, takes **5–14 business days**. **Start this first**; it is the
    long pole in the setup and everything else waits on it.
  - You also need a legal entity name matching the D-U-N-S record exactly, plus
    a company website and a work email on that domain.

  ### 3.4 The Apple Developer **Enterprise** Program is not an option

  $299/year, in-house distribution, no App Review, no App Store. It looks
  perfect and it is not allowed here. Apple's terms restrict it to distributing
  apps to **your own employees**. B.O.T HRMS is multi-tenant SaaS installed by
  *clients'* employees. Using Enterprise for that is a textbook violation, and
  Apple revokes those certificates — which instantly bricks the app on every
  device that has it. Do not go down this road.

  The legitimate B2B-private route is **Apple Business Manager Custom Apps** —
  see §9.3.

  ---

  ## 4. Feature parity matrix

  `✅` works · `⚠️` works differently / degraded · `❌` not possible

  | Feature | Web/PWA | Android APK | iOS | Note |
  |---|---|---|---|---|
  | Admin panel (55 routes) | ✅ | ✅ | ✅ | Same WebView bundle |
  | Super-admin console | ✅ | ✅ | ✅ | |
  | Employee self-service | ✅ | ✅ | ✅ | |
  | Login / OTP | ✅ | ✅ | ✅ | |
  | Punch in/out | ✅ | ✅ | ✅ | |
  | Geolocation on punch | ✅ | ✅ | ✅ | Needs plist strings |
  | Geofence check at punch | ✅ | ✅ | ✅ | |
  | Selfie camera (`getUserMedia`) | ✅ | ✅ | ✅ | WKWebView supports it since iOS 14.3; needs `NSCameraUsageDescription` |
  | CSV / XLSX export | ✅ | ✅ | ⚠️ | `URL.createObjectURL` + `<a download>` in WKWebView is unreliable. Route downloads through the Share Sheet or `@capacitor/filesystem`. Test explicitly. |
  | Maps (Leaflet) | ✅ | ✅ | ✅ | |
  | Haptics | ❌ | ✅ | ✅ | |
  | OTA web-bundle update | n/a | ✅ | ⚠️ | Allowed under DPLA 3.3.2, see §6 |
  | **In-app binary update** | n/a | ✅ | ❌ | Forbidden. Must use the App Store. |
  | **Background GPS while app closed** | ❌ | ✅ | ⚠️ | Works while backgrounded/suspended. **Dies on force-quit.** See §5.1 |
  | **Tracking survives force-quit** | ❌ | ✅ | ❌ | Only region / significant-change wake-ups, which are coarse |
  | **Tracking survives reboot** | ❌ | ✅ | ⚠️ | Only via region monitoring / SLC, and only after the user unlocks |
  | **15-second fix cadence when stationary** | ❌ | ✅ | ⚠️ | iOS is movement-driven, not timer-driven |
  | Persistent tracking notification | ❌ | ✅ | ⚠️ | iOS shows its own blue indicator; you cannot customise or replace it |
  | Battery-optimisation exemption prompt | ❌ | ✅ | n/a | **Not needed on iOS** — genuine simplification |
  | OEM autostart deep-links (MIUI/ColorOS) | ❌ | ✅ | n/a | **Not needed on iOS** — genuine simplification |
  | **Admin "Ping device"** (30s poll) | ❌ | ✅ | ❌ | Needs APNs silent push instead. See §5.4 |
  | Auto-stop tracking when punched out | ❌ | ✅ | ⚠️ | Deferred to the next location wake-up |
  | **Mock-location detection** | ❌ | ✅ | ✅ | iOS is **better** — `isSimulatedBySoftware` is per-fix truth. See §5.3 |
  | Native crash capture | ❌ | ✅ | ⚠️ | Needs a rewrite; use a crash SDK |
  | Offline queue | ❌ | ✅ | ✅ | Room → SQLite / GRDB / Core Data |
  | Auto punch-out engine firing | n/a | ✅ | ⚠️ | Currently tuned so iOS fixes will fail the gates. See §5.5 |

  ---

  ## 5. The five things that actually need work

  ### 5.1 Background location — a rewrite *and* a redesign

  This is 70% of the project. It is not a translation exercise, because iOS's
  background model is fundamentally different from Android's.

  **What Android does that iOS simply cannot:**

  | Android mechanism | iOS equivalent |
  |---|---|
  | Foreground service with persistent notification | **None.** iOS has background *modes*, not services. |
  | `START_STICKY` — system restarts the service | **None.** |
  | `onTaskRemoved` + `AlarmManager.setExactAndAllowWhileIdle` to restart 1s after swipe-away | **None.** A user force-quit is final. |
  | `BootReceiver` on `BOOT_COMPLETED` | **None** directly. Region monitoring / SLC relaunch the app, but only after first unlock. |
  | `TrackerWatchdogWorker` (WorkManager, 15-min) | `BGTaskScheduler` — **opportunistic only**. The system decides when, it can be hours, and it will not run after a force-quit. Useless as a watchdog. |
  | 30-second poll loop while backgrounded | **None.** A suspended iOS app executes nothing. |
  | `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` prompt | **None**, and not needed. |

  **What iOS gives you instead:**

  - `UIBackgroundModes: ["location"]` in Info.plist
  - `CLLocationManager.allowsBackgroundLocationUpdates = true`
  - `pausesLocationUpdatesAutomatically = false` — **critical**. iOS otherwise
    silently stops delivering updates when it decides the user is stationary,
    which for a desk-bound employee is most of the day.
  - **"Always" authorization**, which is a two-step dance: request `WhenInUse`
    first, then escalate to `Always` later. iOS then periodically shows the user
    a map of everywhere the app recorded them and asks whether to keep allowing
    it. **Expect real attrition here.** This is the biggest operational
    difference from Android, and it is a product problem, not a code problem —
    the app must earn that permission with a clear explanation screen before it
    asks.
  - **Precise vs Approximate** (iOS 14+): the user can grant approximate
    location, accurate to kilometres, which destroys every geofence decision.
    Read `locationManager.accuracyAuthorization` and handle `.reducedAccuracy`
    explicitly — either request temporary full accuracy
    (`NSLocationTemporaryUsageDescriptionDictionary`) or refuse to track and tell
    the employee why. This mirrors the existing `precise` field in
    `TrackerReadiness`, so the JS side is already shaped for it.

  **The architectural change:** Android's tracker is a continuous service that
  fights to stay alive. iOS's tracker has to be **event-driven and
  self-resurrecting**:

  1. While the app is alive and the employee is on duty, run standard continuous
    updates — that part behaves roughly like Android.
  2. To survive termination, register **`CLCircularRegion` monitoring around the
    employee's branch(es)** and/or `startMonitoringSignificantLocationChanges()`.
    These relaunch the app in the background even after it has been killed.
    Region monitoring is capped at **20 regions per app** — fine, since an
    employee has few branches.
  3. On relaunch, check whether there is an open attendance session, and if so
    resume continuous updates.

  Note the silver lining: **branch geofences are already a first-class concept in
  this product** (`Branch.radius`, `nearestBranchDistance`), so region monitoring
  is a natural fit rather than a hack. Arrival at and departure from a branch are
  exactly the events the business cares about.

  **Also needs rewriting:** Room → SQLite/GRDB, OkHttp → `URLSession` (with
  `URLSessionConfiguration.background` for uploads that must outlive a wake-up),
  `TrackerEventLog` → the same in Swift, `CrashReporter` → a real crash SDK.

  **Estimate: 3–5 weeks** for a competent iOS developer, with the Kotlin
  implementation available as a specification. The Kotlin code is unusually
  well-commented — every constant has its incident written next to it — which
  makes it a genuinely good spec. Budget the time; do not let anyone tell you
  this is a week.

  ### 5.2 The in-app APK updater must not exist on iOS

  Apple **App Store Review Guideline 2.5.2**: apps may not download, install, or
  execute code that introduces or changes features. The APK flow does literally
  that. It is not a grey area.

  What has to happen:

  - `src/lib/apk-update.ts` and `src/components/shared/apk-update-prompt.tsx`
    must be **excluded at build time** on iOS, not merely hidden behind a runtime
    `if`. Guideline 2.3.1 covers hidden features, and a reviewer who finds a code
    path offering an out-of-store binary will reject the build.
  - The version panel in `src/components/shared/app-update.tsx` currently shows
    an "App version X is available → download" button. On iOS that must become
    "Update in the App Store", linking to your App Store page, or be absent.
  - Any copy referring to APKs, sideloading, or "install from browser" must be
    platform-gated. `src/components/employees/device-tab.tsx` has several
    admin-facing strings mentioning APKs — admin-only and lower risk, but review
    them.

  Recommended mechanism: a Vite `define` flag (e.g. `__PLATFORM__`) set per build
  target, so the iOS bundle never contains the code. **This interacts with OTA** —
  the bundle served to iOS clients must be the iOS-flavoured build, which means
  `/api/app/update` has to become platform-aware. It currently is not.

  ### 5.3 The Developer Options gate — replace, do not port

  [src/hooks/use-developer-options-gate.ts](../src/hooks/use-developer-options-gate.ts)
  hard-blocks the *entire* employee app while Android Developer Options is on, as
  a proxy for "GPS mocking is possible here". iOS has no such setting.

  The iOS replacement is **better, not worse**:

  - **`CLLocation.sourceInformation.isSimulatedBySoftware`** (iOS 15+) tells you,
    *per fix*, whether that specific coordinate came from a simulator or a
    spoofing tool. That is a direct answer where Android only gave a
    circumstantial one.
  - `sourceInformation.isProducedByAccessory` catches external-hardware spoofing.
  - Optionally add lightweight jailbreak heuristics (Cydia URL scheme,
    writability of `/private`), acknowledging they are an arms race.

  So on iOS: drop the blanket app-wide block and instead **reject individual
  fixes** that report as simulated, logging them the way debounced punches are
  logged. That is a cleaner design, and worth considering back-porting to Android
  if Google ever exposes an equivalent.

  ### 5.4 The admin "Ping device" button will not work on iOS

  Today the Kotlin service polls `GET /api/tracking/ping-check` every 30 seconds,
  so that an admin pressing "Ping" causes the phone to take an immediate fix. A
  suspended iOS app runs no code, so this cannot work.

  The correct iOS implementation is an **APNs silent push**
  (`content-available: 1`), which wakes the app in the background long enough to
  take a fix and upload it. That means:

  - Adding `@capacitor/push-notifications`, an APNs key, and the
    `remote-notification` background mode.
  - **Implementing `dispatch()` in [backend/src/jobs/notify.js](../../backend/src/jobs/notify.js)**,
    which currently only `console.log`s. This is the first feature that forces
    that chokepoint to become real.
  - Accepting that silent pushes are rate-limited and best-effort — a ping may
    arrive in seconds or may be throttled.

  Budget this as a **separate ~1 week**, backend included. Until it exists, hide
  the Ping button for iOS devices, or it lies to admins.

  ### 5.5 The auto punch-out engine will not fire on iOS — and that is dangerous to "fix"

  Per [CLAUDE.md](../../CLAUDE.md), `evaluateExit()` requires `MIN_FIXES 5`,
  `MIN_SPAN_MS 90s`, `MIN_DISTINCT 3`, and `MAX_FIX_AGE_MS 10 min`, and is driven
  by incoming location updates.

  iOS breaks several of those assumptions at once:

  - Fixes arrive **batched and deferred** after a background wake-up, so a whole
    burst can be older than `MAX_FIX_AGE_MS` and every one gets discarded.
  - A stationary employee generates far fewer fixes than Android's 15s cadence,
    so `MIN_FIXES` and `MIN_DISTINCT` may never be satisfied within a window.
  - `horizontalAccuracy` on iOS is a 68%-confidence radius with different
    semantics from Android's, and iOS returns **`-1` for an invalid fix** —
    `isTrustworthyFix()` must handle that, or a `-1` sails through as "excellent
    accuracy".

  **The engine abstaining is the safe outcome**, and it is consistent with the
  subsystem's own governing rule — *when unsure, stay punched in*. So iOS
  launching with auto punch-out effectively disabled is **correct behaviour, not
  a bug**.

  Do **not** loosen the thresholds to make it fire on iOS. Those numbers were
  each paid for by an incident — one phantom coordinate produced 29 wrong auto
  punch-outs across 4 employees. Treat iOS auto punch-out as a separate project
  with its own shadow-mode evidence period, exactly as the Android promotion gate
  requires. Do handle the `-1` accuracy case, though — that one is a real bug
  waiting to happen.

  ---

  ## 6. OTA updates on iOS: allowed, with a leash

  Capgo works on iOS and is used by App Store apps. The legal basis is the
  **Developer Program License Agreement §3.3.2**, which permits downloading and
  running *interpreted* code (JavaScript in a WebView) provided it does not
  change the app's primary purpose.

  Practical rules for staying inside that:

  1. **Bug fixes, copy changes, and UI tweaks over OTA. New features through the
    App Store.** The line Apple cares about is "changes features", and shipping
    a whole new module over the air invites the argument.
  2. **Never OTA something the reviewer could not have seen.** If a bundle would
    change what the app fundamentally does, submit it.
  3. The existing `appReadyTimeout: 10000` auto-rollback should stay — on iOS you
    cannot hand anyone a replacement binary quickly, so a bricking bundle is far
    worse than it is on Android.
  4. `/api/app/update` must become **platform-aware** (see §5.2). Serving the
    Android bundle to an iPhone would ship the forbidden APK-updater code into a
    reviewed app.

  Also note that App Store review latency (typically 24–48 hours, sometimes days)
  is now on the critical path for anything OTA cannot carry — including every
  native change. That is a real change to how this team ships.

  ---

  ## 7. App Store review: what will get you rejected

  This app has three characteristics that draw scrutiny: **background location**,
  **employee monitoring**, and **an enterprise login wall**. Plan for 2–3
  rejection rounds; do not treat the first submission as the launch date.

  ### 7.1 Required Info.plist strings

  Every one must be a clear, specific, human sentence. "Needed for app
  functionality" gets rejected.

  | Key | Why |
  |---|---|
  | `NSLocationWhenInUseUsageDescription` | Punch-in geofence |
  | `NSLocationAlwaysAndWhenInUseUsageDescription` | Background tracking |
  | `NSCameraUsageDescription` | Selfie punch |
  | `NSPhotoLibraryUsageDescription` | Only if photo upload exists |
  | `NSLocationTemporaryUsageDescriptionDictionary` | If you request temporary full accuracy |
  | `UIBackgroundModes` | `location`, plus `remote-notification` if §5.4 is built |

  Write these for the employee, not the reviewer — e.g. *"B.O.T records your
  location while you are punched in so your attendance at your assigned branch
  can be verified. Tracking stops when you punch out."* That sentence is both
  what Apple wants and what is actually true.

  ### 7.2 Privacy manifest — mandatory

  `PrivacyInfo.xcprivacy` is required. It must declare collected data types and
  **required-reason API** usage (`UserDefaults`, file timestamps, disk space,
  etc.). Capacitor core and most maintained plugins now ship their own manifests;
  you still have to write the app's.

  ### 7.3 App Privacy "nutrition label"

  Declare honestly in App Store Connect. Based on what this codebase actually
  collects:

  - **Precise Location** and **Coarse Location** — linked to user, App Functionality
  - **Contact Info** (name, email, phone) — linked
  - **Identifiers** — the `installId` in `ClientDevice`
  - **Diagnostics** — `ClientError`, native crashes
  - **Usage Data** — `LoginSession`

  Under-declaring is a rejection, and later a removal.

  ### 7.4 Guideline 2.1 — demo account

  The app is entirely behind a login, so you **must** give App Review working
  credentials. Create a **dedicated review tenant** with realistic attendance
  data, a branch with a geofence, and an employee account. Put the credentials in
  App Store Connect's review notes with a short written explanation of the
  background-location behaviour and a note that the employer configures and
  discloses it. Reviewers *will* test background location — give them a branch
  geofence they can plausibly be inside.

  ### 7.5 Employee monitoring — disclosure is the whole game

  Apple permits workforce-management apps, but background location tied to an
  identified person gets read carefully. What protects you:

  - An **explicit in-app consent screen** before requesting Always, in plain
    language, stating what is recorded, when, and that it stops at punch-out.
  - **It genuinely stopping at punch-out.** The Android service already does this
    (constraint #7); make sure the iOS one visibly does too, and say so.
  - A published privacy policy URL covering employee location data.

  ### 7.6 Likely-but-arguable rejections to prepare for

  - **Account deletion (5.1.1(v)).** Apps supporting account *creation* must
    offer in-app deletion. Employees here cannot self-register — accounts are
    created by their employer — which should exempt you. Be ready to state that
    in writing; it is a common first-round rejection regardless.
  - **Guideline 4.2 minimum functionality.** Not a real risk for an app this
    substantial, but a login-walled app a reviewer cannot get into reads as an
    empty shell. §7.4 is the mitigation.
  - **Sign in with Apple (4.8)** is *not* required: it triggers only when you
    offer third-party social logins. Phone/OTP and email/password do not trigger
    it.

  ### 7.7 One thing worth deciding before you submit

  `POST /api/users/login-request` returns the OTP **in the response body**, and
  the frontend displays it. A reviewer will see the code appear on screen. It
  will not fail review — it reads as a demo convenience — but decide deliberately
  whether you want that in a publicly listed, reviewed product, because it is
  also not a second factor in any meaningful sense.

  ---

  ## 8. Costs

  ### One-time

  | Item | USD | INR (approx) | Notes |
  |---|---|---|---|
  | Mac mini M4 16 GB | $599 | ₹60,000 | Recommended; skip only if renting a cloud Mac |
  | iPhone test device (used, ×1–2) | $180–300 each | ₹15,000–25,000 each | **Buy at least one.** The Simulator cannot test any of this. |
  | D-U-N-S number | Free | Free | 5–14 business days — start now |
  | App Store assets (icon, screenshots at 6.9" / 6.5") | $100–300 | ₹8,000–25,000 | Or in-house design time |
  | **iOS engineering, 6–9 person-weeks** | **$2,000–5,000** | **₹1.5–4 lakh** | At Indian contractor rates of ₹800–2,000/hr. The tracker is most of it. |

  ### Recurring

  | Item | USD/yr | INR/yr (approx) |
  |---|---|---|
  | Apple Developer Program | $99 | ₹9,900 |
  | Cloud Mac, *if* no Mac purchased | $360–1,800 | ₹30,000–1,50,000 |
  | CI macOS minutes (optional) | $0–500 | ₹0–42,000 |
  | Apple Business Manager | Free | Free |

  ### Hidden ongoing costs people forget

  - **Apple raises the minimum SDK every year.** You must rebuild and resubmit
    roughly annually just to remain submittable. Android does not force this as
    hard.
  - **Every native change now waits on App Review.** Your current ability to fix
    a native bug by handing someone an APK disappears entirely.
  - **Two platforms to keep in sync.** The Swift and Kotlin trackers will drift.
    Every threshold change and every new event type has to be made twice.

  ### What I would *not* buy

  **Ionic Appflow** ($499+/month) is the obvious upsell for OTA and cloud builds.
  You already self-host OTA with Capgo against your own endpoint, and it works.
  Don't pay for it.

  ### Realistic total, year one

  **₹2.5–5 lakh / $3,000–6,000**, dominated by engineering time and a Mac.
  Year two onward: **₹10,000 / $99** plus maintenance.

  ---

  ## 9. How to actually do it

  ### 9.1 Order of operations

  **Do these in order — the first two have waiting periods.**

  1. **Apply for the D-U-N-S number.** Free, 5–14 business days, blocks
    everything else.
  2. **Enrol in the Apple Developer Program as an Organization.** Another few
    days of verification.
  3. **Buy the Mac and at least one iPhone.**
  4. **Add the platform** (from `botcrm-frontend-/`, on the Mac):
    ```bash
    npm install
    npm install @capacitor/ios
    npx cap add ios
    npm run build
    npx cap sync ios
    npx cap open ios      # opens Xcode
    ```
    Confirm Capacitor 8's iOS deployment target in
    `node_modules/@capacitor/ios/Capacitor.podspec` and set the project to match.
  5. **Get the web app running in the Simulator, unchanged.** This will mostly
    just work, and it is the cheap confidence-builder. Fix plist strings, icons,
    launch screen, safe-area insets, and keyboard/scroll behaviour here.
  6. **Gate out the APK updater** (§5.2) and the Developer Options block (§5.3).
    Make `/api/app/update` platform-aware.
  7. **Test on the physical iPhone.** Camera, punch flow, foreground
    geolocation, CSV export, PWA behaviours.
  8. **Write the Swift background tracker.** The long pole. Build it against the
    same JS interface already defined in
    [src/plugins/background-tracker.ts](../src/plugins/background-tracker.ts),
    so the web layer never needs to know which platform it is on.
  9. **Shadow-mode the tracker for weeks, not days**, on real phones carried by
    real people, before trusting a single fix it produces. Note that the Android
    rollout is *itself* still stalled on exactly this step — per CLAUDE.md the
    engine has produced two audit rows in its lifetime. Do not let iOS inherit
    that pattern: treat "the data is flowing" as the milestone, not "the code
    compiled".
  10. **TestFlight internally**, then with a friendly client.
  11. **Submit.** Budget 2–3 review rounds.

  ### 9.2 Project structure changes to expect

  - An `ios/` directory joins the repo (Capacitor generates it; it is checked in,
    the way `android/` is).
  - A **second bundle ID for staging** — `com.bot.admin.staging` — mirroring the
    Android `applicationIdSuffix ".staging"` setup, with its own Xcode scheme and
    provisioning profile, pointed at the staging API and staging OTA endpoint.
    The reasoning in `capacitor.config.ts` about staging accidentally pointing at
    the production database applies identically on iOS and is, if anything,
    harder to catch — there is no `applicationIdSuffix` equivalent, so you wire
    it by scheme and `.xcconfig`.
  - Signing certificates and provisioning profiles, which are **their own
    category of pain**. Use Xcode automatic signing at first; move to
    `fastlane match` once more than one person builds.
  - ⚠️ **Do not commit signing certificates or the App Store Connect API key.**
    `backend/.env` is already tracked in a **public** repo — the same mistake
    with a `.p12` or an `AuthKey_*.p8` would let anyone ship builds under your
    identity. Check `.gitignore` before the first commit of `ios/`.

  ### 9.3 Distribution options

  | Route | Review? | Fit |
  |---|---|---|
  | **Public App Store** | Yes | **Default choice.** Any tenant's employees download it and log in. Matches how the Android app is used, minus the sideloading. |
  | **Apple Business Manager Custom App** | Yes | Private distribution to a *specific named client organisation*, not publicly listed. Good for a large client who wants it in their own MDM. **Still fully reviewed** — it does not dodge any guideline in §7. |
  | **TestFlight** | Light (Beta App Review for external testers) | Up to 100 internal / 10,000 external testers; builds expire after 90 days. Correct for pilots, **not** a production channel. |
  | Enterprise Program | No | **Not permitted for this app.** See §3.4. |

  Start with the public App Store. Add ABM Custom Apps later if a specific
  enterprise client asks.

  ---

  ## 10. Recommendation

  **Do it in two releases, not one.**

  **Release 1 — "iOS, without background tracking."**
  Ship the web app, punch in/out with foreground geolocation, the selfie camera,
  and the full admin/employee UI. Cut the APK updater, cut the Developer Options
  gate, hide the Ping button. That is roughly **2–3 weeks of work plus review**.
  It is low-risk, it gets you through App Review once (which is where the unknown
  unknowns live), and it gets the company onto iPhones — very likely the actual
  business need behind this question, since most Indian SMB *managers* carry
  iPhones even where field staff carry Android.

  **Release 2 — background tracking.**
  The Swift tracker, the APNs ping, and a proper shadow-mode period. This is the
  expensive, uncertain part, and it should not hold the first release hostage.

  Two reasons the split matters specifically here:

  1. The Android background tracker **is not actually delivering data yet** — per
    CLAUDE.md, 11 of 103 employees have `trackingEnabled`, ~509 fixes exist
    across three months, and the signed APK in the field cannot send background
    location at all. Porting a subsystem to iOS before it has been proven on
    Android means debugging two unproven implementations at once.
  2. Everything hard about iOS background location is a **product and permission**
    problem (will employees grant Always? will they force-quit the app?) more
    than a coding problem. You want that conversation happening with real users
    on a shipped app, not as a blocker to shipping at all.

  **Start the D-U-N-S application this week regardless of which release you
  commit to** — it costs nothing and it is the only item on this list with an
  unavoidable two-week wait.

  ---

  ## 11. Release 1 scope, verified against the code

  §10 recommends shipping iOS **without** background tracking first. This section
  is the concrete work list for that, checked against the actual source rather
  than estimated.

  **The headline: the codebase already degrades safely on iOS almost everywhere,
  by accident.** Every tracker entry point guards on `available()`, which is
  `Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("BackgroundTracker")`.
  That guard exists to protect employees still running an old APK that predates
  the native plugin — and an iPhone is indistinguishable from an old APK as far
  as that check is concerned. So the defensive work already paid for on Android
  carries the iOS port for free.

  ### 11.1 Works with no changes — verified

  | File | Why it is fine on iOS |
  |---|---|
  | [src/plugins/background-tracker.ts](../src/plugins/background-tracker.ts) | Every exported function early-returns on `!available()`. `startBackgroundTracking()` resolves `false`, never throws — and its comment already says punch-in must not break when tracking fails. |
  | [src/hooks/use-tracking-setup.ts](../src/hooks/use-tracking-setup.ts) | `applicable = available()` → `false`, and `ready` is `!applicable \|\| …` → `true`. The setup wizard never renders and never blocks punch-in. |
  | [src/hooks/use-developer-options-gate.ts](../src/hooks/use-developer-options-gate.ts) | Same pattern → `blocked: false`. **The app-wide employee block does not fire on iOS.** |
  | [src/lib/geolocation.ts](../src/lib/geolocation.ts) | **Already written for iOS.** It imports `IOSSettings`, `getPlatform()` already returns `"ios"`, and the settings deep-link passes `optionIOS: IOSSettings.LocationServices \| IOSSettings.App`. Nothing to do. |
  | [src/components/attendance/tracking-setup-gate.tsx](../src/components/attendance/tracking-setup-gate.tsx) | Only rendered when `setup.applicable`, so its Android-specific copy is unreachable on iOS. |

  That is the whole tracking subsystem's web layer, and it needs zero work for
  Release 1. Do not "clean it up" — the guards are load-bearing for old Android
  APKs too.

  ### 11.2 Must change — the real list

  | # | Item | Why | Effort |
  |---|---|---|---|
  | 1 | **Remove the APK updater on iOS** — [src/lib/apk-update.ts](../src/lib/apk-update.ts), [src/components/shared/apk-update-prompt.tsx](../src/components/shared/apk-update-prompt.tsx) | Guideline 2.5.2. Build-time exclusion, not a runtime `if`. See §5.2. | 1–2 days |
  | 2 | **Make `/api/app/update` platform-aware** | Otherwise the Android bundle — containing item 1 — gets OTA'd onto a reviewed iOS app. | 1 day (backend) |
  | 3 | **`app-update.tsx`: "Download" → "Open in App Store"** | Same guideline; the button currently offers an out-of-store binary. | Half a day |
  | 4 | **Hide the "Ping device" button for iOS devices** | The 30s poll it depends on cannot run. Leaving it visible lies to admins. See §5.4. | Half a day |
  | 5 | **Fix CSV / XLSX download** — [src/lib/export.ts](../src/lib/export.ts) `downloadCSV()`, plus `XLSX.writeFile` in [routes/_app/attendance.tsx](../src/routes/_app/attendance.tsx) and [routes/_app/leads.tsx](../src/routes/_app/leads.tsx) | Both use a Blob URL plus `<a download>`. WKWebView's support for the `download` attribute on blob URLs is unreliable. Route through the Share Sheet or `@capacitor/filesystem` + `@capacitor/share`. **Test this on a real device before assuming it is broken — and before assuming it works.** | 1–2 days |
  | 6 | **Info.plist, privacy manifest, icons, launch screen** | §7.1, §7.2. | 2–3 days |
  | 7 | **Admin-facing copy that says "Android app"** — [device-tab.tsx](../src/components/employees/device-tab.tsx):141, [app-update.tsx](../src/components/shared/app-update.tsx):403 | Cosmetic, admin-only, no review risk. Becomes wrong once iPhones exist. | Half a day |
  | 8 | **`client-telemetry.ts` permission reporting** | Its comments are written against Android WebView quirks. iOS's Permissions API support differs; verify `camera` / `geolocation` queries do not throw, and that unrequested permissions still report `'unknown'` rather than `'denied'` — the UI contract depends on that. | 1 day |

  **Total: roughly 8–11 working days of code**, plus plist/asset work, plus
  review. That is the 2–3 week Release 1 estimate in §10, and it holds up.

  ### 11.3 What Release 1 deliberately does not fix

  - Background tracking (the whole point of the split).
  - Auto punch-out on iOS — abstains, which is correct. See §5.5.
  - The `-1` `horizontalAccuracy` handling in `isTrustworthyFix()`. **This one is
    worth doing in Release 1 anyway**, because it is a genuine latent bug the
    moment any iOS fix reaches the backend, and a fix at the desk costs an hour.

  ---

  ## 12. `notify.js` is not an iOS question

  [backend/src/jobs/notify.js](../../backend/src/jobs/notify.js) comes up in §5.4
  because APNs would route through it, and that is easy to misread as "it becomes
  a problem when we add iOS". It is a problem **now**, on Android, in production.

  `dispatch()` is a mock — it `console.log`s and returns `{ ok: true, mocked: true }`.
  Four live callers depend on it, and only one has anything to do with background
  tracking:

  | Caller | What it sends | Related to background tracking? |
  |---|---|---|
  | [jobs/device_health.js](../../backend/src/jobs/device_health.js):110 | "Your attendance machine has not reported for N hours" | **No** — biometric hardware |
  | [controllers/iclock_controller.js](../../backend/src/controllers/iclock_controller.js):90 | "The clock on your attendance machine is wrong" | **No** — biometric hardware |
  | [jobs/subscription_lifecycle.js](../../backend/src/jobs/subscription_lifecycle.js):117 | Trial / renewal / lapse reminders | **No** — billing |
  | [utils/geofence_engine.js](../../backend/src/utils/geofence_engine.js):477 | "You were automatically punched out at HH:MM" | Yes |

  So three of the four are live features whose alerts currently go nowhere.
  `runDeviceHealthCheck()` runs **hourly** and its entire purpose — per its own
  design notes, that nobody is told when a terminal goes quiet — is defeated by
  the mock at the end of the chain. The device-offline alert is written,
  scheduled, gated by an AlertRule, and silently discarded.

  **Wiring a real SMS/email provider into `dispatch()` is worth doing regardless
  of whether iOS ever ships**, and it is cheap: one function, MSG91 or Fast2SMS
  or nodemailer, and every one of those four alerts lights up at once. That is
  the design's whole point.

  The iOS-specific part is only the APNs silent push for the Ping button (§5.4),
  and that is Release 2.
