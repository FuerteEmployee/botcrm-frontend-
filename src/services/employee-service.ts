import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";
import { requestErrorMessage } from "@/services/request-error";

// requestErrorMessage: the server's own sentence for a 4xx (duplicate phone,
// seat limit, "That branch is not one of your company's branches"), a plain
// fallback for a 5xx instead of whatever the exception said ("Cast to ObjectId
// failed ..."), a connection line when offline, and silence for a 401 or a
// plan-upgrade 403 that the app already announced.
function toastError(error: unknown, fallback: string) {
  const message = requestErrorMessage(error, fallback);
  if (message) toast.error(message);
}

// Every admin page that shows employees under its own query key. After a
// create, edit or delete these would otherwise keep the old roster for up to
// the app-wide staleTime (a minute): a new hire missing from the biometric PIN
// map and the absent-today list, a deleted one still on the salary sheet.
const EMPLOYEE_DEPENDENT_QUERIES = [
  "employees", "biometric-devices", "attendance", "attendance-stats", "absent-today",
  "salaries", "dashboard-summary", "tracking-stats", "my-subscription", "client-devices",
  "leaves", "tickets", "user-tickets", "advance-salary-requests", "expenses", "coworkers",
];

// Fetch everyone unless a caller asks for a page. The API returns the whole
// roster and pages client-side below, so the old default of 10 only hid
// people: the edit form, Assets > Allocate and Expenses all called the hook
// without a limit and saw just the 10 newest active employees.
const ALL_ROWS = Number.MAX_SAFE_INTEGER;

export interface WeeklyHoliday {
  day: 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday';
  weeks: number[]; // [] = all, [1,3] = 1st & 3rd
}

export interface SalaryComponent {
  enabled: boolean;
  type: 'percentage' | 'amount';
  percentage: number;
  amount: number;
  includeInTotal: boolean;
}

export interface Employee {
  _id: string;
  name: string;
  phone: string;
  designation?: string;
  email?: string;
  departmentId?: string;
  branchId?: string;
  branchIds?: string[]; // all branches assigned; branchId is kept as the primary one, and is just branchIds[0]
  shiftId?: string;
  shiftIds?: string[]; // all shifts assigned; shiftId is kept as the primary one for attendance timing
  salary: number;
  profileImage?: string;
  status: 'active' | 'inactive';
  inactiveReason?: string;
  weeklyHolidays: WeeklyHoliday[];
  salaryComponents: {
    tds: SalaryComponent;
    tdsCategory?: string;
    basic: SalaryComponent;
    da: SalaryComponent;
    hra: SalaryComponent;
    ca: SalaryComponent;
    pf: SalaryComponent;
    esic: SalaryComponent;
    epf: SalaryComponent;
    tdsOnProfession: SalaryComponent;
    retention: SalaryComponent;
    pt: SalaryComponent;
    adminCharge: SalaryComponent;
    bonus: SalaryComponent;
  };
  gender?: 'male' | 'female' | 'other';
  dob?: string;
  joiningDate?: string;
  employmentType?: 'monthly' | 'daily' | 'hourly';
  deviceUserId?: string; // PIN this employee is enrolled under on a biometric attendance device
  leadDeletionPermission?: boolean;
  trackingEnabled?: boolean;
  geofenceExempt?: boolean;
  attendanceExceptions?: { overrideGlobal: boolean; requireLocation: boolean; remotePunch: boolean };
  // Scans the employee uploaded from the app (Account > Documents).
  panCardUrls?: string[];
  aadhaarCardUrls?: string[];
  address?: string;
  bloodGroup?: string;
  contactPersonName?: string;
  contactPersonMobile?: string;
  aadhaarNo?: string;
  panNo?: string;
  experience?: string;
  residentialAddress?: string;
  residentialPhone?: string;
  education?: string;
  bankDetails?: {
    accountNumber: string;
    bankName: string;
    ifsc: string;
    branchName: string;
    nameAsPerBank: string;
  };
  createdAt?: string;
  updatedAt?: string;
}

export interface EmployeeResponse {
  employees: Employee[];
  totalPages: number;
  totalRecords: number;
}

interface EmployeeParams {
  page?: number;
  limit?: number;
  search?: string;
  departmentId?: string;
  branchId?: string;
  shiftId?: string;
  status?: string;
}

/**
 * Seats used against the plan's employee cap ("N of M used"); limit null =
 * no cap. Under the ["employees"] key, so every create/delete that refreshes
 * the list refreshes this too.
 */
