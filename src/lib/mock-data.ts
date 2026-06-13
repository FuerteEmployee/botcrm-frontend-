// Mock data store for the HRMS demo. Centralized so different routes share types.

export type EmployeeStatus = "active" | "inactive";
export type RequestStatus = "pending" | "approved" | "rejected";

export interface Department {
  id: string;
  name: string;
  color: string;
  employees: number;
  createdAt: string;
}

export interface Branch {
  id: string;
  branchName: string;
  branchLocation: string;
  employees: number;
  latitude: number;
  longitude: number;
  createdAt: string;
}

export interface Employee {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  departmentId: string;
  branchId: string;
  status: EmployeeStatus;
  joinedAt: string;
  avatar?: string;
  salary: number;
  shift: string;
  bloodGroup?: string;
  address?: string;
  dob?: string;
  doj?: string;
  bankDetails?: {
    accountNumber: string;
    bankName: string;
    ifsc: string;
    branchName?: string;
    nameAsPerBank?: string;
  };
  contactPersonName?: string;
  contactPersonMobile?: string;
  aadhaarNo?: string;
  panNo?: string;
  experience?: string;
  residentialAddress?: string;
  residentialPhone?: string;
  education?: string;
}

export interface AttendanceTicket {
  id: string;
  employeeId: string;
  employeeName: string;
  type: "punch_in" | "punch_out";
  date: string;
  requestedTime: string;
  reason: string;
  status: RequestStatus;
  remarks?: string;
}

export interface Shift {
  id: string;
  name: string;
  start: string;
  end: string;
  assigned: number;
}

export interface SalaryRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  month: string;
  base: number;
  bonus: number;
  deduction: number;
  net: number;
  status: "paid" | "pending";
}

export interface TrackedEmployee {
  id: string;
  name: string;
  online: boolean;
  lastSeen: string;
  location: { lat: number; lng: number; label: string };
}

export interface Lead {
  id: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  source: string;
  status: "new" | "contacted" | "qualified" | "lost" | "won";
  assignedTo: string;
  createdAt: string;
}

export interface Asset {
  id: string;
  employeeId: string;
  employeeName: string;
  deviceType: string;
  brand: string;
  model: string;
  amount: number;
  deviceName: string;
  deviceInfo: string;
  serialNumber: string;
  allocatedAt: string;
  status: "active" | "returned" | "damaged";
  deviceImage?: string;
}

export interface Expense {
  id: string;
  employeeId: string;
  employeeName: string;
  category: string;
  amount: number;
  date: string;
  description: string;
  status: "pending" | "approved" | "rejected";
  receipt?: string;
}

export interface AttendanceLog {
  id: string;
  employeeId: string;
  date: string;
  punchIn: string;
  punchOut: string;
  lunchIn?: string;
  lunchOut?: string;
  status: "present" | "absent" | "half-day" | "wfh";
  workHours: string;
  loginAddress?: string;
  logoutAddress?: string;
  lunchInAddress?: string;
  lunchOutAddress?: string;
  loginSelfie?: string;
  logoutSelfie?: string;
}

export const departments: Department[] = [
  { id: "d1", name: "Engineering", color: "#6366f1", employees: 42, createdAt: "2023-02-14" },
  { id: "d2", name: "Human Resources", color: "#ec4899", employees: 8, createdAt: "2022-08-01" },
  { id: "d3", name: "Sales", color: "#f59e0b", employees: 24, createdAt: "2022-11-20" },
  { id: "d4", name: "Marketing", color: "#10b981", employees: 12, createdAt: "2023-04-10" },
  { id: "d5", name: "Finance", color: "#8b5cf6", employees: 9, createdAt: "2023-01-05" },
  { id: "d6", name: "Operations", color: "#06b6d4", employees: 18, createdAt: "2023-06-22" },
];

export const branches: Branch[] = [
  { id: "b1", branchName: "HQ Mumbai", branchLocation: "Bandra Kurla Complex, Mumbai", employees: 64, latitude: 19.0760, longitude: 72.8777, createdAt: "2024-12-16T10:26:57" },
  { id: "b2", branchName: "Bangalore Tech", branchLocation: "Whitefield, Bangalore", employees: 38, latitude: 12.9716, longitude: 77.5946, createdAt: "2024-12-17T11:30:00" },
  { id: "b3", branchName: "Delhi Sales", branchLocation: "Connaught Place, New Delhi", employees: 22, latitude: 28.6139, longitude: 77.2090, createdAt: "2024-12-18T09:15:00" },
  { id: "b4", branchName: "Pune Office", branchLocation: "Hinjewadi, Pune", employees: 16, latitude: 18.5204, longitude: 73.8567, createdAt: "2024-12-19T14:45:00" },
];

