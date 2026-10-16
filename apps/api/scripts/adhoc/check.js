const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const emp = await prisma.employee.findUnique({ where: { employee_code: 'RRH-ADMIN-001' } });
  if (!emp) {
    console.log('not found');
    return;
  }
  console.log('emp id', emp.id);

  const k = await prisma.kioskCredential.findMany({ where: { created_by_id: emp.id } });
  const l = await prisma.lead.findMany({ where: { created_by_id: emp.id } });
  const p = await prisma.property.findMany({ where: { created_by_id: emp.id } });
  console.log('kiosk:', k.length, 'leads:', l.length, 'properties:', p.length);

  const eps = await prisma.employee.findMany({ where: { reporting_manager_id: emp.id } });
  console.log('eps reports:', eps.length);
}
main().finally(() => prisma.$disconnect());
