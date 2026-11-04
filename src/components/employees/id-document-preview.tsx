import { useState } from "react";
import { Eye, EyeOff, ExternalLink, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

const isPdf = (url: string) => /\.pdf($|\?)/i.test(url);

/**
 * A PDF on Cloudinary's image pipeline can be shown as a JPG of page 1;
 * anything else has no thumbnail and falls back to an icon.
 */
function thumbnailUrl(url: string) {
  if (!isPdf(url)) return url;
  if (!url.includes("res.cloudinary.com") || !url.includes("/image/upload/")) return "";
  return url.replace("/image/upload/", "/image/upload/pg_1/").replace(/\.pdf($|\?)/i, ".jpg$1");
}

/**
 * PAN/Aadhaar scan on the admin's employee page. It starts blurred so the
 * numbers aren't readable over someone's shoulder; a click clears the blur.
 */
export function IdDocumentPreview({ url, label }: { url: string; label: string }) {
  const [revealed, setRevealed] = useState(false);
  const [broken, setBroken] = useState(false);
  const thumb = thumbnailUrl(url);

  return (
    <div className="group relative aspect-[3/2] overflow-hidden rounded-xl border border-border/60 bg-muted/40">
      <button
        type="button"
        onClick={() => setRevealed((r) => !r)}
        aria-pressed={revealed}
        aria-label={revealed ? `Blur ${label}` : `View ${label}`}
        className="absolute inset-0 h-full w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        {thumb && !broken ? (
          <img
            src={thumb}
            alt={label}
            loading="lazy"
            onError={() => setBroken(true)}
            className={cn(
              "h-full w-full object-cover transition-[filter,transform] duration-500 ease-out motion-reduce:transition-none",
              revealed ? "blur-0 scale-100" : "blur-lg scale-110",
            )}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <FileText className="h-8 w-8 text-muted-foreground" />
          </div>
        )}
        <span
          className={cn(
            "absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-black/25 text-white transition-opacity duration-500",
            revealed ? "pointer-events-none opacity-0" : "opacity-100",
          )}
        >
          <Eye className="h-5 w-5" />
          <span className="text-xs font-semibold">Click to view</span>
        </span>
      </button>

      <span className="pointer-events-none absolute left-2 bottom-2 rounded-md bg-black/60 px-2 py-0.5 text-[11px] font-semibold text-white">
        {label}
      </span>
      <div
        className={cn(
          "absolute right-2 top-2 flex gap-1.5 transition-opacity duration-300",
          revealed ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        <button
          type="button"
          onClick={() => setRevealed(false)}
          aria-label={`Blur ${label}`}
          tabIndex={revealed ? 0 : -1}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/75"
        >
          <EyeOff className="h-4 w-4" />
        </button>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Open ${label} full size`}
          tabIndex={revealed ? 0 : -1}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/75"
        >
          <ExternalLink className="h-4 w-4" />
        </a>
      </div>
    </div>
  );
}
