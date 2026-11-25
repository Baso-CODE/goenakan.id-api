import { Prisma, OrderStatus, SalesCategory } from "@prisma/client";

type DB = Pick<Prisma.TransactionClient, "user" | "quotation" | "order">;

/** Creator and signer are independent from the owner. */
export async function resolveInitialSalesOwner(db: DB, actorId?: string | null) {
  if (!actorId) return null;
  const actor = await db.user.findUnique({
    where: { id: actorId },
    select: { id: true, role: { select: { name: true } } },
  });
  return actor?.role.name === "ADMIN_SALES" ? actor.id : null;
}

/** Inherit consistent references; never guess when references conflict. */
export async function resolveOrderSalesOwner(db: DB, input: {
  actorId?: string | null;
  clientId: string;
  referenceQuotationId?: string | null;
  referenceSampleId?: string | null;
}) {
  const { actorId, clientId, referenceQuotationId, referenceSampleId } = input;
  if (!referenceQuotationId && !referenceSampleId) {
    return resolveInitialSalesOwner(db, actorId);
  }
  const owners = new Set<string>();
  if (referenceQuotationId) {
    const quotation = await db.quotation.findUnique({
      where: { id: referenceQuotationId },
      select: { clientId: true, salesUserId: true, status: true },
    });
    if (!quotation || quotation.clientId !== clientId || quotation.status === "CANCELLED") return null;
    if (quotation.salesUserId) owners.add(quotation.salesUserId);
  }
  if (referenceSampleId) {
    const sample = await db.order.findUnique({
      where: { id: referenceSampleId },
      select: { clientId: true, salesUserId: true, salesCategory: true, status: true },
    });
    if (!sample || sample.clientId !== clientId || sample.salesCategory !== SalesCategory.SAMPLE || sample.status === OrderStatus.CANCELLED) return null;
    if (sample.salesUserId) owners.add(sample.salesUserId);
  }
  return owners.size === 1 ? [...owners][0] : null;
}
