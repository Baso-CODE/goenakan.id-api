import { NextFunction, Request, Response } from "express";
import { injectable } from "tsyringe";
import { ArticleService } from "./article.service";
import { CreateArticleDTO, UpdateArticleDTO } from "./dto/article.dto";

@injectable()
export class ArticleController {
  constructor(private readonly articleService: ArticleService) {}

  // === UPLOAD IMAGE UNTUK TIPTAP EDITOR ===
  uploadTiptapImage = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const file = req.file as Express.Multer.File;
      const result = await this.articleService.uploadTiptapImage(file);

      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  };

  // =========================================================================
  // 1. CREATE ARTICLE
  // =========================================================================
  createArticle = async (req: Request, res: Response, next: NextFunction) => {
    console.log("========== CREATE ARTICLE ==========");

    try {
      const data: CreateArticleDTO = req.body;

      const files = req.files as
        | { [fieldname: string]: Express.Multer.File[] }
        | undefined;

      const coverFile = files?.coverFile?.[0];
      const coverMobileFile = files?.coverMobileFile?.[0];

      console.log("User:", (req as any).user?.email);

      console.log("Cover Desktop:", {
        exists: !!coverFile,
        name: coverFile?.originalname,
        mime: coverFile?.mimetype,
        size: coverFile?.size,
      });

      console.log("Cover Mobile:", {
        exists: !!coverMobileFile,
        name: coverMobileFile?.originalname,
        mime: coverMobileFile?.mimetype,
        size: coverMobileFile?.size,
      });

      console.log("===================================");

      if (typeof data.published === "string") {
        data.published = data.published === "true";
      }

      if (typeof data.productIds === "string") {
        data.productIds = (data.productIds as string)
          .split(",")
          .filter(Boolean); // filter(Boolean) untuk membuang string kosong
      }

      if (typeof data.tagIds === "string") {
        data.tagIds = (data.tagIds as string).split(",").filter(Boolean);
      }

      if (typeof data.seo === "string") {
        try {
          data.seo = JSON.parse(data.seo);
        } catch (e) {
          console.warn("Gagal parsing JSON SEO");
        }
      }

      const authorId = (req as any).user?.id;

      if (!authorId) {
        return res
          .status(401)
          .json({ message: "Unauthorized. Author ID is missing." });
      }

      // ✨ TAMBAHAN 3: Meneruskan coverMobileFile ke Service
      const result = await this.articleService.createArticle(
        data,
        authorId,
        coverFile,
        coverMobileFile,
      );
      res.status(201).send(result);
    } catch (error) {
      next(error);
    }
  };

  // =========================================================================
  // 2. UPDATE ARTICLE
  // =========================================================================
  updateArticle = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const data: UpdateArticleDTO = req.body;

      // ✨ TAMBAHAN 1: Menangkap multiple files dari Multer
      const files = req.files as
        | { [fieldname: string]: Express.Multer.File[] }
        | undefined;

      const coverFile = files?.coverFile?.[0];
      const coverMobileFile = files?.coverMobileFile?.[0];

      // ✨ Parsing tipe data boolean
      if (typeof data.published === "string") {
        data.published = data.published === "true";
      }

      // ✨ Parsing tipe data array (productIds)
      if (typeof data.productIds === "string") {
        data.productIds = (data.productIds as string)
          .split(",")
          .filter(Boolean);
      }

      // ✨ TAMBAHAN 2: Parsing tipe data array (tagIds)
      if (typeof data.tagIds === "string") {
        data.tagIds = (data.tagIds as string).split(",").filter(Boolean);
      }

      // ✨ TAMBAHAN 3: Meneruskan coverMobileFile ke Service
      const updatedArticle = await this.articleService.updateArticle(
        id,
        data,
        coverFile,
        coverMobileFile, // File mobile masuk ke parameter ke-4
      );

      res.status(200).send(updatedArticle);
    } catch (error) {
      next(error);
    }
  };

  // === GET ALL ARTICLES (Pagination & Filter) ===
  getAllArticles = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, take, search, categoryId, published } = req.query;

      const articles = await this.articleService.getAllArticles({
        page: page ? Number(page) : 1,
        take: take ? Number(take) : 10,
        search: search as string,
        categoryId: categoryId as string,
        published: published as string | boolean | undefined,
      });

      res.status(200).json(articles);
    } catch (error) {
      next(error);
    }
  };

  // === GET ARTICLE BY ID (BACKOFFICE) ===
  getArticleById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const article = await this.articleService.getArticleById(id);

      res.status(200).send(article);
    } catch (error) {
      next(error);
    }
  };

  // === GET ARTICLE BY SLUG (PUBLIC/FRONTEND) ===
  getArticleBySlug = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { slug } = req.params;
      const article = await this.articleService.getArticleBySlug(slug);

      res.status(200).send(article);
    } catch (error) {
      next(error);
    }
  };

  // === DELETE ARTICLE ===
  deleteArticle = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const result = await this.articleService.deleteArticle(id);

      res.status(200).send({
        message: "Article successfully deleted",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  // === GET PUBLIC ARTICLE LIST ===
  getArticleList = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, take, search, categoryName, sort } = req.query;

      const queryParams = {
        page: page ? parseInt(page as string, 10) : undefined,
        take: take ? parseInt(take as string, 10) : undefined,
        search: search as string,
        categoryName: categoryName as string,
        sort: sort as "newest" | "older",
      };

      const result =
        await this.articleService.getArticleListPublic(queryParams);

      res.status(200).json({
        message: "Public articles fetched successfully",
        data: result.data,
        meta: result.meta,
      });
    } catch (error) {
      next(error);
    }
  };

  // === GET ARTICLE SIMPLE LIST ===
  getArticleSimpleList = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const result = await this.articleService.getArticleSimpleList();
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };
}
