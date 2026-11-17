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
      const status = req.query.status as string | undefined;
      const assignedTo = req.query.assignedTo as string | undefined;
      const search = req.query.search as string | undefined;
      const sourceCode = req.query.sourceCode as string | undefined;
      const page = req.query.page ? Number(req.query.page) : 1;
      const limit = req.query.limit ? Number(req.query.limit) : 20;

      // Ambil ID user dari session NextAuth jika ada
      const currentUserId = (req as any).user?.id || (req as any).session?.user?.id;

      const result = await this.crmLeadService.getLeads({
        status,
        assignedTo,
        currentUserId,
        search,
        sourceCode,
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

  syncFromWa = async (req: Request, res: Response): Promise<void> => {
    try {
      const sessionId = req.body?.sessionId || (req.query?.sessionId as string);
      const result = await this.crmLeadService.syncLeadsFromWa(sessionId);

      res.status(200).json({
        success: true,
        message: `Sinkronisasi berhasil: ${result.synced} lead diproses (${result.created} baru, ${result.updated} diperbarui, ${result.ignored} diabaikan).`,
        data: result,
      });
    } catch (error: any) {
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Gagal menyinkronkan data dari WhatsApp",
      });
    }
  };

  batchSync = async (req: Request, res: Response): Promise<void> => {
    try {
      const chats = req.body?.chats;
      if (!Array.isArray(chats)) {
        res.status(400).json({
          success: false,
          message: "Parameter chats harus berupa array",
        });
        return;
      }

      const result = await this.crmLeadService.batchSyncChats(chats);

      res.status(200).json({
        success: true,
        message: `Sinkronisasi berhasil: ${result.synced} lead diproses (${result.created} baru, ${result.updated} diperbarui).`,
        data: result,
      });
    } catch (error: any) {
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Gagal menyinkronkan chat",
      });
    }
  };

  claimLead = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const currentUserId = (req as any).user?.id || (req as any).session?.user?.id;
      if (!currentUserId) {
        res.status(401).json({ success: false, message: "User tidak terautentikasi" });
        return;
      }

      const data = await this.crmLeadService.claimLead(id, currentUserId);
      res.status(200).json({
        success: true,
        message: "Lead berhasil diklaim",
        data,
      });
    } catch (error: any) {
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Gagal mengklaim lead",
      });
    }
  };

  assignLead = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { assignedToUserId } = req.body;

      const data = await this.crmLeadService.assignLead(id, assignedToUserId || null);
      res.status(200).json({
        success: true,
        message: "Penugasan lead berhasil diperbarui",
        data,
      });
    } catch (error: any) {
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Gagal menugaskan lead",
      });
    }
  };

  updateStatus = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      const data = await this.crmLeadService.updateStatus(id, status);
      res.status(200).json({
        success: true,
        message: "Status lead berhasil diperbarui",
        data,
      });
    } catch (error: any) {
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Gagal memperbarui status lead",
      });
    }
  };

  updateLabels = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { labels } = req.body;

      const data = await this.crmLeadService.updateLabels(id, labels || []);
      res.status(200).json({
        success: true,
        message: "Label lead berhasil diperbarui",
        data,
      });
    } catch (error: any) {
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Gagal memperbarui label lead",
      });
    }
  };

  getNotes = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const data = await this.crmLeadService.getNotes(id);
      res.status(200).json({
        success: true,
        data,
      });
    } catch (error: any) {
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Gagal mengambil catatan lead",
      });
    }
  };

  addNote = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { content } = req.body;
      const currentUserId = (req as any).user?.id || (req as any).session?.user?.id;
      if (!currentUserId) {
        res.status(401).json({ success: false, message: "User tidak terautentikasi" });
        return;
      }

      const data = await this.crmLeadService.addNote(id, currentUserId, content);
      res.status(201).json({
        success: true,
        message: "Catatan berhasil ditambahkan",
        data,
      });
    } catch (error: any) {
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Gagal menambahkan catatan",
      });
    }
  };

  deleteNote = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id, noteId } = req.params;
      await this.crmLeadService.deleteNote(id, noteId);
      res.status(200).json({
        success: true,
        message: "Catatan berhasil dihapus",
      });
    } catch (error: any) {
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Gagal menghapus catatan",
      });
    }
  };

  getCsUsers = async (_req: Request, res: Response): Promise<void> => {
    try {
      const data = await this.crmLeadService.getCsUsers();
      res.status(200).json({
        success: true,
        data,
      });
    } catch (error: any) {
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Gagal mengambil daftar user CS",
      });
    }
  };
}
