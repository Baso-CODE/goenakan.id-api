import { NextFunction, Request, Response } from "express";
import { autoInjectable } from "tsyringe";
import { CrmTemplateService } from "./crmTemplate.service";

@autoInjectable()
export class CrmTemplateController {
  constructor(private readonly crmTemplateService: CrmTemplateService) {}

  getTemplates = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const templates = await this.crmTemplateService.getTemplates();
      res.status(200).json({
        success: true,
        message: "Berhasil mengambil daftar template pesan",
        data: templates,
      });
    } catch (error) {
      next(error);
    }
  };

  createTemplate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const template = await this.crmTemplateService.createTemplate(req.body);
      res.status(201).json({
        success: true,
        message: "Template pesan berhasil ditambahkan",
        data: template,
      });
    } catch (error) {
      next(error);
    }
  };

  updateTemplate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const template = await this.crmTemplateService.updateTemplate(req.params.id, req.body);
      res.status(200).json({
        success: true,
        message: "Template pesan berhasil diperbarui",
        data: template,
      });
    } catch (error) {
      next(error);
    }
  };

  deleteTemplate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.crmTemplateService.deleteTemplate(req.params.id);
      res.status(200).json({
        success: true,
        message: result.message,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  getCategories = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const categories = await this.crmTemplateService.getCategories();
      res.status(200).json({
        success: true,
        message: "Berhasil mengambil daftar kategori template",
        data: categories,
      });
    } catch (error) {
      next(error);
    }
  };

  createCategory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { name } = req.body;
      const category = await this.crmTemplateService.createCategory(name);
      res.status(201).json({
        success: true,
        message: "Kategori template berhasil ditambahkan",
        data: category,
      });
    } catch (error) {
      next(error);
    }
  };

  updateCategory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { name } = req.body;
      const category = await this.crmTemplateService.updateCategory(req.params.id, name);
      res.status(200).json({
        success: true,
        message: "Kategori template berhasil diperbarui",
        data: category,
      });
    } catch (error) {
      next(error);
    }
  };

  deleteCategory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.crmTemplateService.deleteCategory(req.params.id);
      res.status(200).json({
        success: true,
        message: result.message,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };
}
