import { prisma } from '../../apps/api/src/lib/prisma';
import bcrypt from 'bcryptjs';
import { Roles, Permissions, RolePermissionsMatrix } from '@rrh-ems/shared';

// The 13 authoritative roles defined by the Phase 0 audit (using their canonical names)
export const TEST_ROLES = [
  Roles.MD,
  Roles.ADMIN,
  Roles.MARKETING_DIRECTOR,
  Roles.PROJECT_MANAGER,
  Roles.DIGITAL_LEAD_OPERATOR,
  Roles.TELECALLER,
  Roles.DIGITAL_MARKETING_HEAD,
  Roles.HR_MANAGER,
  Roles.FINANCE,
  Roles.AGENT,
  Roles.DIGITAL_MARKETING_EXECUTIVE,
  Roles.SALES_MANAGER,
];

// We define raw deterministic data so tests can predict exactly what exists
export const deterministicUsers = TEST_ROLES.map((role, idx) => ({
  employee_code: `RRH-TST-${String(idx).padStart(3, '0')}`,
  name: `Test ${role}`,
  email: `test-${role.toLowerCase()}@example.com`,
  phone: `+919999999${idx.toString().padStart(3, '0')}`,
  password: 'Password@123',
  roles: [role],
  pan_number: 'ABCDE1234F', // Sensitive field for testing SF-005
  salary_ctc: 1000000, // Sensitive field
  department: role === Roles.FINANCE ? 'FINANCE' : 'OPERATIONS',
  company_id: 1,
}));

export const crossOrgUsers = [
  {
    employee_code: 'RRH-TST-999',
    name: 'Test Telecaller Org B',
    email: 'test-telecaller-org-b@example.com',
    phone: '+918888888001',
    password: 'Password@123',
    roles: [Roles.TELECALLER],
    department: 'OPERATIONS',
    pan_number: 'XYZDE1234F',
    salary_ctc: 500000,
    company_id: 2,
  },
];

