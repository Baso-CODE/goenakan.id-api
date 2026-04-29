import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@prisma/client";
import { injectable, singleton } from "tsyringe";

@singleton()
@injectable()
export class PrismaService extends PrismaClient {
  constructor() {
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
      throw new Error("DATABASE_URL is not defined in .env file");
    }

    const adapter = new PrismaMariaDb(connectionString);

    super({
      adapter: adapter,
      log: ["query", "info", "warn", "error"],
    });

    this.setupShutdownHandler();
  }

  private setupShutdownHandler() {
    const gracefulShutdown = async (signal: string) => {
      console.log(`\nReceived ${signal}. Disconnecting Prisma...`);
      await this.$disconnect();
      process.exit(0);
    };

    process.on("SIGINT", () => gracefulShutdown("SIGINT"));
    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  }
}
