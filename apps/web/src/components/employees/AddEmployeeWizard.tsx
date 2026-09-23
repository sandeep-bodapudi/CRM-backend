import React, { useState } from 'react';
import {
  Building2,
  User,
  Key,
  Users,
  ArrowRight,
  ArrowLeft,
  Building,
  MapPin,
  CheckCircle2,
  FileText,
  Phone,
  Mail,
  GraduationCap,
  DollarSign,
  CreditCard,
  Heart,
  X,
  ShieldAlert,
  CreditCardIcon,
  Briefcase,
  EyeOff,
  MessageCircle,
} from 'lucide-react';
import { PasswordInput } from '../ui/PasswordInput';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config';
import { useToast } from '../../context/ToastContext';
import { handleApiError, toUserFacingError } from '../../utils/userFacingError';
import { getPanFormatError, getAadhaarFormatError } from '../../utils/idValidation';

// Mirrors apps/api/src/shared/employee.ts's initial_password Zod schema
// exactly, so a weak password is caught here instead of failing late after
// the whole multi-step wizard is filled in.
const getPasswordRuleError = (pwd: string): string | null => {
  if (pwd.length < 8) return 'must be at least 8 characters long';
  if (!/[A-Z]/.test(pwd)) return 'must contain at least one uppercase letter';
  if (!/[a-z]/.test(pwd)) return 'must contain at least one lowercase letter';
  if (!/[0-9]/.test(pwd)) return 'must contain at least one number';
  if (!/[^A-Za-z0-9]/.test(pwd)) return 'must contain at least one special character';
  return null;
};

// A fresh random suggestion per employee — never a fixed, guessable default
// that every admin would otherwise leave unchanged for every new hire.
const generateSuggestedPassword = (): string => {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const special = '!@#$%&*';
  const all = upper + lower + digits + special;
  const pick = (charset: string) => charset[Math.floor(Math.random() * charset.length)];
  const required = [pick(upper), pick(lower), pick(digits), pick(special)];
  const rest = Array.from({ length: 8 }, () => pick(all));
  return [...required, ...rest].sort(() => Math.random() - 0.5).join('');
};

interface AddEmployeeWizardProps {
  onClose: () => void;
  onSuccess: () => void;
  branches: { id: number; name: string }[];
  managers: { id: number; label: string }[];
}

