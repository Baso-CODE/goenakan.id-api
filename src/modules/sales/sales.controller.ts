import { NextFunction, Request, Response } from "express";
import { injectable } from "tsyringe";
import { CloudinaryService } from "../cloudinary/cloudinary.service";
import { CreateSalesBankDTO, CreateSalesDTO } from "./dto/createSales.dto";
import { UpdateSalesDTO } from "./dto/updateSales.dto";
import { SalesExportQuery, SalesService } from "./sales.service";
@injectable()
export class SalesController {
  constructor(
    private readonly salesService: SalesService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  // === CREATE SALES ===
  createSales = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data: CreateSalesDTO = req.body;
      const file: Express.Multer.File | undefined = req.file;
      const result = await this.salesService.createSales(data, file);
      res.status(201).send(result);
    } catch (error) {
      next(error);
    }
  };

  // === GET ALL SALES ===
  getAllSales = async (req: Request, res: Response, next: NextFunction) => {
    try {
      // 🔥 Ekstrak startDate dan endDate dari req.query
      const { page, take, search, isActive, startDate, endDate } = req.query;

      const sales = await this.salesService.getAllSales({
        page: Number(page),
        take: Number(take),
        search: search as string,
        isActive: isActive as string,
        startDate: startDate as string,
        endDate: endDate as string,
      });
      res.status(200).json(sales);
    } catch (error) {
      next(error);
    }
  };

  // === GET ALL SALES FOR ORDER ===
  getAllSalesForOrder = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const salesList = await this.salesService.getAllSalesForOrder();
      res.status(200).json(salesList);
    } catch (error) {
      next(error);
    }
  };

  // === GET SALES BY ID ===
  getSalesById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const sales = await this.salesService.getSalesById(id);

      res.status(200).send(sales);
    } catch (error) {
      next(error);
    }
  };

  updateSales = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      let data: UpdateSalesDTO = req.body;

      if (req.file) {
        const file = req.file as Express.Multer.File;

        const existingSales = await this.salesService.getSalesById(id);

        if (existingSales.signatureUrl) {
          try {
            await this.cloudinaryService.remove(existingSales.signatureUrl);
          } catch (deleteError) {
            console.warn(
              "⚠️ Gagal menghapus foto lama di Cloudinary:",
              deleteError,
            );
          }
        }

        // B. UPLOAD TANDA TANGAN BARU
        const uploadResult = await this.cloudinaryService.upload(file);

        data.signatureUrl = uploadResult.secure_url;
        data.signaturePublicId = uploadResult.public_id;
      } else if (data.signatureUrl === null) {
      }

      // 2. Lanjutkan proses update ke service
      const updatedSales = await this.salesService.updateSales(id, data);

      res.status(200).send(updatedSales);
    } catch (error) {
      next(error);
    }
  };

  // === UPDATE SALES BANK ACCOUNT ===
  updateSalesBankAccount = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { id } = req.params;
      const data: CreateSalesBankDTO[] = req.body;

      const updatedSales = await this.salesService.updateSalesBankAccounts(
        id,
        data,
      );

      res.status(200).send(updatedSales);
    } catch (error) {
      next(error);
    }
  };

  // === DELETE SALES ===
  deleteSales = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const result = await this.salesService.deleteSales(id);
      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  // === TOGGLE ACTIVE / INACTIVE ===
  toggleActive = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const vendor = await this.salesService.toggleActive(id);
      res.status(200).send(vendor);
    } catch (error) {
      next(error);
    }
  };

  exportSales = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = req.query as unknown as SalesExportQuery;
      const excelBuffer = await this.salesService.exportSalesToExcel(query);

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="data-vendor-master-export.xlsx"',
      );
      res.send(excelBuffer);
    } catch (error) {
      next(error);
    }
  };
}
