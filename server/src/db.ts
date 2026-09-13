// Prisma Client dùng chung toàn ứng dụng
import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();
export default prisma;