const firstNames = ["Aarav","Priya","Rohan","Neha","Vikram","Ananya","Sneha","Karan","Arjun","Isha","Riya","Aditya","Tanvi","Manav","Pooja","Nikhil","Diya","Sahil","Meera","Rahul"];
const lastNames = ["Mehta","Sharma","Kapoor","Singh","Joshi","Iyer","Reddy","Patel","Gupta","Rao","Verma","Nair","Khan","Das","Bose","Pillai","Sen","Bhatt","Shah","Roy"];

function makeEmployees(): Employee[] {
  const list: Employee[] = [];
  for (let i = 0; i < 28; i++) {
    const fn = firstNames[i % firstNames.length];
    const ln = lastNames[(i * 3) % lastNames.length];
    const dept = departments[i % departments.length];
    const branch = branches[i % branches.length];
    list.push({
      id: `e${i + 1}`,
      name: `${fn} ${ln}`,
      email: `${fn.toLowerCase()}.${ln.toLowerCase()}@beontime.in`,
      phone: `+91 9${(800000000 + i * 13571).toString().slice(0, 9)}`,
      role: ["Engineer","Manager","Designer","Analyst","Executive","Lead"][i % 6],
      departmentId: dept.id,
      branchId: branch.id,
      status: i % 9 === 0 ? "inactive" : "active",
      joinedAt: `202${2 + (i % 3)}-0${(i % 9) + 1}-1${i % 9}`,
      salary: 35000 + (i % 8) * 7500,
      shift: ["Morning","General","Evening","Night"][i % 4],
      bloodGroup: ["A+","B+","O+","AB+","A-","B-"][i % 6],
      address: `${["Bandra West","BKC","Indiranagar","Hinjewadi","CP"][i % 5]}, Mumbai`,
      dob: `19${80 + (i % 20)}-0${(i % 9) + 1}-1${i % 9}`,
      doj: `202${1 + (i % 3)}-0${(i % 9) + 1}-1${i % 9}`,
      bankDetails: {
        accountNumber: `9120100${45678912 + i}`,
        bankName: ["HDFC Bank", "ICICI Bank", "Axis Bank", "SBI"][i % 4],
        ifsc: ["HDFC0000123", "ICIC0000567", "UTIB0000111", "SBIN0000222"][i % 4],
        branchName: ["Bandra kurla complex", "Whitefield", "CP Delhi", "Hinjewadi"][i % 4],
        nameAsPerBank: `${fn} ${ln}`.toUpperCase(),
      },
      contactPersonName: `Emergency Contact ${i + 1}`,
      contactPersonMobile: `+91 9${(700000000 + i * 12345).toString().slice(0, 9)}`,
      aadhaarNo: i % 3 === 0 ? undefined : `${4567 + i} ${8901 + i} ${2345 + i}`,
      panNo: i % 4 === 0 ? undefined : `ABCDE${1234 + i}F`,
      experience: `${(i % 5) + 1} Years`,
      residentialAddress: `${["Andheri East","Powai","Indiranagar","Pune","Noida"][i % 5]}, India`,
      residentialPhone: i % 5 === 0 ? undefined : `+91 22 2${(8000000 + i).toString().slice(0, 7)}`,
      education: ["Bachelor of Engineering", "Master of Business", "High School", "Bachelor of Arts"][i % 4],
    });
  }
  return list;
}

export const employees: Employee[] = makeEmployees();

export const tickets: AttendanceTicket[] = employees.slice(0, 12).map((e, i) => ({
  id: `t${i + 1}`,
  employeeId: e.id,
  employeeName: e.name,
  type: i % 2 === 0 ? "punch_in" : "punch_out",
  date: `2025-04-${String((i % 22) + 1).padStart(2, "0")}`,
  requestedTime: i % 2 === 0 ? "09:32" : "18:45",
  reason: ["Forgot to punch","Network issue","System down","On client visit","Late metro"][i % 5],
  status: (["pending","approved","rejected"] as RequestStatus[])[i % 3],
  remarks: i % 3 === 1 ? "Verified via team lead" : undefined,
}));

