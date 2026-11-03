/**
 * Where the battery whitelist actually lives, per Android skin.
 *
 * WHY THIS EXISTS. The app checks one thing —
 * `PowerManager.isIgnoringBatteryOptimizations()`, Android's Doze whitelist —
 * and the "Open settings" button fires the standard
 * `ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` intent. On stock Android that
 * shows a one-tap Allow dialog and the job is done.
 *
 * Chinese skins intercept that intent and land the employee on their OWN
 * battery page, which has no control that satisfies the check. Observed on a
 * vivo T2x 5G (Funtouch OS 15): the employee switched on "Allow background
 * usage", the toggle read ON, and the setup card stayed red — because that
 * toggle is a vendor setting that does not touch the whitelist. Sending someone
 * to a screen where the right control does not exist, then telling them they
 * have not done it, is the fastest way to lose them.
 *
 * Keyed on the SKIN, not the Android version: the same OEM keeps its wording
 * across versions far more reliably than Android keeps its menus, and one
 * manufacturer can ship two skins (vivo: Funtouch and Origin).
 *
 * `whitelist` turns the card green. `vendor` does not — it is invisible to the
 * app — but on these skins it is what actually stops the service being killed.
 * Both are shown, honestly labelled, because an employee who does only the one
 * that turns the card green still loses their afternoon.
 *
 * Paths drift between skin releases. dontkillmyapp.com is the community
 * reference when a handset does not match what is written here.
 */

export interface OemBatterySteps {
  /** Skin name as the employee sees it on their own phone. */
  skin: string;
  /** Satisfies the Doze whitelist — makes the check pass. */
  whitelist: string[];
  /** Vendor background killer. Invisible to the app; matters anyway. */
  vendor: string[];
}

const STOCK: OemBatterySteps = {
  skin: "Android",
  whitelist: ["Settings → Apps → BOT → Battery → Unrestricted"],
  vendor: [],
};

const VIVO_FUNTOUCH: OemBatterySteps = {
  skin: "Funtouch OS",
  whitelist: [
    "Settings → Apps → BOT → Battery → Unrestricted",
    "If there is no Unrestricted option: Settings → Battery → More settings → Optimise battery use → change the filter to All apps → BOT → Don't optimise",
  ],
  vendor: [
    "Settings → Battery → Background power consumption management → BOT → Don't restrict background power usage",
    "Settings → More settings → Applications → Autostart → turn BOT on",
  ],
};

const VIVO_ORIGIN: OemBatterySteps = {
  skin: "Origin OS",
  whitelist: ["Settings → Apps → BOT → Battery → Unrestricted"],
  vendor: [
    "Settings → Battery → Background power consumption management → allow high consumption for BOT",
    "Settings → Apps & permissions → Autostart → turn BOT on",
  ],
};

const XIAOMI: OemBatterySteps = {
  skin: "HyperOS / MIUI",
  whitelist: [
    "Settings → Apps → Manage apps → BOT → Battery saver → No restrictions",
    "Older MIUI: Settings → Battery → App battery saver → BOT → No restrictions",
  ],
  vendor: [
    "Settings → Apps → Manage apps → BOT → Autostart → On",
    "Open Recents, pull the BOT card down (or long-press) and tap the padlock — without this MIUI undoes the battery setting",
  ],
};

const SAMSUNG: OemBatterySteps = {
  skin: "One UI",
  whitelist: ["Settings → Apps → BOT → Battery → Unrestricted"],
  vendor: [
    "Settings → Battery → Background usage limits → make sure BOT is NOT under Sleeping apps or Deep sleeping apps",
    "If it keeps coming back: Settings → Battery → turn off Adaptive battery",
  ],
};

const ONEPLUS: OemBatterySteps = {
  skin: "OxygenOS",
  whitelist: ["Settings → Apps → App management → BOT → Battery usage → Unrestricted (or Don't optimise)"],
  vendor: [
    "Settings → Battery → More settings → turn off Sleep standby optimisation",
    "Lock BOT in Recents — OxygenOS reverts the setting otherwise",
  ],
};

const OPPO: OemBatterySteps = {
  skin: "ColorOS",
  whitelist: ["Settings → Apps → App management → BOT → Power usage → Allow background running"],
  vendor: [
    "Same screen → turn on Allow auto-launch",
    "Settings → Battery → More → turn off Sleep standby optimisation",
    "Phone Manager app → Privacy permissions → Startup manager → turn BOT on",
  ],
};

/**
 * Realme ships Realme UI, which is ColorOS underneath and uses the same paths.
 * Honor/Huawei are close enough to Oppo's shape to be more useful than the
 * stock text, which would send them somewhere that does not exist.
 */
const BY_MANUFACTURER: Array<[RegExp, OemBatterySteps]> = [
  [/vivo|iqoo/i, VIVO_FUNTOUCH],
  [/xiaomi|redmi|poco/i, XIAOMI],
  [/samsung/i, SAMSUNG],
  [/oneplus/i, ONEPLUS],
  [/oppo|realme/i, OPPO],
  [/honor|huawei/i, OPPO],
  [/motorola|google|nokia|lenovo/i, STOCK],
];

/**
 * Steps for this handset, or null when the standard Allow dialog is expected to
 * work — in which case showing a wall of menu paths would be noise.
 *
 * `originOs` is not detectable from the manufacturer string alone, so vivo
 * defaults to Funtouch (by far the more common) and the Origin wording is
 * offered as the alternative inside the vivo block.
 */
export function batteryStepsFor(manufacturer?: string | null): OemBatterySteps | null {
  const m = String(manufacturer || "").trim();
  if (!m) return null;
  for (const [re, steps] of BY_MANUFACTURER) {
    if (re.test(m)) return steps === STOCK ? null : steps;
  }
  // Unknown OEM: better to say nothing than to send someone down a menu tree
  // their phone does not have.
  return null;
}

export { VIVO_ORIGIN };
