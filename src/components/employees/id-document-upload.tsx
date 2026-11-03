import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Upload, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "@/lib/api-client";
import { requestErrorMessage } from "@/services/request-error";

const ID_FILE_TYPES = "image/jpeg,image/png,image/webp,application/pdf";

type DocKind = "panCard" | "aadhaarCard";

/**
 * Admin uploads an employee's PAN or Aadhaar scan (front and back, up to 2
 * files). A new upload replaces what is on file.
 */
export function IdDocumentUpload({ employeeId, kind, label, onFile }: {
  employeeId: string;
  kind: DocKind;
  label: string;
  onFile: boolean;
}) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (files: File[]) => {
      const fd = new FormData();
      files.forEach((f) => fd.append(kind, f));
      const { data } = await apiClient.put(`/users/employees/${employeeId}/documents`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      return data;
    },
    onSuccess: () => {
      toast.success(`${label} saved`);
      queryClient.invalidateQueries({ queryKey: ["employees"] });
    },
    onError: (err) => {
      const message = requestErrorMessage(err, `${label} could not be uploaded. Please try again.`);
      if (message) toast.error(message);
    },
  });

  return (
    <label
      className={`flex items-center justify-center gap-1.5 h-9 rounded-lg border border-dashed border-primary/30 text-xs font-semibold text-primary cursor-pointer hover:bg-primary/5 ${mutation.isPending ? "pointer-events-none opacity-60" : ""}`}
      title={onFile ? `Replace the ${label} on file (front and back)` : `Upload ${label} (front and back)`}
    >
      {mutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
      <span>{mutation.isPending ? "Uploading…" : onFile ? `Replace ${label}` : `Upload ${label}`}</span>
      <input
        type="file"
        accept={ID_FILE_TYPES}
        multiple
        className="sr-only"
        disabled={mutation.isPending}
        onChange={(e) => {
          const files = Array.from(e.target.files || []).slice(0, 2);
          e.target.value = "";
          if (files.length) mutation.mutate(files);
        }}
      />
    </label>
  );
}