export const attendanceLogs: AttendanceLog[] = [
  { 
    id: "al1", 
    employeeId: "e1", 
    date: "2025-04-25", 
    punchIn: "09:16 AM", 
    punchOut: "--", 
    lunchIn: "02:53 PM", 
    lunchOut: "03:53 PM", 
    status: "present", 
    workHours: "00h 00m",
    loginAddress: "Office 404, 150 Feet Ring Road, Dharam Nagar Society, Rajkot, 360006",
    logoutAddress: "The Spire - 1, Dharam Nagar Society, Rajkot, 360006",
    lunchInAddress: "603, 150 Feet Ring Road, Dharam Nagar Society, Rajkot, 360006",
    lunchOutAddress: "703, 150 Feet Ring Road, Dharam Nagar Society, Rajkot, 360006",
    loginSelfie: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=400&fit=crop",
    logoutSelfie: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&h=400&fit=crop"
  },
  { 
    id: "al2", 
    employeeId: "e1", 
    date: "2025-04-24", 
    punchIn: "09:17 AM", 
    punchOut: "06:33 PM", 
    lunchIn: "01:30 PM", 
    lunchOut: "02:30 PM", 
    status: "present", 
    workHours: "09h 16m",
    loginAddress: "Main Gate, BKC Sector 3, Mumbai",
    logoutAddress: "Exit Gate 2, BKC Sector 3, Mumbai",
    lunchInAddress: "Food Court, BKC, Mumbai",
    lunchOutAddress: "Food Court, BKC, Mumbai"
  },
  { 
    id: "al3", 
    employeeId: "e1", 
    date: "2025-04-23", 
    punchIn: "09:27 AM", 
    punchOut: "06:44 PM", 
    lunchIn: "01:45 PM", 
    lunchOut: "02:45 PM", 
    workHours: "09h 17m",
    loginAddress: "Home Office, Bandra",
    logoutAddress: "Home Office, Bandra",
    status: "wfh"
  },
  { id: "al4", employeeId: "e1", date: "2025-04-22", punchIn: "09:23 AM", punchOut: "06:38 PM", status: "present", workHours: "09h 15m" },
  { id: "al5", employeeId: "e1", date: "2025-04-21", punchIn: "09:26 AM", punchOut: "06:33 PM", status: "present", workHours: "09h 06m" },
  { id: "al6", employeeId: "e1", date: "2025-04-20", punchIn: "11:00 AM", punchOut: "06:33 PM", status: "half-day", workHours: "07h 32m" },
  { id: "al7", employeeId: "e1", date: "2025-04-19", punchIn: "--", punchOut: "--", status: "absent", workHours: "00h 00m" },
];

export const shifts: Shift[] = [
  { id: "s1", name: "Morning", start: "06:00", end: "14:00", assigned: 18 },
  { id: "s2", name: "General", start: "09:30", end: "18:30", assigned: 64 },
  { id: "s3", name: "Evening", start: "14:00", end: "22:00", assigned: 22 },
  { id: "s4", name: "Night", start: "22:00", end: "06:00", assigned: 9 },
];

export const salaryRecords: SalaryRecord[] = employees.slice(0, 18).map((e, i) => {
  const bonus = i % 4 === 0 ? 5000 : 0;
  const deduction = i % 5 === 0 ? 1200 : 0;
  return {
    id: `sal${i + 1}`,
    employeeId: e.id,
    employeeName: e.name,
    month: "April 2025",
    base: e.salary,
    bonus,
    deduction,
    net: e.salary + bonus - deduction,
    status: i % 6 === 0 ? "pending" : "paid",
  };
});

export const trackedEmployees: TrackedEmployee[] = employees.slice(0, 10).map((e, i) => ({
  id: e.id,
  name: e.name,
  online: i % 3 !== 0,
  lastSeen: i % 3 === 0 ? "32 min ago" : "Just now",
  location: {
    lat: 19.07 + (i * 0.04),
    lng: 72.87 + (i * 0.05),
    label: ["BKC, Mumbai","Andheri East","Powai","Lower Parel","Worli","Bandra","Thane","Navi Mumbai","Vashi","Goregaon"][i],
  },
}));

export const leads: Lead[] = [
  { id: "l1", name: "John Doe", email: "john@example.com", phone: "+91 9876543210", company: "Tech Solutions", source: "Website", status: "new", assignedTo: "Aarav Mehta", createdAt: "2025-04-20" },
  { id: "l2", name: "Jane Smith", email: "jane@startup.io", phone: "+91 9876543211", company: "Innovate Inc", source: "Referral", status: "contacted", assignedTo: "Sneha Reddy", createdAt: "2025-04-21" },
  { id: "l3", name: "Mike Johnson", email: "mike@corp.com", phone: "+91 9876543212", company: "Global Corp", source: "LinkedIn", status: "qualified", assignedTo: "Rohan Kapoor", createdAt: "2025-04-19" },
  { id: "l4", name: "Sarah Williams", email: "sarah@design.com", phone: "+91 9876543213", company: "Creative Studio", source: "Website", status: "new", assignedTo: "Aarav Mehta", createdAt: "2025-04-22" },
  { id: "l5", name: "David Brown", email: "david@build.com", phone: "+91 9876543214", company: "Modern Builders", source: "Cold Call", status: "lost", assignedTo: "Karan Patel", createdAt: "2025-04-18" },
  { id: "l6", name: "Emily Davis", email: "emily@mark.com", phone: "+91 9876543215", company: "Marketing Hub", source: "Website", status: "won", assignedTo: "Sneha Reddy", createdAt: "2025-04-15" },
];