export function useEmployeeSeatUsage() {
  const { data } = useQuery<{ used: number; limit: number | null }>({
    queryKey: ["employees", "seats"],
    queryFn: async () => (await apiClient.get("/users/employees/usage")).data,
    retry: false,
  });
  return data;
}

export function useEmployeeService(params: EmployeeParams = {}) {
  const queryClient = useQueryClient();
  const { page = 1, limit = ALL_ROWS, search = "", departmentId = "all", branchId = "all", shiftId = "all", status = "active" } = params;

  const { data, isLoading, isFetching, isError, error, refetch, isRefetching } = useQuery<EmployeeResponse>({
    queryKey: ["employees", page, limit, search, departmentId, branchId, shiftId, status],
    queryFn: async () => {
      const qp = new URLSearchParams();
      qp.append("page", page.toString());
      qp.append("limit", limit.toString());
      if (search) qp.append("search", search);
      if (departmentId && departmentId !== "all") qp.append("departmentId", departmentId);
      if (branchId && branchId !== "all") qp.append("branchId", branchId);
      if (shiftId && shiftId !== "all") qp.append("shiftId", shiftId);
      if (status && status !== "all") qp.append("status", status);

      const { data } = await apiClient.get(`/users/employees?${qp.toString()}`);

      // Handle both formats (if API returns raw array or paginated object)
      if (Array.isArray(data)) {
        // If it's a raw array, we simulate server-side pagination client-side
        // so the UI remains consistent while the backend is being updated.
        const needle = search.trim().toLowerCase();
        const filteredData = data.filter(e => {
          const matchesSearch = !needle ||
            e.name?.toLowerCase().includes(needle) ||
            e.phone?.includes(needle);
          const matchesDept = departmentId === "all" || e.departmentId === departmentId || (e.departmentId as any)?._id === departmentId;
          // Match the PRIMARY branch or any of the additional ones. An employee
          // assigned through branchIds alone would otherwise be missing from
          // their own branch's list -- createUser keeps branchId as merely the
          // first entry of branchIds, so neither field is authoritative by
          // itself. Same shape as the shift check below, for the same reason.
          const matchesBranch = branchId === "all" ||
            e.branchId === branchId ||
            (e.branchId as any)?._id === branchId ||
            (e.branchIds || []).some((b: any) => (b?._id || b) === branchId);
          const matchesShift = shiftId === "all" ||
            e.shiftId === shiftId ||
            (e.shiftId as any)?._id === shiftId ||
            (e.shiftIds || []).some((s: any) => (s?._id || s) === shiftId);
          const matchesStatus = status === "all" || e.status === status;
          return matchesSearch && matchesDept && matchesBranch && matchesShift && matchesStatus;
        });

        const start = (page - 1) * limit;
        return {
          employees: filteredData.slice(start, start + limit),
          totalPages: Math.ceil(filteredData.length / limit),
          totalRecords: filteredData.length
        };
      }
      return data;
    },
    staleTime: 5000,
  });

  const refreshEmployeeViews = () => {
    for (const key of EMPLOYEE_DEPENDENT_QUERIES) queryClient.invalidateQueries({ queryKey: [key] });
  };

  const createMutation = useMutation({
    mutationFn: async (formData: FormData | Partial<Employee>) => {
      const { data } = await apiClient.post("/users/employees", formData);
      return data;
    },
    onSuccess: () => {
      refreshEmployeeViews();
      toast.success("Employee created successfully");
    },
    onError: (error) => toastError(error, "Could not create the employee. Please try again."),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: FormData | Partial<Employee> }) => {
      const { data: response } = await apiClient.put(`/users/employees/${id}`, data);
      return response;
    },
    onSuccess: () => {
      refreshEmployeeViews();
      toast.success("Employee updated successfully");
    },
    onError: (error) => toastError(error, "Could not save the changes. Please try again."),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await apiClient.delete(`/users/employees/${id}`);
      return data;
    },
    onSuccess: () => {
      refreshEmployeeViews();
      toast.success("Employee deleted successfully");
    },
    // There was no handler at all, so a refused or failed delete closed
    // nothing, said nothing, and left the admin pressing the button again.
    onError: (error) => toastError(error, "Could not delete the employee. Please try again."),
  });

  return {
    employees: data?.employees || [],
    totalPages: data?.totalPages || 1,
    totalRecords: data?.totalRecords || 0,
    isLoading,
    isFetching,
    isError,
    error,
    isRefetching,
    refetch,
    createEmployee: createMutation.mutateAsync,
    updateEmployee: updateMutation.mutateAsync,
    deleteEmployee: deleteMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}
