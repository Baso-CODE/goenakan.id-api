import { NextFunction, Request, Response } from "express";
import { injectable } from "tsyringe";

import {
  CreateEventCategoryDTO,
  UpdateEventCategoryDTO,
} from "./dto/event-category.dto";
import { EventCategoryService } from "./event-category.service";

@injectable()
export class EventCategoryController {
  constructor(private readonly eventCategoryService: EventCategoryService) {}

  // ====================================================================
  // 1. PUBLIC ENDPOINT (Untuk Landing Page / User Publik)
  // ====================================================================
  getPublicEventCategories = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const result = await this.eventCategoryService.getPublicEventCategories();
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  // ====================================================================
  // 2. ADMIN ENDPOINTS (Backoffice)
  // ====================================================================

  // --- GET ALL (Table Admin) ---
  getAllEventCategories = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { page, take, search } = req.query;

      const result = await this.eventCategoryService.getAllEventCategories({
        page: Number(page),
        take: Number(take),
        search: search as string,
      });

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  // --- GET BY ID ---
  getEventCategoryById = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { id } = req.params;
      const result = await this.eventCategoryService.getEventCategoryById(id);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  // --- CREATE ---
  createEventCategory = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const body = req.body as CreateEventCategoryDTO;
      const file = req.file;
      const result = await this.eventCategoryService.createEventCategory(
        body,
        file!,
      );

      res.status(201).json({
        success: true,
        message: "Kategori Event berhasil ditambahkan",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  // --- UPDATE ---
  updateEventCategory = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { id } = req.params;
      const body = req.body as UpdateEventCategoryDTO;
      const file = req.file;

      const result = await this.eventCategoryService.updateEventCategory(
        id,
        body,
        file,
      );

      res.status(200).json({
        success: true,
        message: "Kategori Event berhasil diperbarui",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  // --- DELETE ---
  deleteEventCategory = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { id } = req.params;
      const result = await this.eventCategoryService.deleteEventCategory(id);

      res.status(200).json({
        success: true,
        message: "Kategori Event berhasil dihapus",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };
}
