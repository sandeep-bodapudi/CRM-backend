import React, { useState } from 'react';
import { getPanFormatError, getAadhaarFormatError } from '../../utils/idValidation';
import {
  Building2,
  User,
  Key,
  Users,
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
  Save,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config';
import { useToast } from '../../context/ToastContext';
import { handleApiError, toUserFacingError } from '../../utils/userFacingError';

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

interface EditEmployeeModalProps {
  employee: Employee;
  onClose: () => void;
  onSuccess: () => void;
  branches: { id: number; name: string }[];
  managers: { id: number; label: string }[];
}

export const EditEmployeeModal: React.FC<EditEmployeeModalProps> = ({
  employee,
  onClose,
  onSuccess,
  branches,
  managers,
}) => {
  const { fetchWithAuth } = useAuth();
  const { showToast, showError } = useToast();

  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'basic' | 'personal' | 'professional' | 'banking'>(
    'basic',
  );

  // Basic Info
  const [fullName, setFullName] = useState(employee.fullName || '');
  const [phone, setPhone] = useState(employee.phone || '');
  const [email, setEmail] = useState(employee.email || '');
  const [roleName, setRoleName] = useState(employee.roles[0] || 'Telecaller');
  const [branchId, setBranchId] = useState<string>(String(employee.branchId || ''));
  const [accessibleCompanyIds, setAccessibleCompanyIds] = useState<string[]>(
    employee.accessibleCompanyIds?.map(String) || [],
  );

  // Personal Info
  const [currentAddress, setCurrentAddress] = useState(employee.currentAddress || '');
  const [permanentAddress, setPermanentAddress] = useState(employee.permanentAddress || '');
  const [bloodGroup, setBloodGroup] = useState(employee.bloodGroup || 'O+');
  const [secondaryPhone, setSecondaryPhone] = useState(employee.secondaryPhone || '');
  const [whatsappNumber, setWhatsappNumber] = useState(employee.whatsappNumber || '');
  const [socialLinks, setSocialLinks] = useState(employee.socialLinks || '');

  const [emergencyContactName, setEmergencyContactName] = useState(
    employee.emergencyContactName || '',
  );
  const [emergencyContactRelation, setEmergencyContactRelation] = useState(
    employee.emergencyContactRelation || '',
  );
  const [emergencyContactPhone, setEmergencyContactPhone] = useState(
    employee.emergencyContactPhone || '',
  );

  const [panNumber, setPanNumber] = useState(employee.panNumber || '');
  const [aadhaarNumber, setAadhaarNumber] = useState(employee.aadhaarNumber || '');

  // Professional Info
  const [jobTitle, setJobTitle] = useState(employee.jobTitle || '');
  const [department, setDepartment] = useState(employee.department || '');
  const [employmentType, setEmploymentType] = useState(employee.employmentType || 'FULL_TIME');
  const [reportRequired, setReportRequired] = useState(employee.reportRequired ?? true);
  const [reportingManagerId, setReportingManagerId] = useState<string>(
    employee.reportingManagerId ? String(employee.reportingManagerId) : '',
  );
  const [dateOfJoining, setDateOfJoining] = useState(
    employee.dateOfJoining ? new Date(employee.dateOfJoining).toISOString().split('T')[0] : '',
  );
  // `employee.salaryCtc` is the stored MONTHLY figure (see AddEmployeeWizard
  // for why) — this form edits Annual Salary and converts back to monthly.
  const [annualSalary, setAnnualSalary] = useState(
    employee.salaryCtc ? String(employee.salaryCtc * 12) : '',
  );
  const monthlySalary = annualSalary ? (parseFloat(annualSalary) / 12).toFixed(2) : '';
  const [backgroundEducation, setBackgroundEducation] = useState(
    employee.backgroundEducation || '',
  );

  // Banking Info
  const [bankName, setBankName] = useState(employee.bankName || '');
  const [bankAccountNumber, setBankAccountNumber] = useState(employee.bankAccountNumber || '');
  const [bankIfsc, setBankIfsc] = useState(employee.bankIfsc || '');
  const [bankBranch, setBankBranch] = useState(employee.bankBranch || '');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName || !phone) {
      showError({ message: 'Full Name and Primary Phone Number are required.' });
      return;
    }
    const panError = getPanFormatError(panNumber);
    const aadhaarError = getAadhaarFormatError(aadhaarNumber);
    if (panError || aadhaarError) {
      showError({ message: panError || aadhaarError || 'Invalid government ID format.' });
      return;
    }

    setIsLoading(true);
    try {
      const payload = {
        full_name: fullName,
        phone,
        secondary_phone: secondaryPhone || undefined,
        whatsapp_number: whatsappNumber || undefined,
        email: email || undefined,
        role_name: roleName || undefined,
        branch_id: branchId || undefined,
        accessible_company_ids: accessibleCompanyIds.length > 0 ? accessibleCompanyIds : undefined,

        current_address: currentAddress || undefined,
        permanent_address: permanentAddress || undefined,
        blood_group: bloodGroup || undefined,
        social_links: socialLinks || undefined,
        emergency_contact_name: emergencyContactName || undefined,
        emergency_contact_relation: emergencyContactRelation || undefined,
        emergency_contact_phone: emergencyContactPhone || undefined,

        // KYC and banking should only be sent if they are actually edited and visible,
        // but if they are populated we can send them.
        // Note: the backend accepts them. If the user doesn't have permission to edit them, it will throw 403 if they change it.
        pan_number: panNumber || undefined,
        aadhaar_number: aadhaarNumber || undefined,

        job_title: jobTitle || undefined,
        department: department || undefined,
        employment_type: employmentType || undefined,
        report_required: reportRequired,
        reporting_manager_id: reportingManagerId || undefined,
        date_of_joining: dateOfJoining || undefined,
        salary_ctc: monthlySalary || undefined,
        background_education: backgroundEducation || undefined,

        bank_name: bankName || undefined,
        bank_account_number: bankAccountNumber || undefined,
        bank_ifsc: bankIfsc || undefined,
        bank_branch: bankBranch || undefined,
      };

      const res = await fetchWithAuth(`${API_BASE_URL}/employees/${employee.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (res.ok) {
        showToast(`Employee details updated successfully!`, 'success');
        onSuccess();
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

  const tabs = [
    { id: 'basic', label: 'Basic Info', icon: User },
    { id: 'personal', label: 'Personal & Contact', icon: Heart },
    { id: 'professional', label: 'Professional', icon: Briefcase },
    { id: 'banking', label: 'Bank & KYC', icon: CreditCardIcon },
  ] as const;

  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-scaleUp">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Edit Employee: {employee.fullName}</h2>
            <p className="text-xs text-slate-500">Update employee details and save.</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-500"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex px-6 pt-4 gap-4 border-b border-slate-200 overflow-x-auto shrink-0">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'border-navy-600 text-navy-700'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Form Body */}
        <div className="p-6 overflow-y-auto flex-1">
          <form id="edit-employee-form" onSubmit={handleSubmit} className="space-y-6">
            {activeTab === 'basic' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 animate-fadeIn">
                <div className="col-span-1 md:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Full Legal Name *
                  </label>
                  <div className="relative">
                    <User className="w-5 h-5 absolute left-3 top-3 text-slate-400" />
                    <input
                      required
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full p-3 pl-10 border border-slate-300 rounded-xl focus:ring-2 focus:ring-navy-500"
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
                      required
                      type="text"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full p-3 pl-10 border border-slate-300 rounded-xl focus:ring-2 focus:ring-navy-500"
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
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">System Role</label>
                  <select
                    value={roleName}
                    onChange={(e) => setRoleName(e.target.value)}
                    className="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-navy-500"
                  >
                    <option value="telecallers">Telecaller</option>
                    <option value="Agent">Agent</option>
                    <option value="Sales manager">Sales Manager</option>
                    <option value="digital marketing executive">Digital Marketing Executive</option>
                    <option value="Digital lead operator">Digital Lead Operator</option>
                    <option value="Digital Marketing head(manager)">Digital Marketing Head</option>
                    <option value="marketing director">Marketing Director</option>
                    <option value="project managers">Project Manager</option>
                    <option value="Channel partner manager">Channel Partner Manager</option>
                    <option value="HR">HR</option>
                    <option value="accountant">Accountant</option>
                    <option value="Managing director">Managing Director (MD)</option>
                    <option value="Admin (Technical)">System Admin</option>
                    <option value="Staff">Staff</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Primary Branch
                  </label>
                  <select
                    value={branchId}
                    onChange={(e) => setBranchId(e.target.value)}
                    className="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-navy-500"
                  >
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="col-span-1 md:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-2">
                    Accessible Companies
                    <span className="text-[10px] text-slate-400 font-normal">
                      (Leave empty to keep current access intact)
                    </span>
                  </label>
                  <select
                    multiple
                    value={accessibleCompanyIds}
                    onChange={(e) => {
                      const options = Array.from(
                        e.target.selectedOptions,
                        (option) => option.value,
                      );
                      setAccessibleCompanyIds(options);
                    }}
                    className="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-navy-500 min-h-[80px]"
                  >
                    <option value="1">Radha Real Homes</option>
                    <option value="2">Sonthillu Constructions</option>
                  </select>
                  <p className="text-[10px] text-slate-500 mt-1">
                    Hold Ctrl (Windows) or Cmd (Mac) to select multiple. Overwrites existing access
                    if changed.
                  </p>
                </div>
              </div>
            )}

            {/* RECONSTRUCTED — the original capture of this tab's JSX was lost;
                these fields mirror the Basic Info tab's pattern and use only
                state already recovered verbatim above. */}
            {activeTab === 'personal' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 animate-fadeIn">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Secondary Phone
                  </label>
                  <div className="relative">
                    <Phone className="w-5 h-5 absolute left-3 top-3 text-slate-400" />
                    <input
                      type="text"
                      value={secondaryPhone}
                      onChange={(e) => setSecondaryPhone(e.target.value)}
                      className="w-full p-3 pl-10 border border-slate-300 rounded-xl focus:ring-2 focus:ring-navy-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    WhatsApp Number
                  </label>
                  <div className="relative">
                    <Phone className="w-5 h-5 absolute left-3 top-3 text-slate-400" />
                    <input
                      type="text"
                      value={whatsappNumber}
                      onChange={(e) => setWhatsappNumber(e.target.value)}
                      className="w-full p-3 pl-10 border border-slate-300 rounded-xl focus:ring-2 focus:ring-navy-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Blood Group</label>
                  <select
                    value={bloodGroup}
                    onChange={(e) => setBloodGroup(e.target.value)}
                    className="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-navy-500"
                  >
                    {['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'].map((bg) => (
                      <option key={bg} value={bg}>
                        {bg}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Social Links
                  </label>
                  <div className="relative">
                    <Users className="w-5 h-5 absolute left-3 top-3 text-slate-400" />
                    <input
                      type="text"
                      value={socialLinks}
                      onChange={(e) => setSocialLinks(e.target.value)}
                      placeholder="LinkedIn, Instagram, etc."
                      className="w-full p-3 pl-10 border border-slate-300 rounded-xl focus:ring-2 focus:ring-navy-500"
                    />
                  </div>
                </div>

                <div className="col-span-1 md:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Current Address
                  </label>
                  <div className="relative">
                    <MapPin className="w-5 h-5 absolute left-3 top-3 text-slate-400" />
                    <input
                      type="text"
                      value={currentAddress}
                      onChange={(e) => setCurrentAddress(e.target.value)}
                      className="w-full p-3 pl-10 border border-slate-300 rounded-xl focus:ring-2 focus:ring-navy-500"
                    />
                  </div>
                </div>

                <div className="col-span-1 md:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Permanent Address
                  </label>
                  <div className="relative">
                    <MapPin className="w-5 h-5 absolute left-3 top-3 text-slate-400" />
                    <input
                      type="text"
                      value={permanentAddress}
                      onChange={(e) => setPermanentAddress(e.target.value)}
                      className="w-full p-3 pl-10 border border-slate-300 rounded-xl focus:ring-2 focus:ring-navy-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Emergency Contact Name
                  </label>
                  <div className="relative">
                    <ShieldAlert className="w-5 h-5 absolute left-3 top-3 text-slate-400" />
                    <input
                      type="text"
                      value={emergencyContactName}
                      onChange={(e) => setEmergencyContactName(e.target.value)}
                      className="w-full p-3 pl-10 border border-slate-300 rounded-xl focus:ring-2 focus:ring-navy-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Emergency Contact Relation
                  </label>
                  <input
                    type="text"
                    value={emergencyContactRelation}
                    onChange={(e) => setEmergencyContactRelation(e.target.value)}
                    className="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-navy-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Emergency Contact Phone
                  </label>
                  <div className="relative">
                    <Phone className="w-5 h-5 absolute left-3 top-3 text-slate-400" />
                    <input
                      type="text"
                      value={emergencyContactPhone}
                      onChange={(e) => setEmergencyContactPhone(e.target.value)}
                      className="w-full p-3 pl-10 border border-slate-300 rounded-xl focus:ring-2 focus:ring-navy-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">PAN Number</label>
                  <div className="relative">
                    <Key className="w-5 h-5 absolute left-3 top-3 text-slate-400" />
                    <input
                      type="text"
                      value={panNumber}
                      onChange={(e) => setPanNumber(e.target.value.toUpperCase())}
                      className={`w-full p-3 pl-10 border rounded-xl focus:ring-2 font-mono uppercase ${
                        getPanFormatError(panNumber)
                          ? 'border-danger-400 focus:ring-danger-400'
                          : 'border-slate-300 focus:ring-navy-500'
                      }`}
                    />
                  </div>
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
                  <div className="relative">
                    <Key className="w-5 h-5 absolute left-3 top-3 text-slate-400" />
                    <input
                      type="text"
                      value={aadhaarNumber}
                      onChange={(e) => setAadhaarNumber(e.target.value)}
                      className={`w-full p-3 pl-10 border rounded-xl focus:ring-2 ${
                        getAadhaarFormatError(aadhaarNumber)
                          ? 'border-danger-400 focus:ring-danger-400'
                          : 'border-slate-300 focus:ring-navy-500'
                      }`}
                    />
                  </div>
                  {getAadhaarFormatError(aadhaarNumber) && (
                    <p className="text-[11px] text-danger-600 mt-1">
                      {getAadhaarFormatError(aadhaarNumber)}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* RECONSTRUCTED — see note above the Personal tab. */}
            {activeTab === 'professional' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 animate-fadeIn">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Job Title</label>
                  <div className="relative">
                    <Briefcase className="w-5 h-5 absolute left-3 top-3 text-slate-400" />
                    <input
                      type="text"
                      value={jobTitle}
                      onChange={(e) => setJobTitle(e.target.value)}
                      className="w-full p-3 pl-10 border border-slate-300 rounded-xl focus:ring-2 focus:ring-navy-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Department</label>
                  <div className="relative">
                    <Building className="w-5 h-5 absolute left-3 top-3 text-slate-400" />
                    <input
                      type="text"
                      value={department}
                      onChange={(e) => setDepartment(e.target.value)}
                      className="w-full p-3 pl-10 border border-slate-300 rounded-xl focus:ring-2 focus:ring-navy-500"
                    />
                  </div>
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
                    Date of Joining
                  </label>
                  <div className="relative">
                    <GraduationCap className="w-5 h-5 absolute left-3 top-3 text-slate-400" />
                    <input
                      type="date"
                      value={dateOfJoining}
                      onChange={(e) => setDateOfJoining(e.target.value)}
                      className="w-full p-3 pl-10 border border-slate-300 rounded-xl focus:ring-2 focus:ring-navy-500"
                    />
                  </div>
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
                  {monthlySalary && (
                    <p className="text-[11px] text-slate-500 mt-1">
                      Monthly Salary: ₹{Number(monthlySalary).toLocaleString('en-IN')}
                    </p>
                  )}
                </div>

                <div className="col-span-1 md:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Educational Background
                  </label>
                  <div className="relative">
                    <FileText className="w-5 h-5 absolute left-3 top-3 text-slate-400" />
                    <input
                      type="text"
                      value={backgroundEducation}
                      onChange={(e) => setBackgroundEducation(e.target.value)}
                      className="w-full p-3 pl-10 border border-slate-300 rounded-xl focus:ring-2 focus:ring-navy-500"
                    />
                  </div>
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
                </div>
              </div>
            )}

            {/* RECONSTRUCTED — see note above the Personal tab. */}
            {activeTab === 'banking' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 animate-fadeIn">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Bank Name</label>
                  <div className="relative">
                    <Building2 className="w-5 h-5 absolute left-3 top-3 text-slate-400" />
                    <input
                      type="text"
                      value={bankName}
                      onChange={(e) => setBankName(e.target.value)}
                      className="w-full p-3 pl-10 border border-slate-300 rounded-xl focus:ring-2 focus:ring-navy-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Bank Branch</label>
                  <div className="relative">
                    <Building className="w-5 h-5 absolute left-3 top-3 text-slate-400" />
                    <input
                      type="text"
                      value={bankBranch}
                      onChange={(e) => setBankBranch(e.target.value)}
                      className="w-full p-3 pl-10 border border-slate-300 rounded-xl focus:ring-2 focus:ring-navy-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Account Number
                  </label>
                  <div className="relative">
                    <CreditCard className="w-5 h-5 absolute left-3 top-3 text-slate-400" />
                    <input
                      type="text"
                      value={bankAccountNumber}
                      onChange={(e) => setBankAccountNumber(e.target.value)}
                      className="w-full p-3 pl-10 border border-slate-300 rounded-xl focus:ring-2 focus:ring-navy-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">IFSC Code</label>
                  <div className="relative">
                    <CheckCircle2 className="w-5 h-5 absolute left-3 top-3 text-slate-400" />
                    <input
                      type="text"
                      value={bankIfsc}
                      onChange={(e) => setBankIfsc(e.target.value.toUpperCase())}
                      className="w-full p-3 pl-10 border border-slate-300 rounded-xl focus:ring-2 focus:ring-navy-500"
                    />
                  </div>
                </div>
              </div>
            )}
          </form>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="px-5 py-2.5 text-sm font-bold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="edit-employee-form"
            disabled={isLoading}
            className="px-5 py-2.5 text-sm font-bold text-white bg-navy-700 rounded-xl hover:bg-navy-800 transition-colors shadow-sm flex items-center gap-2 disabled:opacity-50"
          >
            {isLoading ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
};