export const AddEmployeeWizard: React.FC<AddEmployeeWizardProps> = ({
  onClose,
  onSuccess,
  branches,
  managers,
}) => {
  const { fetchWithAuth } = useAuth();
  const { showToast, showError } = useToast();

  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [createdEmployeeCode, setCreatedEmployeeCode] = useState<string | null>(null);

  // Step 1: Basic & Login
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [addRole, setAddRole] = useState('telecallers');
  const [addBranchId, setAddBranchId] = useState<string>('');
  const [additionalBranchIds, setAdditionalBranchIds] = useState<string[]>([]);
  const [accessibleCompanyIds, setAccessibleCompanyIds] = useState<string[]>([]);
  const [initialPassword, setInitialPassword] = useState(generateSuggestedPassword);

  // Step 2: Personal Details
  const [currentAddress, setCurrentAddress] = useState('');
  const [permanentAddress, setPermanentAddress] = useState('');
  const [bloodGroup, setBloodGroup] = useState('O+');
  const [emergencyContactName, setEmergencyContactName] = useState('');
  const [emergencyContactRelation, setEmergencyContactRelation] = useState('');
  const [emergencyContactPhone, setEmergencyContactPhone] = useState('');
  const [panNumber, setPanNumber] = useState('');
  const [aadhaarNumber, setAadhaarNumber] = useState('');

  // Step 3: Professional Info
  const [jobTitle, setJobTitle] = useState('');
  const [department, setDepartment] = useState('Sales & Leads');
  const [employmentType, setEmploymentType] = useState('FULL_TIME');
  const [reportRequired, setReportRequired] = useState(true);
  const [reportingManagerId, setReportingManagerId] = useState<string>('');
  const [dateOfJoining, setDateOfJoining] = useState(new Date().toISOString().split('T')[0]);
  // The backend field `salary_ctc` is used as a MONTHLY figure everywhere
  // downstream (payroll notifications, dossier "Monthly Salary CTC" label) —
  // this form collects Annual Salary instead (per user request, since the
  // old "Annual CTC" label was misleading people into entering an annual
  // number that then got treated as monthly, a 12x salary error) and
  // converts to monthly right before submit.
  const [annualSalary, setAnnualSalary] = useState('420000');
  const monthlySalary = (parseFloat(annualSalary || '0') / 12).toFixed(2);
  const [backgroundEducation, setBackgroundEducation] = useState('');

  // Step 4: Banking Info
  const [bankName, setBankName] = useState('');
  const [bankAccountNumber, setBankAccountNumber] = useState('');
  const [bankIfsc, setBankIfsc] = useState('');
  const [bankBranch, setBankBranch] = useState('');

  const handleNext = () => setStep((s) => Math.min(s + 1, 5));
  const handleBack = () => setStep((s) => Math.max(s - 1, 1));

  const handleSubmit = async () => {
    if (!fullName || !phone || !addRole || !addBranchId) {
      showError({ message: 'Please fill all required basic details in Step 1' });
      return;
    }
    if (getPasswordRuleError(initialPassword)) {
      showError({ message: `Initial password: ${getPasswordRuleError(initialPassword)}` });
      return;
    }

    setIsLoading(true);
    try {
      const payload = {
        full_name: fullName,
        phone,
        email,
        role_name: addRole,
        branch_id: addBranchId,
        additional_branch_ids: additionalBranchIds,
        accessible_company_ids: accessibleCompanyIds,
        initial_password: initialPassword,

        current_address: currentAddress,
        permanent_address: permanentAddress,
        blood_group: bloodGroup,
        emergency_contact_name: emergencyContactName,
        emergency_contact_relation: emergencyContactRelation,
        emergency_contact_phone: emergencyContactPhone,
        pan_number: panNumber,
        aadhaar_number: aadhaarNumber,

        job_title: jobTitle,
        department,
        employment_type: employmentType,
        report_required: reportRequired,
        reporting_manager_id: reportingManagerId,
        date_of_joining: dateOfJoining,
        salary_ctc: monthlySalary,
        background_education: backgroundEducation,

        bank_name: bankName,
        bank_account_number: bankAccountNumber,
        bank_ifsc: bankIfsc,
        bank_branch: bankBranch,
      };

      const res = await fetchWithAuth(`${API_BASE_URL}/employees`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (res.ok) {
        setCreatedEmployeeCode(data.employee.employeeCode);
        setStep(6); // Move to Success screen
      } else {
        await handleApiError(res, showError, data);
      }
    } catch (e) {
      showError(
        toUserFacingError({ message: e instanceof Error ? e.message : String(e), body: e }),
      );
    } finally {
      setIsLoading(false);
    }
  };

  const renderStepIndicator = () => {
    const steps = ['Basic Info', 'Personal', 'Professional', 'Banking', 'Review'];
    return (
      <div className="flex flex-col gap-4 border-r border-slate-200 pr-6 hidden md:flex w-64 shrink-0">
        <h3 className="font-bold text-slate-800 text-lg mb-4">Onboard Employee</h3>
        {steps.map((s, i) => {
          const isActive = step === i + 1;
          const isPassed = step > i + 1;
          return (
            <div
              key={s}
              className={`flex items-center gap-3 ${isActive ? 'opacity-100' : 'opacity-40'}`}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 
                ${isActive ? 'border-navy-600 text-navy-700 bg-navy-50' : isPassed ? 'border-navy-500 bg-navy-500 text-white' : 'border-slate-300 text-slate-500'}
              `}
              >
                {isPassed ? <CheckCircle2 className="w-5 h-5" /> : i + 1}
              </div>
              <span
                className={`font-semibold text-sm ${isActive ? 'text-navy-900' : 'text-slate-600'}`}
              >
                {s}
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  const renderStepContent = () => {
    switch (step) {
      case 1:
        return (
          <div className="space-y-6 animate-fadeIn">
            <h2 className="text-2xl font-bold text-slate-800">Basic & Login Info</h2>
            <p className="text-slate-500 text-sm">
              Essential details to create the employee's CRM account.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="col-span-1 md:col-span-2">
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Full Legal Name *
                </label>
                <div className="relative">
                  <User className="w-5 h-5 absolute left-3 top-3 text-slate-400" />
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full p-3 pl-10 border border-slate-300 rounded-xl focus:ring-2 focus:ring-navy-500"
                    placeholder="Enter full legal name"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Primary Phone Number *
                </label>
                <div className="relative">
                  <Phone className="w-5 h-5 absolute left-3 top-3 text-slate-400" />
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full p-3 pl-10 border border-slate-300 rounded-xl focus:ring-2 focus:ring-navy-500"
                    placeholder="+91 9876543210"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Official Email Address
                </label>
                <div className="relative">
                  <Mail className="w-5 h-5 absolute left-3 top-3 text-slate-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full p-3 pl-10 border border-slate-300 rounded-xl focus:ring-2 focus:ring-navy-500"
                    placeholder="john.doe@radharealhomes.com"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">System Role *</label>
                <select
                  value={addRole}
                  onChange={(e) => setAddRole(e.target.value)}
                  className="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-navy-500"
                >
                  <option value="telecallers">telecallers</option>
                  <option value="Agent">Agent</option>
                  <option value="Sales manager">Sales manager</option>
                  <option value="digital marketing executive">digital marketing executive</option>
                  <option value="Digital lead operator">Digital lead operator</option>
                  <option value="Digital Marketing head(manager)">
                    Digital Marketing head(manager)
                  </option>
                  <option value="marketing director">marketing director</option>
                  <option value="project managers">project managers</option>
                  <option value="Channel partner manager">Channel partner manager</option>
                  <option value="HR">HR</option>
                  <option value="accountant">accountant</option>
                  <option value="Managing director">Managing director (MD)</option>
                  <option value="Admin (Technical)">System Admin</option>
                  <option value="Staff">Staff</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Primary Branch *
                </label>
                <select
                  value={addBranchId}
                  onChange={(e) => setAddBranchId(e.target.value)}
                  className="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-navy-500"
                >
                  <option value="">-- Select Branch --</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Additional Branches
                </label>
                <select
                  multiple
                  value={additionalBranchIds}
                  onChange={(e) => {
                    const options = Array.from(e.target.selectedOptions, (option) => option.value);
                    setAdditionalBranchIds(options);
                  }}
                  className="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-navy-500 min-h-[100px]"
                >
                  {branches
                    .filter((b) => b.id.toString() !== addBranchId)
                    .map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                </select>
                <p className="text-[10px] text-slate-500 mt-1">
                  Hold Ctrl (Windows) or Cmd (Mac) to select multiple.
                </p>
              </div>

              <div className="col-span-1 md:col-span-2">
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Accessible Companies
                </label>
                <select
                  multiple
                  value={accessibleCompanyIds}
                  onChange={(e) => {
                    const options = Array.from(e.target.selectedOptions, (option) => option.value);
                    setAccessibleCompanyIds(options);
                  }}
                  className="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-navy-500 min-h-[80px]"
                >
                  <option value="1">Radha Real Homes</option>
                  <option value="2">Sonthillu Constructions</option>
                </select>
                <p className="text-[10px] text-slate-500 mt-1">
                  Which companies' projects and properties this employee can see/manage. Hold Ctrl
                  (Windows) or Cmd (Mac) to select multiple.
                </p>
              </div>

              <div className="col-span-1 md:col-span-2 p-4 bg-navy-50 border border-navy-100 rounded-xl flex gap-3">
                <Key className="w-5 h-5 text-navy-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-bold text-navy-900">Initial Password</h4>
                  <p className="text-xs text-navy-700 mb-2">
                    The employee will be forced to change this upon their first login.
                  </p>
                  <div className="flex items-center gap-2 max-w-xs">
                    <input
                      type="text"
                      value={initialPassword}
                      onChange={(e) => setInitialPassword(e.target.value)}
                      className={`p-2 border rounded-lg w-full text-sm ${
                        initialPassword && getPasswordRuleError(initialPassword)
                          ? 'border-red-400'
                          : 'border-navy-200'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setInitialPassword(generateSuggestedPassword())}
                      className="shrink-0 px-2.5 py-2 text-xs font-semibold text-navy-700 border border-navy-200 rounded-lg hover:bg-navy-100"
                    >
                      Regenerate
                    </button>
                  </div>
                  {initialPassword && getPasswordRuleError(initialPassword) ? (
                    <p className="text-[11px] text-red-600 mt-1">
                      Password {getPasswordRuleError(initialPassword)}.
                    </p>
                  ) : (
                    <p className="text-[11px] text-navy-500 mt-1">
                      At least 8 characters, with uppercase, lowercase, a number, and a special
                      character.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-6 animate-fadeIn">
            <h2 className="text-2xl font-bold text-slate-800">Personal Details</h2>
            <p className="text-slate-500 text-sm">
              You may skip sensitive details. The employee can update them later.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="col-span-1 md:col-span-2">
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Current Address
                </label>
                <textarea
                  value={currentAddress}
                  onChange={(e) => setCurrentAddress(e.target.value)}
                  rows={2}
                  className="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-navy-500"
                ></textarea>
              </div>

              <div className="col-span-1 md:col-span-2">
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Permanent Address
                </label>
                <textarea
                  value={permanentAddress}
                  onChange={(e) => setPermanentAddress(e.target.value)}
                  rows={2}
                  className="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-navy-500"
                ></textarea>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Blood Group</label>
                <select
                  value={bloodGroup}
                  onChange={(e) => setBloodGroup(e.target.value)}
                  className="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-navy-500"
                >
                  {['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'].map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </div>

              <div className="col-span-1 md:col-span-2 p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-4 mt-2">
                <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-amber-500" /> Government IDs (Encrypted)
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      PAN Number
                    </label>
                    <input
                      type="text"
                      value={panNumber}
                      onChange={(e) => setPanNumber(e.target.value.toUpperCase())}
                      className={`w-full p-3 border rounded-xl focus:ring-2 font-mono uppercase ${
                        getPanFormatError(panNumber)
                          ? 'border-danger-400 focus:ring-danger-400'
                          : 'border-slate-300 focus:ring-navy-500'
                      }`}
                      placeholder="ABCDE1234F"
                    />
                    {getPanFormatError(panNumber) && (
                      <p className="text-[11px] text-danger-600 mt-1">
                        {getPanFormatError(panNumber)}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Aadhaar Number
                    </label>
                    <input
                      type="text"
                      value={aadhaarNumber}
                      onChange={(e) => setAadhaarNumber(e.target.value)}
                      className={`w-full p-3 border rounded-xl focus:ring-2 font-mono tracking-widest ${
                        getAadhaarFormatError(aadhaarNumber)
                          ? 'border-danger-400 focus:ring-danger-400'
                          : 'border-slate-300 focus:ring-navy-500'
                      }`}
                      placeholder="1234 5678 9012"
                    />
                    {getAadhaarFormatError(aadhaarNumber) && (
                      <p className="text-[11px] text-danger-600 mt-1">
                        {getAadhaarFormatError(aadhaarNumber)}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="col-span-1 md:col-span-2 p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-4">
                <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                  <Heart className="w-4 h-4 text-rose-500" /> Emergency Contact
                </h3>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Name</label>
                    <input
                      type="text"
                      value={emergencyContactName}
                      onChange={(e) => setEmergencyContactName(e.target.value)}
                      className="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-navy-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Relation</label>
                    <input
                      type="text"
                      value={emergencyContactRelation}
                      onChange={(e) => setEmergencyContactRelation(e.target.value)}
                      className="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-navy-500"
                      placeholder="e.g. Spouse, Father"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Phone</label>
                    <input
                      type="text"
                      value={emergencyContactPhone}
                      onChange={(e) => setEmergencyContactPhone(e.target.value)}
                      className="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-navy-500"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-6 animate-fadeIn">
            <h2 className="text-2xl font-bold text-slate-800">Professional Info</h2>
            <p className="text-slate-500 text-sm">
              Role, reporting structure, and compensation details.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Job Title</label>
                <div className="relative">
                  <Briefcase className="w-5 h-5 absolute left-3 top-3 text-slate-400" />
                  <input
                    type="text"
                    value={jobTitle}
                    onChange={(e) => setJobTitle(e.target.value)}
                    className="w-full p-3 pl-10 border border-slate-300 rounded-xl focus:ring-2 focus:ring-navy-500"
                    placeholder="e.g. Senior Telecaller"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Department</label>
                <select
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-navy-500"
                >
                  <option>Sales & Leads</option>
                  <option>Marketing</option>
                  <option>Operations</option>
                  <option>Human Resources</option>
                  <option>Finance</option>
                  <option>IT Systems</option>
                  <option>Executive</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Reporting Manager
                </label>
                <select
                  value={reportingManagerId}
                  onChange={(e) => setReportingManagerId(e.target.value)}
                  className="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-navy-500"
                >
                  <option value="">-- No Manager (Independent) --</option>
                  {managers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Employment Type
                </label>
                <select
                  value={employmentType}
                  onChange={(e) => setEmploymentType(e.target.value)}
                  className="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-navy-500"
                >
                  <option value="FULL_TIME">Full Time</option>
                  <option value="PART_TIME">Part Time</option>
                  <option value="CONTRACT">Contract</option>
                  <option value="INTERN">Intern</option>
                </select>
              </div>

              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={reportRequired}
                    onChange={(e) => setReportRequired(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-navy-700 focus:ring-navy-500"
                  />
                  <span className="text-xs font-semibold text-slate-700">
                    Daily Report Required
                  </span>
                </label>
                <span className="text-[10px] text-slate-400">Unchecked = reports optional</span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Date of Joining
                </label>
                <input
                  type="date"
                  value={dateOfJoining}
                  onChange={(e) => setDateOfJoining(e.target.value)}
                  className="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-navy-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Annual Salary (₹)
                </label>
                <div className="relative">
                  <DollarSign className="w-5 h-5 absolute left-3 top-3 text-slate-400" />
                  <input
                    type="number"
                    value={annualSalary}
                    onChange={(e) => setAnnualSalary(e.target.value)}
                    className="w-full p-3 pl-10 border border-slate-300 rounded-xl focus:ring-2 focus:ring-navy-500"
                  />
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Monthly Salary: ₹{Number(monthlySalary).toLocaleString('en-IN')}
                </p>
              </div>

              <div className="col-span-1 md:col-span-2">
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Background / Education
                </label>
                <div className="relative">
                  <GraduationCap className="w-5 h-5 absolute left-3 top-3 text-slate-400" />
                  <input
                    type="text"
                    value={backgroundEducation}
                    onChange={(e) => setBackgroundEducation(e.target.value)}
                    className="w-full p-3 pl-10 border border-slate-300 rounded-xl focus:ring-2 focus:ring-navy-500"
                    placeholder="e.g. B.Tech Computer Science, MBA Marketing"
                  />
                </div>
              </div>
            </div>
          </div>
        );

      case 4:
        return (
          <div className="space-y-6 animate-fadeIn">
            <h2 className="text-2xl font-bold text-slate-800">Banking Information</h2>
            <p className="text-slate-500 text-sm">
              For payroll processing. This data will be encrypted in the database.
            </p>

            <div className="p-6 bg-slate-50 border border-slate-200 rounded-2xl space-y-5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Bank Name</label>
                <div className="relative">
                  <Building2 className="w-5 h-5 absolute left-3 top-3 text-slate-400" />
                  <input
                    type="text"
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    className="w-full p-3 pl-10 border border-slate-300 rounded-xl focus:ring-2 focus:ring-navy-500"
                    placeholder="e.g. HDFC Bank"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Account Number
                </label>
                <div className="relative">
                  <PasswordInput
                    value={bankAccountNumber}
                    onChange={(e) => setBankAccountNumber(e.target.value)}
                    className="w-full p-3 pl-11 pr-10 border border-slate-300 rounded-xl focus:ring-2 focus:ring-navy-500 font-mono tracking-widest"
                    placeholder="●●●●●●●●●●●●"
                    icon={<CreditCardIcon className="w-5 h-5 text-slate-400" />}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">IFSC Code</label>
                  <input
                    type="text"
                    value={bankIfsc}
                    onChange={(e) => setBankIfsc(e.target.value.toUpperCase())}
                    className="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-navy-500 font-mono uppercase"
                    placeholder="HDFC0001234"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Branch Name</label>
                  <input
                    type="text"
                    value={bankBranch}
                    onChange={(e) => setBankBranch(e.target.value)}
                    className="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-navy-500"
                    placeholder="e.g. Madhapur"
                  />
                </div>
              </div>
            </div>

            <div className="p-4 bg-amber-50 rounded-xl border border-amber-200 text-amber-800 text-sm flex gap-3">
              <ShieldAlert className="w-5 h-5 shrink-0" />
              <p>
                You can skip this step and allow the employee to enter these details securely from
                their profile upon first login.
              </p>
            </div>
          </div>
        );

      case 5:
        return (
          <div className="space-y-6 animate-fadeIn">
            <div className="text-center">
              <CheckCircle2 className="w-16 h-16 text-navy-500 mx-auto mb-4" />
              <h2 className="text-3xl font-bold text-slate-800">Ready to Onboard</h2>
              <p className="text-slate-500 text-sm mt-2">
                Please review the details below before creating the employee account.
              </p>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 mt-6 shadow-sm">
              <div className="flex justify-between items-start border-b border-slate-200 pb-4 mb-4">
                <div>
                  <div className="text-xs font-bold text-navy-700 bg-navy-100 inline-block px-2 py-1 rounded mb-2">
                    {addRole}
                  </div>
                  <h3 className="text-xl font-bold text-slate-800">{fullName}</h3>
                  <p className="text-slate-500 text-sm flex items-center gap-1 mt-1">
                    <Phone className="w-3.5 h-3.5" /> {phone}
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold text-slate-700">{department}</div>
                  <div className="text-xs text-slate-500">{jobTitle || addRole}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 text-sm gap-4">
                <div>
                  <span className="text-slate-400 block text-xs">Email</span>
                  <span className="font-semibold">{email || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-xs">Branch</span>
                  <span className="font-semibold">
                    {branches.find((b) => b.id.toString() === addBranchId)?.name || 'N/A'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-xs">Gov IDs Provided</span>
                  <span className="font-semibold">
                    {panNumber || aadhaarNumber ? 'Yes (Encrypted)' : 'No (Pending)'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-xs">Bank Details</span>
                  <span className="font-semibold">
                    {bankAccountNumber ? 'Yes (Encrypted)' : 'No (Pending)'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        );

      case 6:
        const whatsappText = encodeURIComponent(
          `Hi ${fullName},\n\nWelcome to Radha Real Homes! Your CRM account has been created.\n\n` +
            `*Login URL:* https://erp.radharealhomes.com\n` +
            `*Employee Code:* ${createdEmployeeCode}\n` +
            `*Temporary Password:* ${initialPassword}\n\n` +
            `Please log in. You will be required to change this password on your first login for security purposes.\n\nBest Regards,\nHR Team`,
        );
        const whatsappUrl = `https://wa.me/91${phone.replace(/\D/g, '').slice(-10)}?text=${whatsappText}`;

        return (
          <div className="flex flex-col items-center justify-center space-y-6 animate-fadeIn py-10">
            <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <h2 className="text-3xl font-bold text-slate-800">Employee Onboarded!</h2>
            <p className="text-slate-500 text-center max-w-md">
              {fullName} has been successfully added to the system. Their employee code is{' '}
              <span className="font-bold text-navy-700">{createdEmployeeCode}</span>.
            </p>

            <div className="pt-6 w-full max-w-sm flex flex-col gap-4">
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noreferrer"
                className="w-full py-4 bg-[#25D366] hover:bg-[#1ebe5d] text-white font-bold rounded-xl shadow-lg transition-all flex justify-center items-center gap-3 hover:-translate-y-0.5"
              >
                <MessageCircle className="w-6 h-6" />
                Send Credentials on WhatsApp
              </a>
              <button
                onClick={onSuccess}
                className="w-full py-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-all"
              >
                Close & Return to Directory
              </button>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/90 backdrop-blur-sm flex items-center justify-center p-0 md:p-6">
      <div className="w-full h-full md:h-auto md:max-h-[90vh] max-w-5xl bg-white md:rounded-3xl shadow-2xl flex flex-col relative overflow-hidden animate-scaleUp">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-white sticky top-0 z-10">
          <h2 className="text-xl font-bold text-slate-800 md:hidden">Onboard Employee</h2>
          <div className="hidden md:block" />
          <button
            onClick={onClose}
            className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden">
          <div className="hidden md:block p-8 bg-slate-50/50">{renderStepIndicator()}</div>

          <div className="flex-1 p-6 md:p-10 overflow-y-auto bg-white custom-scrollbar">
            {renderStepContent()}
          </div>
        </div>

        {/* Footer Navigation */}
        {step < 6 && (
          <div className="p-5 border-t border-slate-200 bg-slate-50 flex items-center justify-between sticky bottom-0">
            <button
              onClick={handleBack}
              disabled={step === 1}
              className="px-6 py-3 text-slate-600 font-semibold hover:bg-slate-200 rounded-xl transition-colors disabled:opacity-0"
            >
              Back
            </button>

            {step < 5 ? (
              <button
                onClick={handleNext}
                disabled={
                  (step === 1 && (!fullName || !phone || !addBranchId)) ||
                  (step === 2 &&
                    (!!getPanFormatError(panNumber) || !!getAadhaarFormatError(aadhaarNumber)))
                }
                className="px-8 py-3 bg-navy-700 text-white font-bold rounded-xl shadow-md hover:bg-navy-800 transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                Continue <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={isLoading}
                className="px-8 py-3 bg-emerald-600 text-white font-bold text-lg rounded-xl shadow-lg hover:bg-emerald-700 transition-colors flex items-center gap-2 disabled:opacity-70"
              >
                {isLoading ? 'Creating...' : 'Create Employee Account'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
