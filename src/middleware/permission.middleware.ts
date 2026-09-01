import { NextFunction, Request, Response } from "express";

export const autoVerifyPermission = (customModuleName?: string) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const user = (req as any).user;

      // 🔍 DEBUG UTAMA: Cek apakah user dan permissions-nya terbawa di request
      if (!user) {
        console.warn(
          "⚠️ [PERMISSION WARNING] Objek `req.user` kosong! Pastikan middleware NextAuth sudah berjalan sebelum middleware ini.",
        );
        res
          .status(401)
          .json({ message: "Unauthorized: User session not found in request" });
        return;
      }

      // 1. Jika Super Admin, langsung loloskan tanpa syarat
      if (user?.role === "SUPER_ADMIN" || user?.roleName === "SUPER_ADMIN") {
        return next();
      }

      // 2. Tentukan aksi berdasarkan HTTP Method
      const method = req.method;
      let action = "read";
      if (method === "POST") action = "create";
      else if (method === "PUT" || method === "PATCH") action = "update";
      else if (method === "DELETE") action = "delete";

      // 3. Ekstrak nama modul dari rute induk (URL)
      const baseUrlSegments = (req.baseUrl || "").split("/").filter(Boolean);
      const baseModule =
        baseUrlSegments.length > 0
          ? baseUrlSegments[baseUrlSegments.length - 1]
          : "";

      const pathSegments = req.path.split("/").filter(Boolean);
      let rawModule = customModuleName || baseModule || pathSegments[0] || "";

      // A. Pecah kata berdasarkan tanda hubung (-) atau underscore (_)
      const rawWords = rawModule.split(/[-_]/).filter(Boolean);

      // B. Hapus akhiran jamak (s / ies) pada setiap kata
      const words = rawWords.map((w) => {
        if (w.endsWith("ies")) return w.slice(0, -3) + "y";
        if (w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
        return w;
      });

      // C. Buat kombinasi tebakan nama yang mungkin ada di database
      const directModule = words.join("_");
      const reversedModule = [...words].reverse().join("_");
      const lastWordModule = words[words.length - 1];

      // D. Susun tebakan Permission Lengkap
      const possiblePermissions = [
        `${action}_${directModule}`,
        `${action}_${reversedModule}`,
        `${action}_${lastWordModule}`,
      ];

      // Ambil daftar permissions dari user (mendukung berbagai format properti)
      const userPermissions: string[] =
        user?.permissions || user?.role?.permissions || [];

      // 4. Periksa apakah user memiliki MINIMAL SALAH SATU dari kemungkinan tersebut
      const hasPermission = possiblePermissions.some((perm) =>
        userPermissions.includes(perm),
      );

      // --- LOG DEBUG DETAIL (Akan muncul di terminal Backend) ---
      // console.log(`\n--------------------------------------------------`);
      // console.log(`🔍 [PERMISSION CHECK]`);
      // console.log(
      //   `📂 URL Diakses        : ${req.method} ${req.baseUrl}${req.path}`,
      // );
      // console.log(
      //   `🎯 Yang Dibutuhkan    : Salah satu dari [${possiblePermissions.join(", ")}]`,
      // );
      // console.log(`🔑 Permissions User   :`, userPermissions);
      // console.log(
      //   `🛡️  Status Akses       : ${hasPermission ? "DIIZINKAN ✅" : "DITOLAK (403) ❌"}`,
      // );
      // console.log(`--------------------------------------------------\n`);

      if (!hasPermission) {
        res.status(403).json({
          message: `Forbidden: You don't have permission. Required one of: ${possiblePermissions.join(", ")}`,
        });
        return;
      }

      return next();
    } catch (error) {
      console.error("Error in autoVerifyPermission middleware:", error);
      res
        .status(500)
        .json({ message: "Internal server error in permission validation" });
    }
  };
};
