import { Prisma } from "@prisma/client";

import { ApiError } from "../../../utils/api-error";

type SignerDatabase = Pick<Prisma.TransactionClient, "user">;

export type DocumentSignerSnapshot = {
  signerUserId: string;
  signerName: string;
  signerSignatureUrl: string | null;
};

export async function resolveDocumentSigner(
  prisma: SignerDatabase,
  actorUserId: string,
  requestedSignerUserId?: string | null,
): Promise<DocumentSignerSnapshot> {
  if (!actorUserId) {
    throw new ApiError("Unauthorized", 401);
  }

  const actor = await prisma.user.findUnique({
    where: { id: actorUserId },
    select: {
      id: true,
      role: {
        select: { name: true },
      },
    },
  });

  if (!actor) {
    throw new ApiError("User pembuat tidak ditemukan.", 401);
  }

  const signerUserId = requestedSignerUserId?.trim() || actor.id;

  const isSuperAdmin = actor.role.name === "SUPER_ADMIN";

  // User biasa tidak boleh memilih orang lain.
  if (!isSuperAdmin && signerUserId !== actor.id) {
    throw new ApiError(
      "Hanya Super Admin yang dapat memilih penandatangan lain.",
      403,
    );
  }

  const signer = await prisma.user.findUnique({
    where: { id: signerUserId },
    select: {
      id: true,
      name: true,
      signatureUrl: true,
      role: {
        select: { name: true },
      },
    },
  });

  if (!signer) {
    throw new ApiError("Penandatangan tidak ditemukan.", 404);
  }

  // Super Admin hanya bisa memilih user administratif
  // yang ditetapkan sebagai penandatangan.
  if (
    signer.id !== actor.id &&
    !["SUPER_ADMIN", "ADMIN_SALES"].includes(signer.role.name)
  ) {
    throw new ApiError(
      "Penandatangan harus memiliki role ADMIN_SALES atau SUPER_ADMIN.",
      400,
    );
  }

  if (!signer.name?.trim()) {
    throw new ApiError("Nama penandatangan belum tersedia.", 400);
  }

  return {
    signerUserId: signer.id,
    signerName: signer.name.trim(),
    signerSignatureUrl: signer.signatureUrl ?? null,
  };
}
