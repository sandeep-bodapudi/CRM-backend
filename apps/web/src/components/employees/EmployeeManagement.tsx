import React, { useState, useEffect } from 'react';
import {
  Users,
  UserPlus,
  Search,
  Filter,
  ShieldCheck,
  Building,
  Key,
  QrCode,
  Edit2,
  CheckCircle2,
  AlertCircle,
  X,
  Sparkles,
  Lock,
  RefreshCw,
  Printer,
  ShieldAlert,
  Phone,
  Mail,
  MapPin,
  Briefcase,
  DollarSign,
  CreditCard,
  Heart,
  GraduationCap,
  Calendar,
  FileText,
  User,
  ChevronRight,
  Eye,
  EyeOff,
  LogOut,
  TrendingUp,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config';
import { QRCodeVisual } from '../common/QRCodeVisual';
import { AddEmployeeWizard } from './AddEmployeeWizard';
import { EditEmployeeModal } from './EditEmployeeModal';
import { DataTable, ColumnDef } from '../ui/DataTable';
import {
  maskPAN,
  maskAadhaar,
  maskBankAccount,
  formatSalaryRange,
  formatExactSalary,
} from '../../utils/maskSensitiveData';

interface Employee {
  id: number;
  employeeCode: string;
  fullName: string;
  branchId: number;
  branch: string;
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'RESIGNED';
  attendanceRequired: boolean;
  firstLoginDone: boolean;
  roles: string[];
  accessibleCompanyIds?: number[];
  createdAt: string;

  // Industrial Details
  phone: string;
  secondaryPhone: string;
  whatsappNumber: string;
  email: string;
  bloodGroup: string;
  socialLinks: string;
  currentAddress: string;
  permanentAddress: string;
  emergencyContactName: string;
  emergencyContactRelation: string;
  emergencyContactPhone: string;
  panNumber: string;
  aadhaarNumber: string;
  bankName: string;
  bankAccountNumber: string;
  bankIfsc: string;
  bankBranch: string;
  jobTitle: string;
  department: string;
  employmentType: string;
  reportRequired: boolean;
  reportingManagerId: number | null;
  dateOfJoining: string;
  salaryCtc: number;
  backgroundEducation: string;
}

interface Branch {
  id: number;
  name: string;
}

interface ManagerOption {
  id: number;
  label: string;
}

export const EmployeeManagement: React.FC = () => {
  const { fetchWithAuth } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [managers, setManagers] = useState<ManagerOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [branchFilter, setBranchFilter] = useState('ALL');
  const [roleFilter, setRoleFilter] = useState('ALL');

  // Modals & Dossier Drawer
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showSensitive, setShowSensitive] = useState(false);
  const [addStep, setAddStep] = useState<1 | 2 | 3 | 4>(1);
  const [dossierEmp, setDossierEmp] = useState<Employee | null>(null);
  const [qrBadgeEmp, setQrBadgeEmp] = useState<Employee | null>(null);
  const [qrToken, setQrToken] = useState<string | null>(null);
  const [resetPwdEmp, setResetPwdEmp] = useState<Employee | null>(null);

  // Employee lifecycle actions (resign / promote / convert employment type) --
  // operate on whichever employee the dossier modal is currently showing.
  const [lifecycleAction, setLifecycleAction] = useState<'resign' | 'promote' | 'convert' | null>(
    null,
  );
  const [resignLastDay, setResignLastDay] = useState('');
  const [resignReason, setResignReason] = useState('');
  const [promoteJobTitle, setPromoteJobTitle] = useState('');
  const [promoteSalary, setPromoteSalary] = useState('');
  const [promoteReason, setPromoteReason] = useState('');
  const [convertType, setConvertType] = useState<'FULL_TIME' | 'PART_TIME' | 'CONTRACT' | 'INTERN'>(
    'FULL_TIME',
  );

  const handleViewQr = async (emp: Employee) => {
    setQrBadgeEmp(emp);
    setQrToken(null);
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/attendance/employee-qr/${emp.id}`);
      const data = await res.json();
      if (res.ok) {
        setQrToken(data.qrData || data.signedToken || data.token);
      }
    } catch (error) {
      console.error('Failed to load employee QR', error);
    }
  };

  // Employment Details
  // 20 Employment Form Fields State
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [secondaryPhone, setSecondaryPhone] = useState('');
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [email, setEmail] = useState('');
  const [bloodGroup, setBloodGroup] = useState('O+');
  const [socialLinks, setSocialLinks] = useState('');

  const [currentAddress, setCurrentAddress] = useState('');
  const [permanentAddress, setPermanentAddress] = useState('');
  const [emergencyContactName, setEmergencyContactName] = useState('');
  const [emergencyContactRelation, setEmergencyContactRelation] = useState('');
  const [emergencyContactPhone, setEmergencyContactPhone] = useState('');

  const [panNumber, setPanNumber] = useState('');
  const [aadhaarNumber, setAadhaarNumber] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankAccountNumber, setBankAccountNumber] = useState('');
  const [bankIfsc, setBankIfsc] = useState('');
  const [bankBranch, setBankBranch] = useState('');

  const [jobTitle, setJobTitle] = useState('');
  const [department, setDepartment] = useState('Sales & Leads');
  const [employmentType, setEmploymentType] = useState('FULL_TIME');
  const [reportRequired, setReportRequired] = useState(true);
  const [addRole, setAddRole] = useState('Telecaller');
  const [addBranchId, setAddBranchId] = useState<string>('');
  const [reportingManagerId, setReportingManagerId] = useState<string>('');
  const [dateOfJoining, setDateOfJoining] = useState(new Date().toISOString().split('T')[0]);
  const [salaryCtc, setSalaryCtc] = useState('35000');
  const [backgroundEducation, setBackgroundEducation] = useState('');
  const [initialPassword, setInitialPassword] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fetchEmployeesAndMetadata = async () => {
    setIsLoading(true);
    try {
      const [empRes, branchRes, mgrRes] = await Promise.all([
        // Explicit high limit — the backend defaults to 20, which silently
        // hid every employee past the 20th (not searchable, not filterable,
        // not editable — this page has no pagination UI at all) for any
        // company with more than 20 staff. Found via the Phase 10 manual QA
        // pass: an HR account for a 214-employee company saw "Total Staff: 20".
        fetchWithAuth(`${API_BASE_URL}/employees?limit=1000`),
        fetchWithAuth(`${API_BASE_URL}/employees/branches`),
        fetchWithAuth(`${API_BASE_URL}/employees/managers`),
      ]);

      if (empRes.ok) {
        const empData = await empRes.json();
        setEmployees(empData.employees || []);
        if (empData.pagination?.total > (empData.employees || []).length) {
          // Still more than the 1000 cap covers — surfacing this rather than
          // silently under-counting again like the original bug.
          console.warn(
            `Employee directory: ${empData.pagination.total} employees exist but only ${empData.employees.length} were loaded.`,
          );
        }
      }
      if (branchRes.ok) {
        const bData = await branchRes.json();
        setBranches(bData.branches || []);
        if (bData.branches?.length > 0) {
          setAddBranchId(String(bData.branches[0].id));
        }
      }
      if (mgrRes.ok) {
        const mData = await mgrRes.json();
        setManagers(mData.managers || []);
      }
    } catch (e) {
      console.error('Failed to load employee directory');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployeesAndMetadata();
  }, []);

  const resetForm = () => {
    setAddStep(1);
    setFullName('');
    setPhone('');
    setSecondaryPhone('');
    setWhatsappNumber('');
    setEmail('');
    setBloodGroup('O+');
    setSocialLinks('');
    setCurrentAddress('');
    setPermanentAddress('');
    setEmergencyContactName('');
    setEmergencyContactRelation('');
    setEmergencyContactPhone('');
    setPanNumber('');
    setAadhaarNumber('');
    setBankName('');
    setBankAccountNumber('');
    setBankIfsc('');
    setBankBranch('');
    setJobTitle('');
    setDepartment('Sales & Leads');
    setEmploymentType('FULL_TIME');
    setReportRequired(true);
    setAddRole('Telecaller');
    setReportingManagerId('');
    setDateOfJoining(new Date().toISOString().split('T')[0]);
    setSalaryCtc('35000');
    setBackgroundEducation('');
    setInitialPassword('');
    setModalError(null);
  };

  const handleAddEmployeeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);

    if (!fullName || !phone) {
      setModalError('Full Name and Primary Phone Number are required fields.');
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/employees`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: fullName,
          phone,
          secondary_phone: secondaryPhone,
          whatsapp_number: whatsappNumber || phone,
          email,
          blood_group: bloodGroup,
          social_links: socialLinks,
          current_address: currentAddress,
          permanent_address: permanentAddress || currentAddress,
          emergency_contact_name: emergencyContactName,
          emergency_contact_relation: emergencyContactRelation,
          emergency_contact_phone: emergencyContactPhone,
          pan_number: panNumber,
          aadhaar_number: aadhaarNumber,
          bank_name: bankName,
          bank_account_number: bankAccountNumber,
          bank_ifsc: bankIfsc,
          bank_branch: bankBranch,
          job_title: jobTitle || addRole,
          department,
          employment_type: employmentType,
          report_required: reportRequired,
          role_name: addRole,
          branch_id: addBranchId,
          reporting_manager_id: reportingManagerId,
          date_of_joining: dateOfJoining,
          salary_ctc: salaryCtc,
          background_education: backgroundEducation,
          initial_password: initialPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add employee');

      setSuccessMessage(
        `Employee ${data.employee.fullName} (${data.employee.employeeCode}) onboarded successfully!`,
      );
      setShowAddModal(false);
      resetForm();
      fetchEmployeesAndMetadata();
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setModalError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetPassword = async () => {
    if (!resetPwdEmp) return;
    setIsSubmitting(true);

    try {
      const res = await fetchWithAuth(
        `${API_BASE_URL}/employees/${resetPwdEmp.id}/reset-password`,
        {
          method: 'POST',
        },
      );
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setSuccessMessage(
          `Password for ${resetPwdEmp.fullName} reset. Temporary password: ${data.temporaryPassword} — share this with them directly, it won't be shown again.`,
        );
        setResetPwdEmp(null);
      }
    } catch (e) {
      alert('Failed to reset password');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResign = async () => {
    if (!dossierEmp) return;
    setIsSubmitting(true);
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/employees/${dossierEmp.id}/resign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          last_working_day: resignLastDay || undefined,
          reason: resignReason || undefined,
        }),
      });
      if (res.ok) {
        setSuccessMessage(`${dossierEmp.fullName} has been marked as resigned.`);
        setLifecycleAction(null);
        setResignLastDay('');
        setResignReason('');
        setDossierEmp(null);
        fetchEmployeesAndMetadata();
        setTimeout(() => setSuccessMessage(null), 4000);
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to record resignation');
      }
    } catch (e) {
      alert('Failed to record resignation');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePromote = async () => {
    if (!dossierEmp) return;
    if (!promoteJobTitle && !promoteSalary) {
      alert('Provide a new job title and/or salary.');
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/employees/${dossierEmp.id}/promote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_title: promoteJobTitle || undefined,
          salary_ctc: promoteSalary || undefined,
          reason: promoteReason || undefined,
        }),
      });
      if (res.ok) {
        setSuccessMessage(`${dossierEmp.fullName} has been promoted.`);
        setLifecycleAction(null);
        setPromoteJobTitle('');
        setPromoteSalary('');
        setPromoteReason('');
        setDossierEmp(null);
        fetchEmployeesAndMetadata();
        setTimeout(() => setSuccessMessage(null), 4000);
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to promote employee');
      }
    } catch (e) {
      alert('Failed to promote employee');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConvertEmploymentType = async () => {
    if (!dossierEmp) return;
    setIsSubmitting(true);
    try {
      const res = await fetchWithAuth(
        `${API_BASE_URL}/employees/${dossierEmp.id}/convert-employment-type`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ employment_type: convertType }),
        },
      );
      if (res.ok) {
        setSuccessMessage(
          `${dossierEmp.fullName}'s employment type is now ${convertType.replace('_', ' ')}.`,
        );
        setLifecycleAction(null);
        setDossierEmp(null);
        fetchEmployeesAndMetadata();
        setTimeout(() => setSuccessMessage(null), 4000);
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to convert employment type');
      }
    } catch (e) {
      alert('Failed to convert employment type');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredEmployees = employees.filter((emp) => {
    const matchesSearch =
      emp.employeeCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
      emp.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      emp.phone.toLowerCase().includes(searchQuery.toLowerCase()) ||
      emp.branch.toLowerCase().includes(searchQuery.toLowerCase()) ||
      emp.roles.some((r) => r.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesBranch = branchFilter === 'ALL' || String(emp.branchId) === branchFilter;
    const matchesRole = roleFilter === 'ALL' || emp.roles.includes(roleFilter);

    return matchesSearch && matchesBranch && matchesRole;
  });

  const totalActive = employees.filter((e) => e.status === 'ACTIVE').length;
  const totalExempt = employees.filter((e) => !e.attendanceRequired).length;

  return (
    <div className="space-y-6">
      {/* Top Banner & Stats Overview */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-navy-50 text-navy-700 flex items-center justify-center shadow-inner border border-navy-100">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800">Employee Directory & Details</h2>
              <p className="text-xs text-slate-500">Employee & HR Management</p>
            </div>
          </div>

          <button
            onClick={() => {
              resetForm();
              setShowAddModal(true);
            }}
            className="py-3 px-5 bg-navy-700 hover:bg-navy-800 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center gap-2"
          >
            <UserPlus className="w-4 h-4" />
            <span>Onboard New Employee</span>
          </button>
        </div>

        {/* Global Success Notification Banner */}
        {successMessage && (
          <div className="p-3.5 bg-emerald-50 text-emerald-800 text-xs rounded-xl border border-emerald-200 flex items-center justify-between animate-fadeIn">
            <div className="flex items-center gap-2 font-medium">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMessage}</span>
            </div>
            <button
              onClick={() => setSuccessMessage(null)}
              className="text-emerald-600 hover:text-emerald-900"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Stat Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/60">
            <span className="text-[11px] text-slate-400 font-semibold uppercase">Total Staff</span>
            <p className="text-2xl font-extrabold text-slate-800 font-mono mt-0.5">
              {employees.length}
            </p>
          </div>

          <div className="p-3.5 bg-emerald-50 rounded-xl border border-emerald-200/60">
            <span className="text-[11px] text-emerald-700 font-semibold uppercase">
              Active Roster
            </span>
            <p className="text-2xl font-extrabold text-emerald-800 font-mono mt-0.5">
              {totalActive}
            </p>
          </div>

          <div className="p-3.5 bg-amber-50 rounded-xl border border-amber-200/60">
            <span className="text-[11px] text-amber-700 font-semibold uppercase">
              QR Exempted Staff
            </span>
            <p className="text-2xl font-extrabold text-amber-800 font-mono mt-0.5">{totalExempt}</p>
          </div>

          <div className="p-3.5 bg-navy-50 rounded-xl border border-navy-200/60">
            <span className="text-[11px] text-navy-700 font-semibold uppercase">
              Active Branches
            </span>
            <p className="text-2xl font-extrabold text-navy-800 font-mono mt-0.5">
              {branches.length}
            </p>
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-card flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by Employee ID, Name, Phone, Branch, or Role..."
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-navy-600 font-medium"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <select
            value={branchFilter}
            onChange={(e) => setBranchFilter(e.target.value)}
            className="py-2.5 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-navy-600"
          >
            <option value="ALL">All Branches</option>
            {branches.map((b) => (
              <option key={b.id} value={String(b.id)}>
                {b.name}
              </option>
            ))}
          </select>

          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="py-2.5 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-navy-600"
          >
            <option value="ALL">All Roles</option>
            <option value="MD">Managing Director (MD)</option>
            <option value="HR Manager">HR Manager</option>
            <option value="Telecaller">Telecaller</option>
            <option value="Digital Lead Operator">Digital Marketing</option>
            <option value="Project Manager">Operations / Project Manager</option>
            <option value="Finance">Finance</option>
            <option value="Channel partner manager">Channel Partner Manager</option>
          </select>
        </div>
      </div>

      {/* Main Employee Table */}
      {isLoading ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-12 text-center text-xs text-slate-400 space-y-2">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto text-navy-600" />
          <p>Loading Employee Details.</p>
        </div>
      ) : (
        <DataTable<Employee>
          columns={[
            {
              key: 'employeeCode',
              header: 'Employee ID & Name',
              render: (emp) => (
                <>
                  <div className="font-mono font-bold text-navy-900">{emp.employeeCode}</div>
                  <div className="font-bold text-slate-800 text-sm">{emp.fullName}</div>
                </>
              ),
            },
            {
              key: 'jobTitle',
              header: 'Official Title & Dept',
              render: (emp) => (
                <>
                  <div className="font-bold text-slate-800">{emp.jobTitle}</div>
                  <div className="text-[11px] text-slate-500">{emp.department}</div>
                </>
              ),
            },
            {
              key: 'phone',
              header: 'Contact Info',
              render: (emp) => (
                <>
                  <div className="flex items-center gap-1 text-slate-700">
                    <Phone className="w-3 h-3 text-slate-400" />
                    <span>{emp.phone}</span>
                  </div>
                  <div className="text-[11px] text-slate-400">{emp.email}</div>
                </>
              ),
            },
            {
              key: 'branch',
              header: 'Branch Location',
              render: (emp) => (
                <div className="flex items-center gap-1.5 text-slate-600">
                  <Building className="w-3.5 h-3.5 text-slate-400" />
                  <span>{emp.branch}</span>
                </div>
              ),
            },
            {
              key: 'status',
              header: 'Status',
              render: (emp) => (
                <span
                  className={`px-2.5 py-0.5 rounded-full font-bold text-[10px] ${
                    emp.status === 'ACTIVE'
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                      : emp.status === 'RESIGNED'
                        ? 'bg-slate-200 text-slate-700 border border-slate-300'
                        : 'bg-red-100 text-red-800 border border-red-200'
                  }`}
                >
                  {emp.status}
                </span>
              ),
            },
            {
              key: 'actions',
              header: '',
              render: (emp) => (
                <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => setDossierEmp(emp)}
                    className="p-1.5 text-slate-600 hover:text-navy-800 hover:bg-navy-50 rounded-lg transition-colors border border-slate-200"
                    title="View Employee Details"
                  >
                    <Eye className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => handleViewQr(emp)}
                    className="p-1.5 text-slate-600 hover:text-navy-800 hover:bg-navy-50 rounded-lg transition-colors border border-slate-200"
                    title="View & Print Visual 2D QR ID Badge"
                  >
                    <QrCode className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => setResetPwdEmp(emp)}
                    className="p-1.5 text-slate-600 hover:text-amber-700 hover:bg-amber-50 rounded-lg transition-colors border border-slate-200"
                    title="Reset Password to Default"
                  >
                    <Key className="w-4 h-4" />
                  </button>
                </div>
              ),
            },
          ]}
          data={filteredEmployees}
          onRowClick={(emp) => {
            setDossierEmp(emp);
            setShowSensitive(false);
          }}
          searchable={false}
          emptyMessage="No employees match your search filter criteria."
        />
      )}

      {showAddModal && (
        <AddEmployeeWizard
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {
            setShowAddModal(false);
            fetchEmployeesAndMetadata();
          }}
          branches={branches}
          managers={managers}
        />
      )}

      {/* FULL INDUSTRIAL EMPLOYEE DOSSIER VIEW MODAL */}
      {dossierEmp && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-3xl bg-white rounded-3xl shadow-xl border border-slate-100 flex flex-col max-h-[90vh] animate-scaleUp">
            {/* Sticky Header */}
            <div className="flex items-center justify-between border-b border-slate-100 p-6 pb-4 shrink-0 bg-white rounded-t-3xl z-10">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-navy-700 text-white font-bold text-lg flex items-center justify-center shadow-md">
                  {dossierEmp.employeeCode.split('-')[1] || 'EMP'}
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-800 text-xl">{dossierEmp.fullName}</h3>
                  <p className="text-xs text-slate-500 font-mono">
                    ID: {dossierEmp.employeeCode} • {dossierEmp.jobTitle} ({dossierEmp.department})
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowEditModal(true)}
                  className="p-1.5 text-slate-500 hover:text-navy-700 hover:bg-navy-50 rounded-lg transition-colors border border-transparent hover:border-navy-200"
                  title="Edit Employee Details"
                >
                  <Edit2 className="w-5 h-5" />
                </button>
                <span
                  className={`px-3 py-1 rounded-full font-bold text-xs ${
                    dossierEmp.status === 'ACTIVE'
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                      : dossierEmp.status === 'RESIGNED'
                        ? 'bg-slate-200 text-slate-700 border border-slate-300'
                        : 'bg-red-100 text-red-800 border border-red-200'
                  }`}
                >
                  {dossierEmp.status}
                </span>
                <button
                  onClick={() => setDossierEmp(null)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>

            {/* Scrollable Content */}
            <div className="p-6 pt-4 overflow-y-auto custom-scrollbar">
              <div className="space-y-4 text-xs">
                {/* Section 1: Contact & Personal */}
                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/80 space-y-3">
                  <h4 className="font-bold text-slate-700 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                    <User className="w-4 h-4 text-navy-700" />
                    <span>Personal & Contact Information</span>
                  </h4>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                        Primary Phone
                      </span>
                      <span className="font-bold text-slate-800">{dossierEmp.phone}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                        Official Email
                      </span>
                      <span className="font-bold text-slate-800">{dossierEmp.email}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                        Blood Group
                      </span>
                      <span className="font-bold text-slate-800">{dossierEmp.bloodGroup}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                        Secondary Phone
                      </span>
                      <span className="font-bold text-slate-800">
                        {dossierEmp.secondaryPhone || 'N/A'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                        WhatsApp
                      </span>
                      <span className="font-bold text-slate-800">
                        {dossierEmp.whatsappNumber || 'N/A'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                        Social Links
                      </span>
                      <span className="font-bold text-slate-800">
                        {dossierEmp.socialLinks || 'N/A'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Section 2: Addresses & Emergency */}
                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/80 space-y-3">
                  <h4 className="font-bold text-slate-700 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-navy-700" />
                    <span>Addresses & Emergency Contacts</span>
                  </h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                        Current Address
                      </span>
                      <span className="font-semibold text-slate-800">
                        {dossierEmp.currentAddress}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                        Permanent Address
                      </span>
                      <span className="font-semibold text-slate-800">
                        {dossierEmp.permanentAddress}
                      </span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-200/60 grid grid-cols-3 gap-3">
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                        Emergency Person
                      </span>
                      <span className="font-bold text-slate-800">
                        {dossierEmp.emergencyContactName}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                        Relationship
                      </span>
                      <span className="font-bold text-slate-800">
                        {dossierEmp.emergencyContactRelation}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                        Emergency Phone
                      </span>
                      <span className="font-bold text-slate-800">
                        {dossierEmp.emergencyContactPhone}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Section 3: Government KYC & Payroll Bank */}
                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/80 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-slate-700 uppercase tracking-wider text-[11px] flex items-center gap-1.5 m-0">
                      <CreditCard className="w-4 h-4 text-navy-700" />
                      <span>Government KYC & Payroll Bank Details</span>
                    </h4>
                    <button
                      onClick={() => setShowSensitive(!showSensitive)}
                      className="flex items-center gap-1.5 px-2 py-1 bg-white border border-slate-200 hover:bg-slate-100 text-slate-600 rounded-md transition-colors text-[10px] font-bold shadow-sm"
                    >
                      {showSensitive ? (
                        <EyeOff className="w-3.5 h-3.5" />
                      ) : (
                        <Eye className="w-3.5 h-3.5" />
                      )}
                      {showSensitive ? 'Hide Details' : 'Reveal Details'}
                    </button>
                  </div>
                  <div className="grid grid-cols-4 gap-3">
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                        PAN Number
                      </span>
                      <span className="font-mono font-bold text-slate-800">
                        {showSensitive
                          ? dossierEmp.panNumber || 'N/A'
                          : maskPAN(dossierEmp.panNumber)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                        Aadhaar UID
                      </span>
                      <span className="font-mono font-bold text-slate-800">
                        {showSensitive
                          ? dossierEmp.aadhaarNumber || 'N/A'
                          : maskAadhaar(dossierEmp.aadhaarNumber)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                        Bank Name
                      </span>
                      <span className="font-bold text-slate-800">
                        {dossierEmp.bankName || 'N/A'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                        Account Number
                      </span>
                      <span className="font-mono font-bold text-slate-800">
                        {showSensitive
                          ? dossierEmp.bankAccountNumber || 'N/A'
                          : maskBankAccount(dossierEmp.bankAccountNumber)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                        IFSC Code
                      </span>
                      <span className="font-mono font-bold text-slate-800">
                        {dossierEmp.bankIfsc || 'N/A'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                        Bank Branch
                      </span>
                      <span className="font-bold text-slate-800">{dossierEmp.bankBranch}</span>
                    </div>
                  </div>
                </div>

                {/* Section 4: Employment & Salary CTC */}
                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/80 space-y-3">
                  <h4 className="font-bold text-slate-700 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                    <Briefcase className="w-4 h-4 text-navy-700" />
                    <span>Employment Terms & Salary CTC</span>
                  </h4>
                  <div className="grid grid-cols-4 gap-3">
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                        Work Location
                      </span>
                      <span className="font-bold text-slate-800">{dossierEmp.branch}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                        Employment Type
                      </span>
                      <span className="font-bold text-slate-800">{dossierEmp.employmentType}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                        Date of Joining
                      </span>
                      <span className="font-bold text-slate-800">{dossierEmp.dateOfJoining}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                        Monthly Salary
                      </span>
                      <span className="font-mono font-extrabold text-navy-800 text-sm">
                        {formatSalaryRange(dossierEmp.salaryCtc)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                        Annual Salary
                      </span>
                      <span className="font-mono font-extrabold text-navy-800 text-sm">
                        {formatSalaryRange(
                          dossierEmp.salaryCtc ? dossierEmp.salaryCtc * 12 : dossierEmp.salaryCtc,
                        )}
                      </span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-200/60">
                    <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                      Background & Education
                    </span>
                    <span className="font-semibold text-slate-800">
                      {dossierEmp.backgroundEducation || 'N/A'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Sticky Footer */}
            <div className="p-6 pt-4 border-t border-slate-100 shrink-0 bg-white rounded-b-3xl flex flex-wrap justify-between items-center gap-2">
              <div className="flex flex-wrap gap-2">
                {dossierEmp.status !== 'RESIGNED' && (
                  <button
                    onClick={() => setLifecycleAction('resign')}
                    className="py-2.5 px-4 bg-red-50 hover:bg-red-100 text-red-700 font-bold text-xs rounded-xl flex items-center gap-1.5"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    Mark Resigned
                  </button>
                )}
                <button
                  onClick={() => setLifecycleAction('promote')}
                  className="py-2.5 px-4 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-xs rounded-xl flex items-center gap-1.5"
                >
                  <TrendingUp className="w-3.5 h-3.5" />
                  Promote
                </button>
                <button
                  onClick={() => {
                    setConvertType((dossierEmp.employmentType as any) || 'FULL_TIME');
                    setLifecycleAction('convert');
                  }}
                  className="py-2.5 px-4 bg-navy-50 hover:bg-navy-100 text-navy-700 font-bold text-xs rounded-xl flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Convert Employment Type
                </button>
              </div>
              <button
                onClick={() => setDossierEmp(null)}
                className="py-2.5 px-6 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-xl"
              >
                Close Details
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Resign / Promote / Convert Employment Type action modals */}
      {dossierEmp && lifecycleAction === 'resign' && (
        <div className="fixed inset-0 z-[60] bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-xl border border-slate-100 animate-scaleUp">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <span className="font-bold text-slate-800 text-sm">
                Mark {dossierEmp.fullName} as Resigned
              </span>
              <button
                onClick={() => setLifecycleAction(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                  Last Working Day (optional)
                </label>
                <input
                  type="date"
                  value={resignLastDay}
                  onChange={(e) => setResignLastDay(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy-500"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                  Reason (optional)
                </label>
                <textarea
                  value={resignReason}
                  onChange={(e) => setResignReason(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy-500"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setLifecycleAction(null)}
                  className="flex-1 py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl"
                >
                  Cancel
                </button>
                <button
                  onClick={handleResign}
                  disabled={isSubmitting}
                  className="flex-1 py-2.5 px-4 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl disabled:opacity-50"
                >
                  {isSubmitting ? 'Saving...' : 'Confirm Resignation'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {dossierEmp && lifecycleAction === 'promote' && (
        <div className="fixed inset-0 z-[60] bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-xl border border-slate-100 animate-scaleUp">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <span className="font-bold text-slate-800 text-sm">
                Promote {dossierEmp.fullName}
              </span>
              <button
                onClick={() => setLifecycleAction(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                  New Job Title
                </label>
                <input
                  type="text"
                  placeholder={dossierEmp.jobTitle}
                  value={promoteJobTitle}
                  onChange={(e) => setPromoteJobTitle(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy-500"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                  New Monthly Salary CTC (₹)
                </label>
                <input
                  type="number"
                  placeholder={String(dossierEmp.salaryCtc || '')}
                  value={promoteSalary}
                  onChange={(e) => setPromoteSalary(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy-500"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                  Reason (optional)
                </label>
                <textarea
                  value={promoteReason}
                  onChange={(e) => setPromoteReason(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy-500"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setLifecycleAction(null)}
                  className="flex-1 py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl"
                >
                  Cancel
                </button>
                <button
                  onClick={handlePromote}
                  disabled={isSubmitting}
                  className="flex-1 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl disabled:opacity-50"
                >
                  {isSubmitting ? 'Saving...' : 'Confirm Promotion'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {dossierEmp && lifecycleAction === 'convert' && (
        <div className="fixed inset-0 z-[60] bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-xl border border-slate-100 animate-scaleUp">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <span className="font-bold text-slate-800 text-sm">Convert Employment Type</span>
              <button
                onClick={() => setLifecycleAction(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                  New Employment Type
                </label>
                <select
                  value={convertType}
                  onChange={(e) => setConvertType(e.target.value as any)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy-500 bg-white"
                >
                  <option value="FULL_TIME">Full Time</option>
                  <option value="PART_TIME">Part Time</option>
                  <option value="CONTRACT">Contract</option>
                  <option value="INTERN">Intern</option>
                </select>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setLifecycleAction(null)}
                  className="flex-1 py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConvertEmploymentType}
                  disabled={isSubmitting}
                  className="flex-1 py-2.5 px-4 bg-navy-600 hover:bg-navy-700 text-white font-bold text-xs rounded-xl disabled:opacity-50"
                >
                  {isSubmitting ? 'Saving...' : 'Confirm Conversion'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Visual 2D QR Code Badge Modal */}
      {qrBadgeEmp && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-xl border border-slate-100 text-center animate-scaleUp">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <span className="font-bold text-slate-800 text-sm">Official Employee QR Badge</span>
              <button
                onClick={() => setQrBadgeEmp(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200 inline-block mb-3 min-h-[240px] flex items-center justify-center">
              {qrToken ? (
                <QRCodeVisual value={qrToken} size={200} label={qrBadgeEmp.employeeCode} />
              ) : (
                <div className="flex flex-col items-center text-slate-400 gap-2">
                  <div className="w-6 h-6 border-2 border-slate-300 border-t-navy-500 rounded-full animate-spin"></div>
                  <span className="text-xs">Generating secure token...</span>
                </div>
              )}
            </div>

            <p className="text-xs text-slate-500 font-medium mb-4">
              Permanent 2D QR badge for {qrBadgeEmp.fullName} ({qrBadgeEmp.employeeCode})
            </p>

            <button
              onClick={() => window.print()}
              className="w-full py-3 bg-navy-700 hover:bg-navy-800 text-white font-bold text-xs rounded-xl shadow-md flex items-center justify-center gap-2"
            >
              <Printer className="w-4 h-4" />
              <span>Print Official QR ID Badge</span>
            </button>
          </div>
        </div>
      )}

      {/* Reset Password Confirmation Dialog */}
      {resetPwdEmp && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-xl border border-slate-100 text-center animate-scaleUp">
            <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-slate-800 text-base">Reset Password?</h3>
            <p className="text-xs text-slate-500 mt-1 mb-4 leading-relaxed">
              Reset password for <strong>{resetPwdEmp.fullName}</strong> ({resetPwdEmp.employeeCode}
              )? A new random temporary password will be generated and shown to you once — share it
              with them directly.
            </p>

            <div className="flex gap-2">
              <button
                onClick={() => setResetPwdEmp(null)}
                className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleResetPassword}
                disabled={isSubmitting}
                className="flex-1 py-3 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl shadow-md"
              >
                Confirm Reset
              </button>
            </div>
          </div>
        </div>
      )}

      {showEditModal && dossierEmp && (
        <EditEmployeeModal
          employee={dossierEmp}
          onClose={() => setShowEditModal(false)}
          onSuccess={() => {
            setShowEditModal(false);
            setDossierEmp(null); // Force refresh of dossier or refetch
            fetchEmployeesAndMetadata();
          }}
          branches={branches}
          managers={managers}
        />
      )}
    </div>
  );
};
