import { Request } from "express";

// Hapus import { Role } dari "@prisma/client" karena tidak lagi digunakan di sini

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: string; // 👈 Ubah dari Role menjadi string
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}
