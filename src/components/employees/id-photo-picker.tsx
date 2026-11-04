import { useEffect, useMemo } from "react";
import { Camera, Upload, X, FileText } from "lucide-react";

const ID_FILE_TYPES = "image/jpeg,image/png,image/webp,application/pdf";
const MAX_PHOTOS = 2; // front and back

/**
 * Employee picks PAN/Aadhaar photos: takes them with the camera or chooses
 * files. Shots add up (front, then back) instead of replacing each other, so
 * two camera photos can be sent together. Nothing uploads until the caller
 * saves `files`.
 */
export function IdPhotoPicker({
  id,
  label,
  files,
  onChange,
  onFile,
  disabled,
}: {
  id: string;
  label: string;
  files: File[];
  onChange: (files: File[]) => void;
  /** Photos already on file; a new pick replaces them when saved. */
  onFile: number;
  disabled?: boolean;
}) {
  const previews = useMemo(
    () => files.map((f) => (f.type.startsWith("image/") ? URL.createObjectURL(f) : "")),
    [files],
  );
  useEffect(() => () => previews.forEach((u) => u && URL.revokeObjectURL(u)), [previews]);

  const full = files.length >= MAX_PHOTOS;
  const add = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files || []);
    e.target.value = "";
    if (picked.length) onChange([...files, ...picked].slice(0, MAX_PHOTOS));
  };

  const btn = `min-h-11 flex items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 px-3 py-2.5 text-sm font-semibold text-[#501537] dark:text-[#e0a6c6] cursor-pointer hover:bg-[#501537]/5 ${disabled || full ? "pointer-events-none opacity-50" : ""}`;

  return (
    <div className="space-y-2">
      <span className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide">
        {label}
      </span>
      <div className="grid grid-cols-2 gap-2">
        <label htmlFor={`${id}-camera`} className={btn}>
          <Camera className="h-4 w-4 shrink-0" />
          {files.length === 1 ? "Take back" : "Take photo"}
        </label>
        <label htmlFor={`${id}-file`} className={btn}>
          <Upload className="h-4 w-4 shrink-0" />
          Upload
        </label>
      </div>
      <input
        id={`${id}-camera`}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        disabled={disabled || full}
        onChange={add}
      />
      <input
        id={`${id}-file`}
        type="file"
        accept={ID_FILE_TYPES}
        multiple
        className="sr-only"
        disabled={disabled || full}
        onChange={add}
      />

      {files.length > 0 ? (
        <div className="grid grid-cols-2 gap-2">
          {files.map((f, i) => (
            <div
              key={`${f.name}-${i}`}
              className="relative aspect-[3/2] overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
            >
              {previews[i] ? (
                <img
                  src={previews[i]}
                  alt={`${label} ${i === 0 ? "front" : "back"}`}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-1 px-2 text-xs text-slate-500">
                  <FileText className="h-5 w-5" />
                  <span className="max-w-full truncate">{f.name}</span>
                </div>
              )}
              <span className="absolute left-1.5 bottom-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                {i === 0 ? "Front" : "Back"}
              </span>
              <button
                type="button"
                aria-label={`Remove ${i === 0 ? "front" : "back"} photo`}
                disabled={disabled}
                onClick={() => onChange(files.filter((_, j) => j !== i))}
                className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/75"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-slate-500">Front and back, up to 2 photos or a PDF.</p>
      )}
      {files.length > 0 && onFile > 0 && (
        <p className="text-xs text-slate-500">The photo on file will be replaced when you save.</p>
      )}
    </div>
  );
}
