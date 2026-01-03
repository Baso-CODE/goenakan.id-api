import { PrismaClient } from "@prisma/client";

export class PrismaService extends PrismaClient {
  constructor() {
    super();

    // === Handle shutdown ===
    process.on("SIGINT", async () => {
      await this.$disconnect();
      process.exit(0);
    });
  }
}