export async function setupDeterministicTestUsers() {
  // Safety Guard: Do not run against production database!
  if (process.env.NODE_ENV !== 'test' || !process.env.DATABASE_URL_TEST) {
    throw new Error(
      'ABORT: Test safety guard triggered. Requires NODE_ENV=test AND DATABASE_URL_TEST. Do not run against production!',
    );
  }

  const hashedPassword = await bcrypt.hash('Password@123', 12);

  // Create or upsert a deterministic test Company for Phase 0
  const testCompany = await prisma.company.upsert({
    where: { code: 'TEST_COMP_01' },
    update: {},
    create: {
      name: 'Test Company',
      code: 'TEST_COMP_01',
    },
  });

  const crossOrgCompany = await prisma.company.upsert({
    where: { code: 'TEST_COMP_02' },
    update: {},
    create: {
      name: 'Cross Org Company',
      code: 'TEST_COMP_02',
    },
  });

  let testBranch = await prisma.branch.findFirst({
    where: { company_id: testCompany.id, name: 'Test Branch' },
  });
  if (!testBranch) {
    testBranch = await prisma.branch.create({
      data: { company_id: testCompany.id, name: 'Test Branch' },
    });
  }

  let crossOrgBranch = await prisma.branch.findFirst({
    where: { company_id: crossOrgCompany.id, name: 'Cross Org Branch' },
  });
  if (!crossOrgBranch) {
    crossOrgBranch = await prisma.branch.create({
      data: { company_id: crossOrgCompany.id, name: 'Cross Org Branch' },
    });
  }

  const allUsers = [...deterministicUsers, ...crossOrgUsers];

  for (const user of allUsers) {
    // Upsert the employee first
    const upsertedEmp = await prisma.employee.upsert({
      where: { employee_code: user.employee_code },
      update: {
        company_id: crossOrgUsers.some((u) => u.employee_code === user.employee_code)
          ? crossOrgCompany.id
          : testCompany.id,
        password_hash: hashedPassword,
        status: 'ACTIVE',
        token_version: 1,
        // Test users have already set their own password; a temporary one is
        // refused by the API for everything but the password change.
        first_login_done: true,
      },
      create: {
        employee_code: user.employee_code,
        full_name: user.name,
        email: user.email,
        phone: user.phone,
        password_hash: hashedPassword,
        company: {
          connect: {
            id: crossOrgUsers.some((u) => u.employee_code === user.employee_code)
              ? crossOrgCompany.id
              : testCompany.id,
          },
        },
        pan_number: user.pan_number,
        salary_ctc: user.salary_ctc,
        department: user.department,
        job_title: `Test ${user.roles[0]}`,
        first_login_done: true,
      },
    });

    // Ensure pristine roles (wiping any dirty state from prior test runs)
    await prisma.employeeRole.deleteMany({ where: { employee_id: upsertedEmp.id } });
    for (const roleName of user.roles) {
      const role = await prisma.role.upsert({
        where: { name: roleName },
        update: {},
        create: { name: roleName },
      });
      await prisma.employeeRole.createMany({
        data: [
          {
            employee_id: upsertedEmp.id,
            role_id: role.id,
          },
        ],
        skipDuplicates: true,
      });
    }
  }

  // --- Phase 1 Stage 2: Sync RolePermissionsMatrix into Test DB ---
  const allPerms = Object.values(Permissions).filter((p) => typeof p === 'string') as string[];

  // Create permissions efficiently if they don't exist
  await prisma.permission.createMany({
    data: allPerms.map((permName) => ({ name: permName })),
    skipDuplicates: true,
  });

  // Fetch all roles and permissions once
  const [allRoles, allDbPerms] = await Promise.all([
    prisma.role.findMany(),
    prisma.permission.findMany(),
  ]);

  const roleMap = new Map(allRoles.map((r) => [r.name, r.id]));
  const permMap = new Map(allDbPerms.map((p) => [p.name, p.id]));

  // Build the list of required RolePermission pairs
  const rolePermsData: { role_id: number; permission_id: number }[] = [];
  for (const [roleName, permissions] of Object.entries(RolePermissionsMatrix)) {
    const roleId = roleMap.get(roleName);
    if (!roleId) {
      console.warn(`[DIAGNOSTIC] Missing roleId for roleName: ${roleName}`);
    }
    if (roleId && Array.isArray(permissions)) {
      for (const perm of permissions) {
        const permId = permMap.get(perm);
        if (permId) {
          rolePermsData.push({ role_id: roleId, permission_id: permId });
        } else {
          console.warn(`[DIAGNOSTIC] Missing permId for permission: ${perm}`);
        }
      }
    }
  }

  // Reverted back to createMany to prevent blowing up max_connections_per_hour on the test DB
  if (rolePermsData.length > 0) {
    try {
      // Clear existing role permissions for roles in the matrix to ensure a pristine state
      const targetRoleIds = Array.from(new Set(rolePermsData.map((rp) => rp.role_id)));
      await prisma.rolePermission.deleteMany({
        where: { role_id: { in: targetRoleIds } },
      });

      const result = await prisma.rolePermission.createMany({
        data: rolePermsData,
        skipDuplicates: true,
      });
      console.log(`[DIAGNOSTIC] Inserted ${result.count} RolePermission records.`);
    } catch (err: any) {
      console.error(`[DIAGNOSTIC ERROR] Failed to createMany RolePermissions: ${err.message}`);
    }
  }

  // Verify what was actually inserted for PM
  const pmRoleId = roleMap.get(Roles.PROJECT_MANAGER);
  if (pmRoleId) {
    const pmPerms = await prisma.rolePermission.count({ where: { role_id: pmRoleId } });
    console.log(
      `[DIAGNOSTIC] Project Manager Role (ID: ${pmRoleId}) has ${pmPerms} permissions in DB after sync.`,
    );
  }
}
