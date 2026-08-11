import { NextFunction, Request, Response } from "express";

export const autoVerifyPermission = (customModuleName?: string) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const user = (req as any).user;

      // 1. Jika Super Admin, langsung loloskan tanpa syarat
      if (user?.role === "SUPER_ADMIN") {
        return next();
      }

      // 2. Tentukan aksi berdasarkan HTTP Method
      const method = req.method;
      let action = "read";
      if (method === "POST") action = "create";
      else if (method === "PUT" || method === "PATCH") action = "update";
      else if (method === "DELETE") action = "delete";

      // 3. Ambil nama modul dari URL atau customModuleName
      // Kita hanya mengganti tanda hubung (-) menjadi underscore (_) tanpa memotong huruf apa pun.
      const baseUrl = req.baseUrl || "";
      const pathSegments = req.path.split("/").filter(Boolean);
      let rawModule =
        customModuleName || pathSegments[0] || baseUrl.split("/").pop() || "";

      const moduleName = rawModule.replace(/-/g, "_");

      // Susun nama permission murni sesuai standar database (Contoh: read_order, read_purchase_order)
      const requiredPermission = `${action}_${moduleName}`;

      const userPermissions: string[] = user?.permissions || [];

      // 4. Periksa apakah user memiliki permission tersebut di dalam sesinya
      const hasPermission = userPermissions.includes(requiredPermission);

      if (!hasPermission) {
        res.status(403).json({
          message: `Forbidden: You don't have permission to ${requiredPermission}`,
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
