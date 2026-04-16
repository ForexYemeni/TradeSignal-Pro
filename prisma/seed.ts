import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seed() {
  // Seed default admin
  const admin = await prisma.admin.upsert({
    where: { email: 'admin@forexyemeni.com' },
    update: {},
    create: {
      email: 'admin@forexyemeni.com',
      passwordHash: 'admin123',
      name: 'مدير النظام',
      mustChangePwd: true,
    },
  });
  console.log('Admin created:', admin.email, '| Must change password:', admin.mustChangePwd);
}

seed()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
