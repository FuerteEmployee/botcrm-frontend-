import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";

// Different endpoints on this backend don't all shape validation errors the
// same way — some use `message`, some `error`, some an `errors[]` array.
// Try each so the user actually sees why a request was rejected instead of
// a generic fallback.
function extractErrorMessage(error: any, fallback: string): string {
  const data = error?.response?.data;
  if (!data) return fallback;
  if (typeof data.message === "string" && data.message) return data.message;
  if (typeof data.error === "string" && data.error) return data.error;
  if (Array.isArray(data.errors) && data.errors.length) {
    return data.errors.map((e: any) => (typeof e === "string" ? e : e.msg || e.message)).filter(Boolean).join(", ") || fallback;
  }
  return fallback;
}

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
  leadDeletionPermission?: boolean;
  trackingEnabled?: boolean;
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
  shiftId?: string;
  status?: string;
}

export function useEmployeeService(params: EmployeeParams = {}) {
  const queryClient = useQueryClient();
  const { page = 1, limit = 10, search = "", departmentId = "all", shiftId = "all", status = "active" } = params;

  const { data, isLoading, isFetching } = useQuery<EmployeeResponse>({
    queryKey: ["employees", page, limit, search, departmentId, shiftId, status],
    queryFn: async () => {
      const qp = new URLSearchParams();
      qp.append("page", page.toString());
      qp.append("limit", limit.toString());
      if (search) qp.append("search", search);
      if (departmentId && departmentId !== "all") qp.append("departmentId", departmentId);
      if (shiftId && shiftId !== "all") qp.append("shiftId", shiftId);
      if (status && status !== "all") qp.append("status", status);

      const { data } = await apiClient.get(`/users/employees?${qp.toString()}`);

      // Handle both formats (if API returns raw array or paginated object)
      if (Array.isArray(data)) {
        // If it's a raw array, we simulate server-side pagination client-side
        // so the UI remains consistent while the backend is being updated.
        const filteredData = data.filter(e => {
          const matchesSearch = !search ||
            e.name?.toLowerCase().includes(search.toLowerCase()) ||
            e.phone?.includes(search);
          const matchesDept = departmentId === "all" || e.departmentId === departmentId || (e.departmentId as any)?._id === departmentId;
          const matchesShift = shiftId === "all" ||
            e.shiftId === shiftId ||
            (e.shiftId as any)?._id === shiftId ||
            (e.shiftIds || []).some((s: any) => (s?._id || s) === shiftId);
          const matchesStatus = status === "all" || e.status === status;
          return matchesSearch && matchesDept && matchesShift && matchesStatus;
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

  const createMutation = useMutation({
    mutationFn: async (formData: FormData | Partial<Employee>) => {
      const { data } = await apiClient.post("/users/employees", formData);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      toast.success("Employee created successfully");
    },
    onError: (error: any) => {
      console.error("Create employee failed:", error.response?.data ?? error);
      toast.error(extractErrorMessage(error, "Failed to create employee"));
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: FormData | Partial<Employee> }) => {
      const { data: response } = await apiClient.put(`/users/employees/${id}`, data);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      toast.success("Employee updated successfully");
    },
    onError: (error: any) => {
      console.error("Update employee failed:", error.response?.data ?? error);
      toast.error(extractErrorMessage(error, "Failed to update employee"));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await apiClient.delete(`/users/employees/${id}`);
      return data;
    },
    onSuccess: () => {
      // Invalidate all related queries so UI updates dynamically
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
      queryClient.invalidateQueries({ queryKey: ["salary"] });
      queryClient.invalidateQueries({ queryKey: ["leaves"] });
      queryClient.invalidateQueries({ queryKey: ["user-tickets"] });
      toast.success("Employee deleted successfully");
    },
  });

  return {
    employees: data?.employees || [],
    totalPages: data?.totalPages || 1,
    totalRecords: data?.totalRecords || 0,
    isLoading,
    isFetching,
    createEmployee: createMutation.mutateAsync,
    updateEmployee: updateMutation.mutateAsync,
    deleteEmployee: deleteMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
  };
}
