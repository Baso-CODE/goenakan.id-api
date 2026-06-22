import { NextFunction, Request, Response } from "express";
import { injectable } from "tsyringe";
import {
  CreatePolicyCategoryDTO,
  UpdatePolicyCategoryDTO,
} from "./dto/policy-category.dto";
import { CreatePolicyDTO, UpdatePolicyDTO } from "./dto/policy.dto";
import { PolicyCategoryService } from "./policy-category.service";
import { PolicyService } from "./policy.service";

@injectable()
export class PolicyController {
  constructor(
    private readonly policyCategoryService: PolicyCategoryService,
    private readonly policyService: PolicyService,
  ) {}

  // =================================================================
  // SECTION 1: POLICY CATEGORIES
  // =================================================================

  createCategory = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.policyCategoryService.createPolicyCategory(
        req.body as CreatePolicyCategoryDTO,
      );
      res.status(201).send(result);
    } catch (error) {
      next(error);
    }
  };

  getAllCategories = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { page, take, search } = req.query;
      const result = await this.policyCategoryService.getAllPolicyCategories({
        page: Number(page),
        take: Number(take),
        search: search as string,
      });
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  updateCategory = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = Number(req.params.id);
      const result = await this.policyCategoryService.updatePolicyCategory(
        id,
        req.body as UpdatePolicyCategoryDTO,
      );
      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  exportCategory = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const excelBuffer =
        await this.policyCategoryService.exportPolicyCategoryToExcel(
          req.query as any,
        );
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="policy-categories-export.xlsx"',
      );
      res.send(excelBuffer);
    } catch (error) {
      next(error);
    }
  };

  // =================================================================
  // SECTION 2: POLICY ITEMS
  // =================================================================

  createPolicy = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.policyService.createPolicy(
        req.body as CreatePolicyDTO,
      );
      res.status(201).send(result);
    } catch (error) {
      next(error);
    }
  };

  getAllPolicies = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, take, search, categoryId } = req.query;
      const result = await this.policyService.getAllPolicies({
        page: Number(page),
        take: Number(take),
        search: search as string,
        categoryId: Number(categoryId),
      });
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  updatePolicy = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = Number(req.params.id);
      const result = await this.policyService.updatePolicy(
        id,
        req.body as UpdatePolicyDTO,
      );
      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  deletePolicy = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = Number(req.params.id);
      await this.policyService.deletePolicy(id);
      res.status(200).json({ message: "Policy deleted successfully" });
    } catch (error) {
      next(error);
    }
  };

  // =================================================================
  // SECTION 3: PUBLIC ENDPOINTS (FRONTEND LOCALIZATION)
  // =================================================================

  // Mengambil semua kategori beserta isi kontennya untuk satu halaman
  getAllCategoriesWithPolicies = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const result = await this.policyService.getAllCategoriesWithPolicies();
      res.status(200).json({ data: result });
    } catch (error) {
      next(error);
    }
  };

  // Mengambil detail berdasarkan slug
  getPolicyBySlug = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { slug } = req.params;
      const result = await this.policyService.getPolicyBySlug(slug);
      res.status(200).json({ data: result });
    } catch (error) {
      next(error);
    }
  };
}
