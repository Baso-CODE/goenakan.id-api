import * as dotenv from "dotenv";
dotenv.config();
import "reflect-metadata";
import { PrismaService } from "./modules/prisma/prisma.service";

const prisma = new PrismaService();

async function run() {
  const product = await prisma.product.findFirst({
    where: { slug: "tshirt-hitam-baru-promo" },
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

  if (!product) {
    console.log("Product not found");
    return;
  }

  console.log(`Product: ${product.name} (ID: ${product.id})`);
  for (const av of product.attributeValues) {
    console.log(`  Attribute Value ID: ${av.id}`);
    console.log(`    Attribute: "${av.attributeValue.attribute?.name}"`);
    console.log(`    Value: "${av.attributeValue.value}"`);
    console.log(`    Price Modifier: ${av.priceModifier}`);
  }

  await prisma.$disconnect();
}

run().catch(console.error);
