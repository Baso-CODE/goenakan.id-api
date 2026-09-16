import { NextFunction, Request, Response } from "express";
import { injectable } from "tsyringe";
import { CloudinaryService } from "../cloudinary/cloudinary.service";

@injectable()
export class UploadController {
  constructor(private readonly cloudinaryService: CloudinaryService) {}

  public getSignature = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      // 1. Ambil nama folder dari query URL (?folder=namanya)
      // Jika kosong, kita pakai "general"
      const folder = (req.query.folder as string) || "general";

      // 2. Panggil service dengan parameter folder
      const signatureData = this.cloudinaryService.generateSignature(folder);

      // 3. Kirim respon sukses ke Frontend
      res.status(200).json({
        success: true,
        data: signatureData,
      });
    } catch (error) {
      next(error);
    }
  };
}
