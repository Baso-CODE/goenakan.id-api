import { CrmLeadStatus } from "@prisma/client";
import { Request, Response } from "express";
import { autoInjectable } from "tsyringe";
import { CrmLeadService } from "./crmLead.service";
import { LinkCustomerDTO } from "./dto/linkCustomer.dto";
import { UpdateLeadNameDTO } from "./dto/updateLeadName.dto";

@autoInjectable()
export class CrmLeadController {
  constructor(private readonly crmLeadService: CrmLeadService) {}

  getLeads = async (req: Request, res: Response): Promise<void> => {
    try {
      const status = req.query.status as CrmLeadStatus | undefined;
      const assignedTo = req.query.assignedTo as string | undefined;
      const search = req.query.search as string | undefined;
      const page = req.query.page ? Number(req.query.page) : 1;
      const limit = req.query.limit ? Number(req.query.limit) : 20;

      // Ambil ID user dari session NextAuth jika ada
      const currentUserId = (req as any).user?.id || (req as any).session?.user?.id;

      const result = await this.crmLeadService.getLeads({
        status,
        assignedTo,
        currentUserId,
        search,
        page,
        limit,
      });

      res.status(200).json({
        success: true,
        ...result,
      });
    } catch (error: any) {
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Gagal mengambil daftar lead",
      });
    }
  };

  getLeadById = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const data = await this.crmLeadService.getLeadById(id);

      res.status(200).json({
        success: true,
        data,
      });
    } catch (error: any) {
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Gagal mengambil detail lead",
      });
    }
  };

  searchCustomers = async (req: Request, res: Response): Promise<void> => {
    try {
      const q = req.query.q as string;
      const data = await this.crmLeadService.searchCustomers(q || "");

      res.status(200).json({
        success: true,
        data,
      });
    } catch (error: any) {
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Gagal mencari profil customer",
      });
    }
  };

  updateName = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { displayName } = req.body as UpdateLeadNameDTO;

      const data = await this.crmLeadService.updateName(id, displayName);

      res.status(200).json({
        success: true,
        message: "Nama lead berhasil diperbarui",
        data,
      });
    } catch (error: any) {
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Gagal memperbarui nama lead",
      });
    }
  };

  linkCustomer = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { customerProfileId } = req.body as LinkCustomerDTO;

      const data = await this.crmLeadService.linkCustomer(id, customerProfileId);

      res.status(200).json({
        success: true,
        message: "Lead berhasil dihubungkan ke data customer ERP",
        data,
      });
    } catch (error: any) {
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Gagal menghubungkan lead ke customer",
      });
    }
  };

  unlinkCustomer = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const data = await this.crmLeadService.unlinkCustomer(id);

      res.status(200).json({
        success: true,
        message: "Tautan lead ke customer berhasil dilepas",
        data,
      });
    } catch (error: any) {
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Gagal melepas tautan customer",
      });
    }
  };
}
