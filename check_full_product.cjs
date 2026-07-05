const { PrismaClient } = require("@prisma/client");
const { PrismaMariaDb } = require("@prisma/adapter-mariadb");
require("dotenv").config();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not defined");
}
const adapter = new PrismaMariaDb(connectionString);
const prisma = new PrismaClient({ adapter });

async function main() {
  const products = await prisma.product.findMany({
    take: 10,
    include: {
      attributeValues: {
        include: {
          attributeValue: {
            include: { attribute: true }
          }
        }
      }
    }
  });
  console.log("PRODUCTS found:", products.length);
  for (const p of products) {
    console.log(`- Product ID: ${p.id}, Name: ${p.name}`);
    for (const av of p.attributeValues) {
      console.log(`  * Attribute: ${av.attributeValue?.attribute?.name}, Value: ${av.attributeValue?.value}, Modifier: ${av.priceModifier}`);
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
