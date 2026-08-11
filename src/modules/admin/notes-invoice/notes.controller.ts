import { NextFunction, Request, Response } from "express";
import { autoInjectable } from "tsyringe";
import { CreateNoteTemplateDTO } from "./dto/createNoteTemplate.dto";
import { UpdateNoteTemplateDTO } from "./dto/updateNoteTemplate.dto";
import { NoteTemplateService } from "./notes.service";

@autoInjectable()
export class NoteTemplateController {
  constructor(private readonly noteTemplateService: NoteTemplateService) {}

  // === GET ALL WITH PAGINATION ===
  getAll = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.noteTemplateService.getAllNoteTemplates(
        req.query as any,
      );
      res.status(200).json({
        message: "Successfully retrieved note templates",
        ...result,
      });
    } catch (error) {
      next(error);
    }
  };

  // === CREATE ===
  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const dto = req.body as CreateNoteTemplateDTO;
      const result = await this.noteTemplateService.createNoteTemplate(dto);
      res.status(201).json({
        message: "Note template created successfully",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  // === GET BY ID ===
  getById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const result = await this.noteTemplateService.getNoteTemplateById(id);
      res.status(200).json({
        message: "Note template retrieved successfully",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  // === GET BY CATEGORY ID (DROPDOWN HELPER) ===
  getByCategory = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { categoryId } = req.params;
      const result =
        await this.noteTemplateService.getTemplatesByCategoryList(categoryId);
      res.status(200).json({
        message: "Templates retrieved successfully",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  // === UPDATE ===
  update = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const dto = req.body as UpdateNoteTemplateDTO;
      const result = await this.noteTemplateService.updateNoteTemplate(id, dto);
      res.status(200).json({
        message: "Note template updated successfully",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  // === DELETE ===
  delete = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const result = await this.noteTemplateService.deleteNoteTemplate(id);
      res.status(200).json({
        message: "Note template deleted successfully",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  // === EXPORT EXCEL ===
  exportExcel = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const buffer = await this.noteTemplateService.exportNoteTemplateToExcel(
        req.query as any,
      );

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.setHeader(
        "Content-Disposition",
        "attachment; filename=Note-Templates.xlsx",
      );

      res.send(buffer);
    } catch (error) {
      next(error);
    }
  };
}