export const assets: Asset[] = [
  { id: "ast1", employeeId: "e1", employeeName: "Aarav Mehta", deviceType: "Laptop", brand: "Apple", model: "MacBook Pro M3", amount: 150000, deviceName: "MacBook Pro M3", deviceInfo: "16GB RAM, 512GB SSD, 14-inch", serialNumber: "MBP14M3X992", allocatedAt: "2024-01-15", status: "active" },
  { id: "ast2", employeeId: "e1", employeeName: "Aarav Mehta", deviceType: "Mobile", brand: "Apple", model: "iPhone 15 Pro", amount: 120000, deviceName: "iPhone 15 Pro", deviceInfo: "128GB, Blue Titanium", serialNumber: "IPH15P001", allocatedAt: "2024-01-15", status: "active" },
  { id: "ast3", employeeId: "e3", employeeName: "Rohan Kapoor", deviceType: "Laptop", brand: "Dell", model: "XPS 15", amount: 135000, deviceName: "Dell XPS 15", deviceInfo: "32GB RAM, 1TB SSD", serialNumber: "DXPS15-882", allocatedAt: "2023-11-20", status: "active" },
];

export const expenses: Expense[] = [
  { id: "exp1", employeeId: "e1", employeeName: "Aarav Mehta", category: "Tea/Coffee", amount: 1200, date: "2025-04-20", description: "Team evening snacks", status: "approved" },
  { id: "exp2", employeeId: "e3", employeeName: "Rohan Kapoor", category: "Travel", amount: 4500, date: "2025-04-22", description: "Client site visit petrol", status: "pending" },
  { id: "exp3", employeeId: "e4", employeeName: "Neha Sharma", category: "Cleaning & Maintenance", amount: 800, date: "2025-04-24", description: "Office floor cleaning", status: "approved" },
];

export const dashboardStats = {
  totalEmployees: employees.length,
  presentToday: 96,
  absentToday: 8,
  halfDayToday: 4,
  totalSalary: salaryRecords.reduce((s, r) => s + r.net, 0),
  totalExpenses: 412800,
  totalLeads: leads.length,
};

export const attendanceTrend = [
  { day: "Mon", present: 102, absent: 6 },
  { day: "Tue", present: 98, absent: 10 },
  { day: "Wed", present: 105, absent: 3 },
  { day: "Thu", present: 96, absent: 12 },
  { day: "Fri", present: 100, absent: 8 },
  { day: "Sat", present: 64, absent: 44 },
  { day: "Sun", present: 12, absent: 96 },
];

export const salaryDistribution = [
  { name: "Engineering", value: 420000 },
  { name: "Sales", value: 240000 },
  { name: "Marketing", value: 120000 },
  { name: "HR", value: 80000 },
  { name: "Operations", value: 180000 },
];

export const departmentHeadcount = departments.map((d) => ({ name: d.name, value: d.employees }));

export interface LeaveType {
  id: string;
  name: string;
  code: string;
  icon: string;
  color: string;
  description: string;
  totalDays: number;
}

export const leaveTypes: LeaveType[] = [
  { id: "l1", name: "Casual Leave", code: "CL", icon: "Calendar", color: "text-blue-600 bg-blue-50 border-blue-200", description: "Standard personal leave for casual needs.", totalDays: 12 },
  { id: "l2", name: "Sick Leave", code: "SL", icon: "HeartPulse", color: "text-red-600 bg-red-50 border-red-200", description: "Leave for medical emergencies and illness.", totalDays: 8 },
  { id: "l3", name: "Personal Leave", code: "PL", icon: "User", color: "text-purple-600 bg-purple-50 border-purple-200", description: "Leave for private matters and family obligations.", totalDays: 15 },
  { id: "l4", name: "Maternity Leave", code: "ML", icon: "Baby", color: "text-pink-600 bg-pink-50 border-pink-200", description: "Paid leave for expectant mothers.", totalDays: 180 },
  { id: "l5", name: "Paternity Leave", code: "PAT", icon: "Heart", color: "text-indigo-600 bg-indigo-50 border-indigo-200", description: "Paid leave for new fathers.", totalDays: 15 },
];

export function getEmployeeById(id: string) {
  return employees.find((e) => e.id === id);
}

export function getDepartmentName(id: string) {
  return departments.find((d) => d.id === id)?.name ?? "—";
}

export function getBranchName(id: string) {
  return branches.find((b) => b.id === id)?.branchName ?? "—";
}
