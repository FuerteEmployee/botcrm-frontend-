import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient, IMAGE_BASE_URL } from "@/lib/api-client";
import {
  Calendar as CalendarIcon, Clock, CheckCircle, XCircle, AlertTriangle,
  ChevronLeft, ChevronRight, RefreshCw, Coffee, Play, Info, ArrowUpRight,
  MapPin, HelpCircle, Check, Sparkles, Filter
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { motion, AnimatePresence } from "framer-motion";

export const Route = createFileRoute("/user/history")({
  component: UserHistory,
});

interface AttendanceLog {
  _id: string;
  date: string;
  punchIn?: string;
  punchOut?: string;
  lunchInTime?: string;
  lunchOutTime?: string;
  isWFH?: boolean;
  status: "present" | "absent" | "half-day" | "late" | "weekly-off" | "festival";
  remarks?: string;
  address?: string;
  punchInPhoto?: string;
  punchOutPhoto?: string;
  punchInLocation?: string;
  punchOutLocation?: string;
  lunchInLocation?: string;
  lunchOutLocation?: string;
}

interface UserProfile {
  _id: string;
  name: string;
  phone: string;
  role: string;
  email?: string;
  departmentId?: { name: string };
  branchId?: { name: string; latitude: number; longitude: number };
  shiftId?: { name: string; startTime: string; endTime: string };
  todayAttendance?: AttendanceLog | null;
  recentAttendance?: AttendanceLog[];
  upcomingHolidays?: Array<{ _id: string; name: string; startDate: string }>;
}

function UserHistory() {
  const [selectedDate, setSelectedDate] = useState(() => {
    const saved = localStorage.getItem("employee-portal-selected-date");
    return saved ? new Date(saved) : new Date();
  });
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    localStorage.setItem("employee-portal-selected-date", selectedDate.toISOString());
    setSelectedDayLog(null);
  }, [selectedDate]);
  const [activeTab, setActiveTab] = useState<"calendar" | "list">("calendar");
  const [selectedDayLog, setSelectedDayLog] = useState<AttendanceLog | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // 1. Fetch Profile
  const { data: profile } = useQuery<UserProfile>({
    queryKey: ["user-profile"],
    queryFn: async () => {
      const { data } = await apiClient.get("/users/profile");
      return data;
    }
  });

  const todayLog = profile?.todayAttendance;
  const isPunchedIn = !!todayLog?.punchIn;
  const isPunchedOut = !!todayLog?.punchOut;

  // 2. Fetch history logs for the selected month/year
  const monthParam = selectedDate.getMonth() + 1;
  const yearParam = selectedDate.getFullYear();

  const { data: historyData, isLoading, isRefetching } = useQuery<{ history: AttendanceLog[] }>({
    queryKey: ["user-history", monthParam, yearParam],
    queryFn: async () => {
      const { data } = await apiClient.get("/attendance/my-history", {
        params: { month: monthParam, year: yearParam }
      });
      return data;
    }
  });

  // Ticking clock for unified dashboard experience
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const todayVal = new Date();
  const isCurrentMonth = selectedDate.getFullYear() === todayVal.getFullYear() && selectedDate.getMonth() === todayVal.getMonth();

  // Month navigation (does not allow going into the future)
  const changeMonth = (offset: number) => {
    const next = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + offset, 1);
    const today = new Date();
    const currentMonthFirst = new Date(today.getFullYear(), today.getMonth(), 1);
    if (next <= currentMonthFirst) {
      setSelectedDate(next);
      setSelectedDayLog(null);
    }
  };

  // Helper to generate days of the month for grid
  const getDaysInMonth = (d: Date) => {
    const year = d.getFullYear();
    const month = d.getMonth();
    const date = new Date(year, month, 1);
    const days = [];

    // Fill prefix empty slots (days before 1st of the month)
    const firstDayIndex = date.getDay(); // 0 is Sunday, 1 is Monday...
    for (let i = 0; i < firstDayIndex; i++) {
      days.push(null);
    }

    // Fill actual days of the month
    while (date.getMonth() === month) {
      days.push(new Date(date));
      date.setDate(date.getDate() + 1);
    }

    return days;
  };

  const getDayRecord = (day: Date | null) => {
    if (!day || !historyData?.history) return null;
    const dateString = day.toDateString();
    return historyData.history.find(log => new Date(log.date).toDateString() === dateString);
  };

  // Formatting helpers
  const formatTimeStr = (isoString?: string) => {
    if (!isoString) return "--";
    return new Date(isoString).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const formatDuration = (record: AttendanceLog) => {
    if (!record.punchIn) return "00h 00m";
    if (!record.punchOut) return "00h 00m";
    const diff = new Date(record.punchOut).getTime() - new Date(record.punchIn).getTime();
    const hrs = Math.floor(diff / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return `${hrs.toString().padStart(2, '0')}h ${mins.toString().padStart(2, '0')}m`;
  };

  // Statistics calculators
  const calculateTotalMonthlyHours = () => {
    if (!historyData?.history) return 0;
    let totalMs = 0;
    historyData.history.forEach(record => {
      if (record.punchIn && record.punchOut) {
        totalMs += new Date(record.punchOut!).getTime() - new Date(record.punchIn!).getTime();
      }
    });
    return Math.round((totalMs / (1000 * 60 * 60)) * 10) / 10;
  };

  const getAverageDailyHours = () => {
    if (!historyData?.history) return 0;
    const completedRecords = historyData.history.filter(r => r.punchIn && r.punchOut);
    if (completedRecords.length === 0) return 0;
    let totalMs = 0;
    completedRecords.forEach(record => {
      totalMs += new Date(record.punchOut!).getTime() - new Date(record.punchIn!).getTime();
    });
    const avgMs = totalMs / completedRecords.length;
    return Math.round((avgMs / (1000 * 60 * 60)) * 10) / 10;
  };

  const getPunctualityScore = () => {
    if (!historyData?.history) return 100;
    const presentRecords = historyData.history.filter(r => r.status === "present" || r.status === "late" || r.status === "half-day");
    if (presentRecords.length === 0) return 100;
    const onTimeRecords = presentRecords.filter(r => r.status === "present");
    return Math.round((onTimeRecords.length / presentRecords.length) * 100);
  };

  const initials = (profile?.name ?? "User").split(" ").map(s => s[0]).slice(0, 2).join("");
  const days = getDaysInMonth(selectedDate);
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  // Filter logs for the list view
  const filteredLogs = historyData?.history?.filter(log => {
    if (statusFilter === "all") return true;
    if (statusFilter === "present") return log.status === "present";
    if (statusFilter === "late") return log.status === "late";
    if (statusFilter === "absent") return log.status === "absent";
    if (statusFilter === "wfh") return log.isWFH === true;
    return true;
  }) || [];

  return (
    <div className="w-full space-y-6">

      {/* Title */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-slate-800 dark:text-slate-100">
            Attendance Logs & History
          </h2>
          <p className="text-slate-500 text-xs mt-1">
            Review detailed timeline summaries, compliance metrics, and interactive maps of your monthly logs.
          </p>
        </div>

        {/* Tab switch buttons */}
        <div className="p-1 rounded-xl bg-slate-100/80 dark:bg-slate-900/60 border border-slate-200/50 dark:border-white/5 backdrop-blur-md flex items-center self-start shrink-0">
          <button
            onClick={() => setActiveTab("calendar")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${activeTab === "calendar"
                ? "bg-white dark:bg-slate-800 text-primary shadow-sm"
                : "text-slate-505 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
          >
            <CalendarIcon className="h-3.5 w-3.5 text-primary/80" />
            <span>Interactive Calendar Map</span>
          </button>
          <button
            onClick={() => setActiveTab("list")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${activeTab === "list"
                ? "bg-white dark:bg-slate-800 text-primary shadow-sm"
                : "text-slate-505 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
          >
            <Clock className="h-3.5 w-3.5 text-primary/80" />
            <span>Chronological List</span>
          </button>
        </div>
      </div>

      {/* LAPTOP VIEW: Side-by-Side Left (Clock & Analytics) and Right (Visual Grid / List) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

        {/* LEFT COLUMN: Plum Clock Widget & Detailed Month Summary */}
        <div className="col-span-1 lg:col-span-4 space-y-6">

          {/* Ticking Clock Purple-Plum Metallic Card */}
          <Card className="border border-white/10 dark:border-white/5 shadow-[0_20px_50px_rgba(80,21,55,0.15)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.4)] rounded-[28px] overflow-hidden bg-gradient-to-br from-[#2D061A] via-[#501537] to-[#8C2059] text-white relative group">
            <div className="absolute inset-0 bg-radial-at-t from-white/10 to-transparent pointer-events-none" />
            <CardContent className="p-6 space-y-5 relative z-10">

              {/* Header details inside card */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5 text-left">
                  <h3 className="text-3xl font-bold font-mono tracking-tight text-white drop-shadow-sm">
                    {time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })}
                  </h3>
                  <p className="text-[10px] text-white/70 font-bold uppercase tracking-widest">
                    {time.toLocaleDateString("en-US", { day: "numeric", month: "short" })}, {time.toLocaleDateString("en-US", { weekday: "short" })}
                  </p>
                </div>

                {/* Punch status pill */}
                <Badge className={`border-none px-3 py-0.5 text-[8px] font-bold uppercase tracking-wider rounded-full shadow-[0_2px_10px_rgba(0,0,0,0.1)] ${isPunchedIn && !isPunchedOut
                    ? "bg-emerald-500 text-white animate-pulse"
                    : "bg-white/15 text-white/90"
                  }`}>
                  {isPunchedIn && !isPunchedOut ? "• Active Session" : "• Offline"}
                </Badge>
              </div>

              {/* Sub card details grid */}
              <div className="p-4 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md flex items-center gap-4 shadow-inner">
                <Avatar className="h-11 w-11 ring-2 ring-white/20 shrink-0">
                  <AvatarFallback className="bg-gradient-to-br from-[#8C2059] to-[#501537] text-white font-bold text-xs">
                    {initials}
                  </AvatarFallback>
                </Avatar>

                <div className="grid grid-cols-2 gap-x-4 gap-y-2 flex-1 text-left">
                  <div>
                    <span className="text-[8px] font-bold text-white/50 uppercase tracking-widest block">PUNCH-IN</span>
                    <span className="text-[10px] font-bold text-white/90">{formatTimeStr(todayLog?.punchIn)}</span>
                  </div>
                  <div>
                    <span className="text-[8px] font-bold text-white/50 uppercase tracking-widest block">PUNCH-OUT</span>
                    <span className="text-[10px] font-bold text-white/90">{formatTimeStr(todayLog?.punchOut)}</span>
                  </div>
                  <div>
                    <span className="text-[8px] font-bold text-white/50 uppercase tracking-widest block">LUNCH-IN</span>
                    <span className="text-[10px] font-bold text-white/90">{formatTimeStr(todayLog?.lunchInTime)}</span>
                  </div>
                  <div>
                    <span className="text-[8px] font-bold text-white/50 uppercase tracking-widest block">LUNCH-OUT</span>
                    <span className="text-[10px] font-bold text-white/90">{formatTimeStr(todayLog?.lunchOutTime)}</span>
                  </div>
                </div>
              </div>

              {/* Location indicator */}
              <div className="flex items-center justify-center gap-1.5 text-[9.5px] text-white/60">
                <MapPin className="h-3 w-3 shrink-0 text-white/80" />
                <span className="font-semibold truncate">{profile?.branchId?.name || "Remote Workspace"}</span>
              </div>

              {/* Today's Punch Selfie Proofs */}
              {(todayLog?.punchInPhoto || todayLog?.punchOutPhoto) && (
                <div className="flex items-center justify-center gap-4 mt-3 pt-3 border-t border-white/10">
                  {todayLog.punchInPhoto && (
                    <div className="flex flex-col items-center gap-1">
                      <span className="text-[7px] font-bold text-white/50 uppercase tracking-widest">In Selfie</span>
                      <div className="h-10 w-16 rounded-lg overflow-hidden border border-white/10 relative group/selfie cursor-zoom-in shadow-sm">
                        <img
                          src={todayLog.punchInPhoto.startsWith('http') ? todayLog.punchInPhoto : `${IMAGE_BASE_URL}${todayLog.punchInPhoto}`}
                          alt="Punch In"
                          className="w-full h-full object-cover group-hover/selfie:scale-115 transition-transform duration-300"
                        />
                      </div>
                    </div>
                  )}
                  {todayLog.punchOutPhoto && (
                    <div className="flex flex-col items-center gap-1">
                      <span className="text-[7px] font-bold text-white/50 uppercase tracking-widest">Out Selfie</span>
                      <div className="h-10 w-16 rounded-lg overflow-hidden border border-white/10 relative group/selfie cursor-zoom-in shadow-sm">
                        <img
                          src={todayLog.punchOutPhoto.startsWith('http') ? todayLog.punchOutPhoto : `${IMAGE_BASE_URL}${todayLog.punchOutPhoto}`}
                          alt="Punch Out"
                          className="w-full h-full object-cover group-hover/selfie:scale-115 transition-transform duration-300"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

            </CardContent>
          </Card>

          {/* MONTHLY METRIC INSIGHTS (Descriptive/Informative Addition) */}
          <Card className="border border-slate-100/50 dark:border-white/5 shadow-xs bg-white/70 dark:bg-slate-900/40 backdrop-blur-md rounded-[24px] overflow-hidden">
            <CardContent className="p-5 space-y-4">
              <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 border-b border-slate-150 dark:border-slate-800/40 pb-2 text-left">
                Monthly Performance Insights
              </h4>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-slate-50 dark:bg-slate-950/40 rounded-xl space-y-1">
                  <span className="text-[9px] text-slate-400 font-bold block uppercase leading-none">Total Hours</span>
                  <span className="text-lg font-bold text-slate-850 dark:text-slate-100">{calculateTotalMonthlyHours()}h</span>
                  <span className="text-[8px] text-slate-400 block font-medium">Worked this month</span>
                </div>
                <div className="p-3 bg-slate-50 dark:bg-slate-950/40 rounded-xl space-y-1">
                  <span className="text-[9px] text-slate-400 font-bold block uppercase leading-none">Daily Average</span>
                  <span className="text-lg font-bold text-slate-850 dark:text-slate-100">{getAverageDailyHours()}h</span>
                  <span className="text-[8px] text-slate-400 block font-medium">Per shift session</span>
                </div>
              </div>

              <div className="space-y-2.5 pt-1">
                <div className="flex items-center justify-between text-[11px] font-bold">
                  <span className="text-slate-500 dark:text-slate-400">Punctuality Score:</span>
                  <span className="text-[#501537] dark:text-[#7B2453] font-bold">{getPunctualityScore()}%</span>
                </div>
                <div className="w-full h-1 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-purple-500 to-[#501537]"
                    style={{ width: `${getPunctualityScore()}%` }}
                  />
                </div>
                <p className="text-[9.5px] text-slate-400 leading-relaxed italic">
                  *On-Time logs calculate ratios of present days without late mark flags. Aim for &gt;90%!
                </p>
              </div>
            </CardContent>
          </Card>

          {/* CALENDAR LEGEND */}
          {activeTab === "calendar" && (
            <Card className="border-0 shadow-xs bg-white dark:bg-slate-900 rounded-2xl p-5">
              <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-3.5">
                Calendar Status Legend
              </h4>
              <div className="grid grid-cols-2 gap-x-2 gap-y-3">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-emerald-500/10 border border-emerald-500 shrink-0" />
                  <span className="text-[10px] text-slate-600 dark:text-slate-300 font-bold">On-Time Present</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-amber-500/10 border border-amber-500 shrink-0" />
                  <span className="text-[10px] text-slate-600 dark:text-slate-300 font-bold">Late Arrival</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-blue-500/10 border border-blue-500 shrink-0" />
                  <span className="text-[10px] text-slate-600 dark:text-slate-300 font-bold">Half-Day Log</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-rose-500/10 border border-rose-500 shrink-0" />
                  <span className="text-[10px] text-slate-600 dark:text-slate-300 font-bold">Absent / LOP</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-indigo-500/10 border border-indigo-500 shrink-0" />
                  <span className="text-[10px] text-slate-600 dark:text-slate-300 font-bold">Work From Home</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shrink-0" />
                  <span className="text-[10px] text-slate-600 dark:text-slate-300 font-bold">Off Day / Future</span>
                </div>
              </div>
            </Card>
          )}

        </div>

        {/* RIGHT COLUMN: Interactive Calendar Grid OR Chronological Log List */}
        <div className="col-span-1 lg:col-span-8 space-y-6">

          {/* Month Selector header */}
          <div className="flex items-center justify-between bg-white dark:bg-slate-900 px-6 py-4.5 rounded-2xl shadow-xs border border-slate-100/50 dark:border-slate-800/20">
            <button
              onClick={() => changeMonth(-1)}
              className="text-[#501537] dark:text-[#7B2453] hover:bg-[#501537]/5 dark:hover:bg-[#7B2453]/10 p-2 rounded-xl transition-all cursor-pointer"
            >
              <ChevronLeft className="h-5 w-5 stroke-[3px]" />
            </button>

            <h4 className="font-black text-sm text-slate-750 dark:text-white uppercase tracking-wider">
              {selectedDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
            </h4>

            <button
              onClick={() => changeMonth(1)}
              disabled={isCurrentMonth}
              className={`text-[#501537] dark:text-[#7B2453] p-2 rounded-xl transition-all ${isCurrentMonth
                  ? "opacity-30 cursor-not-allowed"
                  : "hover:bg-[#501537]/5 dark:hover:bg-[#7B2453]/10 cursor-pointer"
                }`}
            >
              <ChevronRight className="h-5 w-5 stroke-[3px]" />
            </button>
          </div>

          {/* INTERACTIVE CALENDAR GRID TAB */}
          {activeTab === "calendar" && (
            <div className="space-y-6">

              {/* Calendar Grid Box */}
              <Card className="border-0 shadow-xs bg-white dark:bg-slate-900 rounded-[28px] overflow-hidden p-6">

                {/* Weekdays indicator headers */}
                <div className="grid grid-cols-7 gap-2.5 text-center mb-3">
                  {weekdays.map(d => (
                    <span key={d} className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block py-1">
                      {d}
                    </span>
                  ))}
                </div>

                {/* Day Grid Boxes */}
                {isLoading || isRefetching ? (
                  <div className="grid grid-cols-7 gap-2.5 animate-pulse">
                    {Array.from({ length: 31 }).map((_, idx) => (
                      <div key={idx} className="aspect-square bg-slate-200 dark:bg-slate-800/80 rounded-xl sm:rounded-2xl" />
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-7 gap-2.5">
                    {days.map((day, idx) => {
                      if (!day) {
                        return <div key={`empty-${idx}`} className="aspect-square bg-slate-50/20 dark:bg-slate-950/5 rounded-xl border border-slate-100/10" />;
                      }

                      const record = getDayRecord(day);
                      const dayNum = day.getDate();
                      const isToday = day.toDateString() === new Date().toDateString();

                      const today = new Date();
                      today.setHours(0, 0, 0, 0);
                      const isFuture = day.getTime() > today.getTime() && day.toDateString() !== today.toDateString();

                      // Compute statuses & classes
                      let circleClass = "bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-100 dark:bg-slate-950/40 dark:hover:bg-slate-950/80 dark:text-slate-300 dark:border-slate-800/40";

                      if (isFuture) {
                        circleClass = "bg-slate-100/30 text-slate-400/40 border-slate-200/10 dark:bg-slate-950/10 dark:text-slate-650 dark:border-slate-900/15 cursor-not-allowed opacity-50";
                      } else if (record) {
                        if (record.isWFH) {
                          circleClass = "bg-indigo-500/10 text-indigo-600 border-indigo-500/30 hover:bg-indigo-500/20 dark:text-indigo-400 dark:border-indigo-500/20";
                        } else if (record.status === "present") {
                          circleClass = "bg-emerald-500/10 text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/20 dark:text-emerald-400 dark:border-emerald-500/20";
                        } else if (record.status === "late") {
                          circleClass = "bg-amber-500/10 text-amber-600 border-amber-500/30 hover:bg-amber-500/20 dark:text-amber-400 dark:border-amber-500/20";
                        } else if (record.status === "half-day") {
                          circleClass = "bg-blue-500/10 text-blue-600 border-blue-500/30 hover:bg-blue-500/20 dark:text-blue-400 dark:border-blue-500/20";
                        } else if (record.status === "absent") {
                          circleClass = "bg-rose-500/10 text-rose-600 border-rose-500/30 hover:bg-rose-500/20 dark:text-rose-400 dark:border-rose-500/20";
                        }
                      }

                      const isSelected = selectedDayLog && new Date(selectedDayLog.date).toDateString() === day.toDateString();

                      return (
                        <button
                          key={day.toISOString()}
                          onClick={() => {
                            if (isFuture) return;
                            if (record) setSelectedDayLog(record);
                            else setSelectedDayLog({
                              _id: `mock-${day.toISOString()}`,
                              date: day.toISOString(),
                              status: "weekly-off",
                              remarks: "No duty session logged / Off Day"
                            });
                          }}
                          disabled={isFuture}
                          className={`aspect-square rounded-xl sm:rounded-2xl border flex flex-col items-center justify-between p-1.5 sm:p-2.5 transition-all duration-300 relative group ${isFuture ? "cursor-not-allowed" : "cursor-pointer hover:scale-[1.03]"} ${circleClass} ${isSelected
                              ? "ring-2 ring-primary ring-offset-2 dark:ring-offset-slate-900 border-transparent shadow-md"
                              : ""
                            }`}
                        >
                          {/* Top row: day number and indicator check */}
                          <div className="flex items-center justify-between w-full">
                            <span className={`text-[10px] sm:text-xs font-black ${isToday ? "h-4.5 w-4.5 sm:h-5 sm:w-5 bg-[#501537] text-white flex items-center justify-center rounded-full text-[9px] sm:text-[10px]" : ""}`}>
                              {dayNum}
                            </span>

                            {record && (
                              <span className="h-1 w-1 sm:h-1.5 sm:w-1.5 rounded-full bg-current shrink-0" />
                            )}
                          </div>

                          {/* Bottom details helper inside box */}
                          <span className="text-[7.5px] font-black uppercase tracking-widest opacity-60 leading-none truncate w-full text-center hidden sm:block">
                            {isFuture ? "Upcoming" : record ? (record.isWFH ? "WFH" : record.status) : ""}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </Card>

              {/* CALENDAR CLICK DETAIL PANEL (Informative and Descriptive timeline) */}
              <AnimatePresence mode="wait">
                {selectedDayLog && (
                  <motion.div
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 15 }}
                    transition={{ duration: 0.3 }}
                  >
                    <Card className="border-0 shadow-elegant bg-slate-900 text-white rounded-[24px] overflow-hidden">
                      <CardContent className="p-6 space-y-4">

                        {/* Header details */}
                        <div className="flex items-center justify-between border-b border-white/10 pb-3">
                          <div className="space-y-0.5">
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">Session Breakdown</span>
                            <h4 className="text-[14px] font-black text-white">
                              {new Date(selectedDayLog.date).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
                            </h4>
                          </div>

                          <Badge className={`border-none text-[8.5px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full shadow-xs ${selectedDayLog.status === "present"
                              ? "bg-emerald-500 text-white"
                              : selectedDayLog.status === "late"
                                ? "bg-amber-500 text-slate-900"
                                : selectedDayLog.status === "absent"
                                  ? "bg-rose-500 text-white"
                                  : "bg-white/10 text-white/70"
                            }`}>
                            {selectedDayLog.isWFH ? "WFH SESSION" : selectedDayLog.status}
                          </Badge>
                        </div>

                        {/* Timing Timeline Display */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2">
                          <div className="p-3 bg-white/5 rounded-xl border border-white/10 flex flex-col justify-between">
                            <div>
                              <span className="text-[8px] font-bold text-white/40 block uppercase tracking-widest mb-1">PUNCH IN</span>
                              <span className="text-[13px] font-black text-white">{formatTimeStr(selectedDayLog.punchIn)}</span>
                            </div>
                            {selectedDayLog.punchInPhoto && (
                              <div className="mt-2 rounded-lg overflow-hidden border border-white/10 aspect-video relative group/photo cursor-zoom-in">
                                <img
                                  src={selectedDayLog.punchInPhoto.startsWith('http') ? selectedDayLog.punchInPhoto : `${IMAGE_BASE_URL}${selectedDayLog.punchInPhoto}`}
                                  alt="Punch In Selfie"
                                  className="w-full h-full object-cover group-hover/photo:scale-110 transition-transform duration-300"
                                />
                                <span className="absolute bottom-1 right-1 bg-black/60 px-1 py-0.5 rounded text-[7px] font-bold uppercase tracking-wider text-white">Selfie</span>
                              </div>
                            )}
                          </div>

                          <div className="p-3 bg-white/5 rounded-xl border border-white/10 flex flex-col justify-between">
                            <div>
                              <span className="text-[8px] font-bold text-white/40 block uppercase tracking-widest mb-1">PUNCH OUT</span>
                              <span className="text-[13px] font-black text-white">{formatTimeStr(selectedDayLog.punchOut)}</span>
                            </div>
                            {selectedDayLog.punchOutPhoto && (
                              <div className="mt-2 rounded-lg overflow-hidden border border-white/10 aspect-video relative group/photo cursor-zoom-in">
                                <img
                                  src={selectedDayLog.punchOutPhoto.startsWith('http') ? selectedDayLog.punchOutPhoto : `${IMAGE_BASE_URL}${selectedDayLog.punchOutPhoto}`}
                                  alt="Punch Out Selfie"
                                  className="w-full h-full object-cover group-hover/photo:scale-110 transition-transform duration-300"
                                />
                                <span className="absolute bottom-1 right-1 bg-black/60 px-1 py-0.5 rounded text-[7px] font-bold uppercase tracking-wider text-white">Selfie</span>
                              </div>
                            )}
                          </div>

                          <div className="p-3 bg-white/5 rounded-xl border border-white/10">
                            <span className="text-[8px] font-bold text-white/40 block uppercase tracking-widest mb-1">TOTAL WORKED</span>
                            <span className="text-[13px] font-black text-amber-300 font-mono">{formatDuration(selectedDayLog)}</span>
                          </div>

                          <div className="p-3 bg-white/5 rounded-xl border border-white/10">
                            <span className="text-[8px] font-bold text-white/40 block uppercase tracking-widest mb-1">LUNCH BREAK</span>
                            <span className="text-[13px] font-black text-white font-mono">
                              {selectedDayLog.lunchInTime ? "Break Taken" : "No Break Log"}
                            </span>
                          </div>
                        </div>

                        {/* Location addresses for all 4 actions and remarks */}
                        <div className="space-y-3.5 pt-2 text-[11px] border-t border-white/5">
                          {/* Punch In Location Address */}
                          {selectedDayLog.punchInLocation && (
                            <div className="flex items-start gap-2.5">
                              <MapPin className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                              <div className="leading-tight text-left">
                                <span className="text-[8px] font-bold text-white/40 block uppercase tracking-widest mb-0.5">Punch-In Location</span>
                                <span className="text-white/80 font-bold">{selectedDayLog.punchInLocation}</span>
                              </div>
                            </div>
                          )}

                          {/* Punch Out Location Address */}
                          {selectedDayLog.punchOutLocation && (
                            <div className="flex items-start gap-2.5">
                              <MapPin className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
                              <div className="leading-tight text-left">
                                <span className="text-[8px] font-bold text-white/40 block uppercase tracking-widest mb-0.5">Punch-Out Location</span>
                                <span className="text-white/80 font-bold">{selectedDayLog.punchOutLocation}</span>
                              </div>
                            </div>
                          )}

                          {/* Lunch In Location Address */}
                          {selectedDayLog.lunchInLocation && (
                            <div className="flex items-start gap-2.5">
                              <MapPin className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                              <div className="leading-tight text-left">
                                <span className="text-[8px] font-bold text-white/40 block uppercase tracking-widest mb-0.5">Start Lunch Location</span>
                                <span className="text-white/80 font-bold">{selectedDayLog.lunchInLocation}</span>
                              </div>
                            </div>
                          )}

                          {/* Lunch Out Location Address */}
                          {selectedDayLog.lunchOutLocation && (
                            <div className="flex items-start gap-2.5">
                              <MapPin className="h-4 w-4 text-sky-400 shrink-0 mt-0.5" />
                              <div className="leading-tight text-left">
                                <span className="text-[8px] font-bold text-white/40 block uppercase tracking-widest mb-0.5">End Lunch Location</span>
                                <span className="text-white/80 font-bold">{selectedDayLog.lunchOutLocation}</span>
                              </div>
                            </div>
                          )}

                          {selectedDayLog.remarks && (
                            <div className="flex items-start gap-2.5 pt-1.5 border-t border-white/5">
                              <Info className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
                              <div className="leading-tight text-left">
                                <span className="text-[8px] font-bold text-white/40 block uppercase tracking-widest mb-0.5">Remarks</span>
                                <span className="text-white/80 font-medium italic">"{selectedDayLog.remarks}"</span>
                              </div>
                            </div>
                          )}
                        </div>

                      </CardContent>
                    </Card>
                  </motion.div>
                )}
              </AnimatePresence>

            </div>
          )}

          {/* CHRONOLOGICAL LIST VIEW TAB */}
          {activeTab === "list" && (
            <div className="space-y-4">

              {/* Quick Filter Badges */}
              <div className="flex flex-wrap items-center gap-2 bg-white dark:bg-slate-900 px-5 py-3 rounded-2xl shadow-xs border border-slate-100/50 dark:border-slate-800/20">
                <span className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 mr-2 flex items-center gap-1.5">
                  <Filter className="h-3.5 w-3.5" /> Filter Status:
                </span>

                {[
                  { value: "all", label: "All Logs" },
                  { value: "present", label: "On-Time" },
                  { value: "late", label: "Late Marks" },
                  { value: "wfh", label: "WFH Logs" },
                  { value: "absent", label: "Absents" },
                ].map(f => (
                  <button
                    key={f.value}
                    onClick={() => setStatusFilter(f.value)}
                    className={`px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${statusFilter === f.value
                        ? "bg-[#501537] text-white"
                        : "bg-slate-100 hover:bg-slate-200 text-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-400"
                      }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {/* List entries */}
              {isLoading || isRefetching ? (
                <div className="space-y-3.5 animate-pulse">
                  {Array.from({ length: 3 }).map((_, idx) => (
                    <div key={idx} className="p-5 bg-slate-200 dark:bg-slate-800/40 rounded-[24px] h-[130px]" />
                  ))}
                </div>
              ) : filteredLogs.length > 0 ? (
                <div className="space-y-3.5">
                  {filteredLogs.map((record) => {
                    const dateObj = new Date(record.date);
                    const dayStr = dateObj.toLocaleDateString("en-US", { day: "numeric", month: "short" });
                    const weekdayStr = dateObj.toLocaleDateString("en-US", { weekday: "short" });

                    // Highlight status badges
                    const isLate = record.status === "late";
                    const isHalfDay = record.status === "half-day";
                    const isAbsent = record.status === "absent";
                    const isWFH = record.isWFH;

                    return (
                      <motion.div
                        key={record.date}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="p-5 bg-white dark:bg-slate-900 rounded-[24px] shadow-xs flex flex-col gap-4 border border-slate-100/50 dark:border-slate-800/30 hover:border-slate-250 dark:hover:border-slate-800 transition-all duration-300 hover:shadow-soft"
                      >
                        {/* Top Row: Date, badges, worked timer */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-black text-slate-850 dark:text-slate-100">
                              {dayStr}, {weekdayStr}
                            </span>

                            {/* Detailed descriptive status badges */}
                            {isWFH ? (
                              <Badge className="border-none bg-indigo-500/10 text-indigo-500 text-[8.5px] font-black uppercase tracking-wider px-2 py-0">Remote WFH</Badge>
                            ) : isAbsent ? (
                              <Badge className="border-none bg-rose-500/10 text-rose-500 text-[8.5px] font-black uppercase tracking-wider px-2 py-0">LOP Absent</Badge>
                            ) : isLate ? (
                              <Badge className="border-none bg-amber-500/10 text-amber-600 dark:text-amber-500 text-[8.5px] font-black uppercase tracking-wider px-2 py-0">Late Arrival</Badge>
                            ) : isHalfDay ? (
                              <Badge className="border-none bg-blue-500/10 text-blue-500 text-[8.5px] font-black uppercase tracking-wider px-2 py-0">Half Day</Badge>
                            ) : (
                              <Badge className="border-none bg-emerald-500/10 text-emerald-500 text-[8.5px] font-black uppercase tracking-wider px-2 py-0">Present On-Time</Badge>
                            )}
                          </div>

                          {/* Worked duration timer */}
                          <div className="flex items-center gap-1.5 text-slate-400 dark:text-slate-500 shrink-0">
                            <Clock className="h-3.5 w-3.5 text-slate-400" />
                            <span className="text-xs font-black text-slate-700 dark:text-slate-300 font-mono">
                              {formatDuration(record)}
                            </span>
                          </div>
                        </div>

                        {/* Punch timings timeline details */}
                        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px] font-bold text-slate-400 border-t border-slate-50 dark:border-slate-800/40 pt-3">
                          <div>
                            Punch-In: <span className="text-slate-800 dark:text-slate-200 font-black">{formatTimeStr(record.punchIn)}</span>
                          </div>
                          <div>
                            Punch-Out: <span className="text-slate-800 dark:text-slate-200 font-black">{formatTimeStr(record.punchOut)}</span>
                          </div>
                          {record.remarks && (
                            <div className="col-span-2 text-[10px] text-slate-400 dark:text-slate-500 italic mt-1 leading-relaxed">
                              Remarks: "{record.remarks}"
                            </div>
                          )}
                          {record.punchInLocation && (
                            <div className="col-span-2 text-[9.5px] text-slate-400/85 font-medium flex items-center gap-1.5 truncate mt-0.5">
                              <MapPin className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                              <span className="truncate">In: {record.punchInLocation}</span>
                            </div>
                          )}
                          {record.punchOutLocation && (
                            <div className="col-span-2 text-[9.5px] text-slate-400/85 font-medium flex items-center gap-1.5 truncate">
                              <MapPin className="h-3.5 w-3.5 text-rose-500 shrink-0" />
                              <span className="truncate">Out: {record.punchOutLocation}</span>
                            </div>
                          )}
                          {(record.punchInPhoto || record.punchOutPhoto) && (
                            <div className="col-span-2 flex items-center gap-3 mt-2 pt-2.5 border-t border-slate-50 dark:border-slate-800/20">
                              {record.punchInPhoto && (
                                <div className="flex flex-col gap-1">
                                  <span className="text-[7.5px] font-bold text-slate-400 uppercase tracking-widest">In Selfie</span>
                                  <div className="h-10 w-16 rounded-lg overflow-hidden border border-slate-100 dark:border-slate-800 relative group/listphoto cursor-zoom-in">
                                    <img
                                      src={record.punchInPhoto.startsWith('http') ? record.punchInPhoto : `${IMAGE_BASE_URL}${record.punchInPhoto}`}
                                      alt="Punch In"
                                      className="w-full h-full object-cover group-hover/listphoto:scale-110 transition-transform duration-300"
                                    />
                                  </div>
                                </div>
                              )}
                              {record.punchOutPhoto && (
                                <div className="flex flex-col gap-1">
                                  <span className="text-[7.5px] font-bold text-slate-400 uppercase tracking-widest">Out Selfie</span>
                                  <div className="h-10 w-16 rounded-lg overflow-hidden border border-slate-100 dark:border-slate-800 relative group/listphoto cursor-zoom-in">
                                    <img
                                      src={record.punchOutPhoto.startsWith('http') ? record.punchOutPhoto : `${IMAGE_BASE_URL}${record.punchOutPhoto}`}
                                      alt="Punch Out"
                                      className="w-full h-full object-cover group-hover/listphoto:scale-110 transition-transform duration-300"
                                    />
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                      </motion.div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-slate-400 text-center py-12 bg-white dark:bg-slate-900 rounded-2xl shadow-xs border border-slate-100/50 dark:border-slate-800/20">
                  No chronological logs matched the filter.
                </p>
              )}

            </div>
          )}

        </div>

      </div>

    </div>
  );
}

export default UserHistory;
