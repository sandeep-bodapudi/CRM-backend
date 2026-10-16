const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const allRoles = await prisma.role.findMany({ include: { permissions: { include: { permission: true } } } });
  let propReadPerm = await prisma.permission.findFirst({ where: { name: 'properties.read' } });
  
  if (!propReadPerm) {
    propReadPerm = await prisma.permission.create({ data: { name: 'properties.read', module: 'Properties' } });
  }

  for (const role of allRoles) {
    const hasPerm = role.permissions.some(p => p.permission.name === 'properties.read');
    if (!hasPerm) {
      await prisma.rolePermission.create({
        data: {
          role_id: role.id,
          permission_id: propReadPerm.id
        }
      });
      console.log(`Added properties.read to role ${role.name}`);
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
