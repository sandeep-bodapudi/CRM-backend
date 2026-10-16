import { EmployeeCreateSchema } from './src/shared/employee';

const payload = {
  full_name: 'Test Employee',
  phone: '1234567890',
  email: '',
  role_name: 'telecallers',
  branch_id: '1',
  additional_branch_ids: [],
  accessible_company_ids: [],
  initial_password: 'Password1!',

  current_address: '',
  permanent_address: '',
  blood_group: 'O+',
  emergency_contact_name: '',
  emergency_contact_relation: '',
  emergency_contact_phone: '',
  pan_number: '',
  aadhaar_number: '',

  job_title: '',
  department: 'Sales & Leads',
  employment_type: 'FULL_TIME',
  report_required: true,
  reporting_manager_id: '',
  date_of_joining: '2026-09-16',
  salary_ctc: '35000',
  background_education: '',

  bank_name: '',
  bank_account_number: '',
  bank_ifsc: '',
  bank_branch: '',
};

const result = EmployeeCreateSchema.safeParse(payload);
if (!result.success) {
  console.log('Validation Error:', result.error.errors);
} else {
  console.log('Success!');
}
