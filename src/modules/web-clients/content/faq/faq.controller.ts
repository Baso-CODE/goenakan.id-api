import { NextFunction, Request, Response } from "express";
import { injectable } from "tsyringe";
import {
  CreateFaqCategoryDTO,
  UpdateFaqCategoryDTO,
} from "./dto/faq-category.dto";
import { CreateFaqDTO, UpdateFaqDTO } from "./dto/faq.dto";
import {
  FaqCategoryExportQuery,
  FaqCategoryService,
} from "./faq-category.service";
import { FaqExportQuery, FaqService } from "./faq.service";

@injectable()
export class FaqController {
  constructor(
    private readonly faqCategoryService: FaqCategoryService,
    private readonly faqService: FaqService,
  ) {}

  // =================================================================
  // SECTION 1: FAQ CATEGORIES
  // =================================================================

  // === CREATE CATEGORY ===
  createCategory = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as CreateFaqCategoryDTO;
      const result = await this.faqCategoryService.createFaqCategory(body);
      res.status(201).send(result);
    } catch (error) {
      next(error);
    }
  };

  // === GET ALL CATEGORIES (PAGINATION) ===
  getAllCategories = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { page, take, search } = req.query;

      const result = await this.faqCategoryService.getAllFaqCategories({
        page: Number(page),
        take: Number(take),
        search: search as string,
      });

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  // === GET CATEGORY LIST (DROPDOWN) ===
  getCategoryList = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.faqCategoryService.getAllFaqCategoriesList();
      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  // === GET CATEGORY BY ID ===
  getCategoryById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const result = await this.faqCategoryService.getFaqCategoryById(id);
      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  // === UPDATE CATEGORY ===
  updateCategory = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const body = req.body as UpdateFaqCategoryDTO;
      const result = await this.faqCategoryService.updateFaqCategory(id, body);
      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  // === DELETE CATEGORY ===
  deleteCategory = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const result = await this.faqCategoryService.deleteFaqCategory(id);
      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  // === EXPORT CATEGORY ===
  exportCategory = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = req.query as unknown as FaqCategoryExportQuery;
      const excelBuffer =
        await this.faqCategoryService.exportFaqCategoryToExcel(query);

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="faq-categories-export.xlsx"',
      );
      res.send(excelBuffer);
    } catch (error) {
      next(error);
    }
  };

  // =================================================================
  // SECTION 2: FAQ ITEMS (QUESTIONS & ANSWERS)
  // =================================================================

  // === CREATE FAQ ===
  createFaq = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as CreateFaqDTO;
      const result = await this.faqService.createFaq(body);
      res.status(201).send(result);
    } catch (error) {
      next(error);
    }
  };

  // === GET ALL FAQS (PAGINATION) ===
  getAllFaqs = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, take, search, categoryId } = req.query;

      const result = await this.faqService.getAllFaqs({
        page: Number(page),
        take: Number(take),
        search: search as string,
        categoryId: categoryId as string,
      });

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  // === GET FAQ BY ID ===
  getFaqById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const result = await this.faqService.getFaqById(id);
      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  // === UPDATE FAQ ===
  updateFaq = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const body = req.body as UpdateFaqDTO;
      const result = await this.faqService.updateFaq(id, body);
      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  // === DELETE FAQ ===
  deleteFaq = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const result = await this.faqService.deleteFaq(id);
      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  // === EXPORT FAQ ===
  exportFaq = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = req.query as unknown as FaqExportQuery;
      const excelBuffer = await this.faqService.exportFaqToExcel(query);

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="faq-items-export.xlsx"',
      );
      res.send(excelBuffer);
    } catch (error) {
      next(error);
    }
  };

  // =================================================================
  // SECTION 3: PUBLIC ENDPOINTS (CLIENT/FRONTEND)
  // =================================================================

  // === GET FAQ FOR LANDING PAGE (FEATURED ONLY) ===
  getLandingPageFaqs = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { take } = req.query;
      const result = await this.faqService.getLandingPageFaqs(
        take ? Number(take) : undefined,
      );

      res.status(200).json({ data: result });
    } catch (error) {
      next(error);
    }
  };

  // === GET FAQ FOR MAIN PAGE (NON-FEATURED, WITH PAGINATION & CATEGORY) ===
  getMainPageFaqs = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, take, categoryId } = req.query;

      const result = await this.faqService.getMainPageFaqs({
        page: Number(page),
        take: Number(take),
        categoryId: categoryId as string,
      });

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };
}
