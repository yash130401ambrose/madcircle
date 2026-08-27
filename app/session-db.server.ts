import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var prismaSessionGlobal: PrismaClient | undefined;
}

const prisma = global.prismaSessionGlobal ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  global.prismaSessionGlobal = prisma;
}

export default prisma;
