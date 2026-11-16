import { CrmCustomCodeType } from "@prisma/client";
import { Request, Response } from "express";
import { autoInjectable } from "tsyringe";
import { CustomCodeService } from "./customCode.service";
import { CreateCustomCodeDTO } from "./dto/createCustomCode.dto";
import { UpdateCustomCodeDTO } from "./dto/updateCustomCode.dto";

@autoInjectable()
export class CustomCodeController {
  constructor(private readonly customCodeService: CustomCodeService) {}

  getAll = async (req: Request, res: Response): Promise<void> => {
    try {
      const type = req.query.type as CrmCustomCodeType | undefined;
      const search = req.query.search as string | undefined;

      const data = await this.customCodeService.getAll(type, search);

      res.status(200).json({
        success: true,
        data,
      });
    } catch (error: any) {
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Gagal mengambil data custom code",
      });
    }
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const data = await this.customCodeService.getById(id);

      res.status(200).json({
        success: true,
        data,
      });
    } catch (error: any) {
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Gagal mengambil detail custom code",
      });
    }
  };

  create = async (req: Request, res: Response): Promise<void> => {
    try {
      const dto = req.body as CreateCustomCodeDTO;
      const data = await this.customCodeService.create(dto);

      res.status(201).json({
        success: true,
        message: "Kode kustom berhasil dibuat",
        data,
      });
    } catch (error: any) {
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Gagal membuat custom code",
      });
    }
  };

  update = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const dto = req.body as UpdateCustomCodeDTO;
      const data = await this.customCodeService.update(id, dto);

      res.status(200).json({
        success: true,
        message: "Kode kustom berhasil diperbarui",
        data,
      });
    } catch (error: any) {
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Gagal memperbarui custom code",
      });
    }
  };

  delete = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      await this.customCodeService.delete(id);

      res.status(200).json({
        success: true,
        message: "Kode kustom berhasil dinonaktifkan",
      });
    } catch (error: any) {
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Gagal menonaktifkan custom code",
      });
    }
  };
}
