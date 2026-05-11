import { NextFunction, Request, Response } from "express";
import { injectable } from "tsyringe";
import { ArticleSeoDTO } from "../dto/articleSEO.dto";
import { ArticleSeoService } from "./articleSEO.service";

@injectable()
export class ArticleSeoController {
  constructor(private readonly articleSeoService: ArticleSeoService) {}

  // =========================================================================
  // 1. UPSERT ARTICLE SEO (Create jika belum ada, Update jika sudah ada)
  // =========================================================================
  upsertArticleSeo = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { articleId } = req.params;
      const data: ArticleSeoDTO = req.body;

      // Jika dari form-data, terkadang kita perlu parsing data yang masuk,
      // tetapi jika murni JSON dari frontend, langsung kirim saja ke service.

      const result = await this.articleSeoService.upsertArticleSeo(
        articleId,
        data,
      );

      res.status(200).json({
        message: "Article SEO successfully saved",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  // =========================================================================
  // 2. GET SEO BY ARTICLE ID
  // =========================================================================
  getSeoByArticleId = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { articleId } = req.params;
      const seoData = await this.articleSeoService.getSeoByArticleId(articleId);

      // Kita kirim 200 meskipun isinya null, karena tidak adanya SEO bukanlah error mutlak,
      // melainkan berarti user belum mengatur SEO untuk artikel tersebut.
      res.status(200).json({
        message: "Article SEO fetched successfully",
        data: seoData,
      });
    } catch (error) {
      next(error);
    }
  };

  // =========================================================================
  // 3. DELETE ARTICLE SEO
  // =========================================================================
  deleteArticleSeo = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { articleId } = req.params;
      const result = await this.articleSeoService.deleteArticleSeo(articleId);

      res.status(200).json({
        message: "Article SEO successfully deleted",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };
}
