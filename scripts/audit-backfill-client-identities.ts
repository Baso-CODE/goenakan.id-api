/**
 * Goenakan: audit and optional backfill of B2C/B2B identityKey.
 *
 * Install at: API_REPO/scripts/audit-backfill-client-identities.ts
 *
 * READ ONLY (default):
 *   bun scripts/audit-backfill-client-identities.ts
 *
 * Backfill only after verified Prisma migration and backup:
 *   bun scripts/audit-backfill-client-identities.ts --apply --db=YOUR_DATABASE_NAME
 *
 * Does NOT merge Client records, link website User accounts, or touch Orders.
 */
import { Prisma } from "@prisma/client";
import "dotenv/config";
import "reflect-metadata";
import { PrismaService } from "../src/modules/prisma/prisma.service";
import {
  buildB2BIdentityKey,
  buildB2CIdentityKey,
} from "../src/utils/client-identity";

type SimpleClient = {
  id: string;
  identityKey: string | null;
  client: { custCode: string };
};

type B2CRow = SimpleClient & { name: string; phone: string | null };
type B2BRow = SimpleClient & { companyName: string; phone: string | null };

type AuditGroup = {
  kind: "B2B" | "B2C";
  key: string;
  rows: SimpleClient[];
};

function auditGroups<T extends SimpleClient>(
  kind: "B2B" | "B2C",
  rows: T[],
  identityOf: (row: T) => string | null,
) {
  const byKey = new Map<string, T[]>();
  let missingIdentity = 0;
  let keyMismatch = 0;
  let nullKeys = 0;

  for (const row of rows) {
    const expected = identityOf(row);
    if (row.identityKey === null) nullKeys++;
    if (!expected) {
      missingIdentity++;
      continue;
    }
    if (row.identityKey && row.identityKey !== expected) keyMismatch++;
    const arr = byKey.get(expected) ?? [];
    arr.push(row);
    byKey.set(expected, arr);
  }

  const collisions = [...byKey.entries()]
    .filter(([, members]) => members.length > 1)
    .map(([key, members]) => ({ kind, key, rows: members }));
  const singles = [...byKey.entries()]
    .filter(([, members]) => members.length === 1)
    .map(([key, members]) => ({ kind, key, rows: members }));

  console.log(`\n=== ${kind} ===`);
  console.log(`Total records: ${rows.length}`);
  console.log(`identityKey NULL: ${nullKeys}`);
  console.log(
    `Nama/telepon tidak valid (tidak bisa di-backfill): ${missingIdentity}`,
  );
  console.log(`identityKey tidak sesuai data terkini: ${keyMismatch}`);
  console.log(`Kelompok identitas duplikat: ${collisions.length}`);
  for (const [idx, g] of collisions.slice(0, 20).entries()) {
    console.log(
      `  Collision ${idx + 1}: ${g.rows.length} Client (${g.rows.map((r) => r.client.custCode).join(", ")})`,
    );
  }
  if (collisions.length > 20) {
    console.log(`  ... dan ${collisions.length - 20} kelompok lainnya`);
  }

  return { collisions, singles, missingIdentity, keyMismatch, nullKeys };
}

async function run() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL tidak ditemukan");
  const databaseUrl = new URL(connectionString);
  const dbName = decodeURIComponent(databaseUrl.pathname.replace(/^\//, ""));
  const apply = process.argv.includes("--apply");
  const expectedDbName = process.argv
    .find((arg) => arg.startsWith("--db="))
    ?.slice(5);

  console.log(`Target DB host: ${databaseUrl.hostname}`);
  console.log(`Target DB name: ${dbName}`);
  console.log(`Mode: ${apply ? "BACKFILL (WRITE)" : "AUDIT ONLY (READ-ONLY)"}`);

  if (apply && (!expectedDbName || expectedDbName !== dbName)) {
    throw new Error(
      "Untuk --apply, wajib --db=NAMA_DATABASE yang sama dengan target tercetak. Pastikan backup dan migrasi sudah selesai.",
    );
  }

  const prisma = new PrismaService();
  try {
    const [b2c, b2b] = await Promise.all([
      prisma.clientB2C.findMany({
        select: {
          id: true,
          name: true,
          phone: true,
          identityKey: true,
          client: { select: { custCode: true } },
        },
      }),
      prisma.clientB2B.findMany({
        select: {
          id: true,
          companyName: true,
          phone: true,
          identityKey: true,
          client: { select: { custCode: true } },
        },
      }),
    ]);

    const a = auditGroups("B2C", b2c as B2CRow[], (row) =>
      buildB2CIdentityKey(row.name, row.phone),
    );
    const b = auditGroups("B2B", b2b as B2BRow[], (row) =>
      buildB2BIdentityKey(row.companyName, row.phone),
    );

    if (!apply) {
      console.log("\nTidak ada perubahan database. Audit selesai.");
      return;
    }

    let written = 0;
    let skipped = 0;
    let races = 0;
    for (const group of [...a.singles, ...b.singles] as AuditGroup[]) {
      const row = group.rows[0];
      if (!row || row.identityKey === group.key) continue;
      if (row.identityKey !== null) {
        skipped++;
        continue;
      }
      try {
        const result =
          group.kind === "B2C"
            ? await prisma.clientB2C.updateMany({
                where: { id: row.id, identityKey: null },
                data: { identityKey: group.key },
              })
            : await prisma.clientB2B.updateMany({
                where: { id: row.id, identityKey: null },
                data: { identityKey: group.key },
              });
        written += result.count;
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          races++;
          continue;
        }
        throw error;
      }
    }

    console.log("\n=== HASIL BACKFILL ===");
    console.log(`Ditulis: ${written}`);
    console.log(`Dilewati karena key berbeda: ${skipped}`);
    console.log(`Konflik key paralel: ${races}`);
    console.log(
      `Kelompok lama duplikat yang TIDAK digabung: ${a.collisions.length + b.collisions.length}`,
    );
    console.log(
      "Tidak ada Client, Order, atau Invoice yang digabung maupun dihapus.",
    );
  } finally {
    await prisma.$disconnect();
  }
}

run().catch((error) => {
  console.error(
    "Gagal menjalankan audit/backfill:",
    error instanceof Error ? error.message : error,
  );
  process.exitCode = 1;
});
