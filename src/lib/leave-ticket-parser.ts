// Leave requests are stored as Tickets (type "Leave") with the actual leave
// details packed into a pipe-delimited `reason` string — there is no dedicated
// Leave-request API consumed by the frontend. Shared here so every page that
// needs to read a leave Ticket (Leaves page, Attendance "On Leave" KPI, etc.)
// parses the exact same format instead of drifting apart over time.
// Format: "Leave: annual | 2025-05-10 to 2025-05-15 | Note: Family vacation | Duration: full | OnBehalfName: Name | OnBehalfId: ID"
export function parseTicketReason(reason: string): {
  type: string;
  startDate: string;
  endDate: string;
  note: string;
  isHalfDay: boolean;
  onBehalfName?: string;
  onBehalfId?: string;
} {
  const parts = reason.split(" | ");
  const type = parts[0]?.replace("Leave: ", "").trim() || "Casual Leave";
  const datePart = parts[1] || "";
  const [startDate = "", endDate = ""] = datePart.split(" to ").map((d) => d.trim());
  const note = parts[2]?.replace("Note: ", "").trim() || reason;
  const duration = parts[3]?.replace("Duration: ", "").trim() || "full";

  const onBehalfName = parts[4]?.replace("OnBehalfName: ", "").trim();
  const onBehalfId = parts[5]?.replace("OnBehalfId: ", "").trim();

  return {
    type,
    startDate,
    endDate,
    note,
    isHalfDay: duration === "half",
    onBehalfName,
    onBehalfId,
  };
}
