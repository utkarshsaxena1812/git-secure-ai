import { PrismaClient } from '@prisma/client'

// Single PrismaClient for the process. tsx watch can re-evaluate modules on
// reload, so cache it on globalThis to avoid exhausting connections in dev.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const prisma = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
