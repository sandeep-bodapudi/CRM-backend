const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function rename() {
  await prisma.employee.update({
    where: { employee_code: 'TEST-BOT-999' },
    data: { employee_code: 'DEV-BOT-999' }
  });
  console.log('Renamed to DEV-BOT-999');
  await prisma.$disconnect();
}

rename().catch(console.error);
