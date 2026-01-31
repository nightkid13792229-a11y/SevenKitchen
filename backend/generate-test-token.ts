import { JwtService } from '@nestjs/jwt';
import { PrismaService } from './src/infrastructure/prisma.service';

async function generateToken() {
  const prisma = new PrismaService();
  const jwtService = new JwtService({ secret: process.env.JWT_SECRET || 'sevenkitchen-jwt-secret-key-2025' });

  try {
    // Find admin user
    const admin = await prisma.user.findFirst({
      where: { role: 'ADMIN' }
    });

    if (!admin) {
      console.log('Admin user not found');
      return;
    }

    const token = jwtService.sign({
      userId: admin.id,
      customerId: admin.id,
      role: 'ADMIN'
    });

    console.log('Token:', token);
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

generateToken();
