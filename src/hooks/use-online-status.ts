import { useEffect, useState } from "react";

/**
 * Is the device on a network right now?
 *
 * Uses `navigator.onLine` and the browser's own online/offline events rather
 * than @capacitor/network, deliberately. A native plugin would need a new
 * signed APK to reach anybody, and stale installs are exactly the problem this
 * is meant to help with -- devices in the field are several builds behind. This
 * version ships in an OTA web bundle and works on every install at once.
 *
 * The known weakness of `navigator.onLine` is that it reports link state, not
 * reachability: a phone attached to a captive portal or a dead router reads as
 * online. That makes it reliable in one direction only -- `false` genuinely
 * means no network, while `true` means "probably". So this is used to explain a
 * failure and to hold back an action that would certainly fail, never as proof
 * that a request will succeed.
 */
export function useOnlineStatus(): boolean {
    const [online, setOnline] = useState(() =>
        typeof navigator === "undefined" ? true : navigator.onLine !== false,
    );

    useEffect(() => {
        if (typeof window === "undefined") return;

        const goOnline = () => setOnline(true);
        const goOffline = () => setOnline(false);

        window.addEventListener("online", goOnline);
        window.addEventListener("offline", goOffline);

        // Re-read on mount: the events only fire on a CHANGE, so a tab that was
        // backgrounded while the network dropped would otherwise keep whatever
        // state it had when it went away.
        setOnline(navigator.onLine !== false);

        return () => {
            window.removeEventListener("online", goOnline);
            window.removeEventListener("offline", goOffline);
        };
    }, []);

    return online;
}
