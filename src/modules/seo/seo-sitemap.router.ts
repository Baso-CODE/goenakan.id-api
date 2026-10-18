import { NextFunction, Request, Response, Router } from "express";
import { injectable } from "tsyringe";
import { PrismaService } from "../prisma/prisma.service";

@injectable()
export class SeoSitemapRouter {
  private readonly router: Router = Router();

  constructor(private readonly prisma: PrismaService) {
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    this.router.get(
      "/",
      async (_req: Request, res: Response, next: NextFunction) => {
        try {
          const [products, articles] = await Promise.all([
            this.prisma.product.findMany({
              where: {
                isActive: true,
                category: {
                  is: {
                    isActive: true,
                  },
                },
              },
              select: {
                slug: true,
                updatedAt: true,
                name_en: true,
                description_en: true,
              },
              orderBy: {
                updatedAt: "desc",
              },
            }),
            this.prisma.article.findMany({
              where: {
                published: true,
                category: {
                  is: {
                    isActive: true,
                  },
                },
                NOT: {
                  seo: {
                    is: {
                      robots: {
                        contains: "noindex",
                      },
                    },
                  },
                },
              },
              select: {
                slug: true,
                updatedAt: true,
                isTranslated: true,
                title_en: true,
                content_en: true,
              },
              orderBy: {
                updatedAt: "desc",
              },
            }),
          ]);

          const productEntries = products.map((product) => {
            const hasEnglishContent =
              Boolean(product.name_en?.trim()) &&
              Boolean(product.description_en?.trim());

            return {
              slug: product.slug,
              updatedAt: product.updatedAt,
              locales: hasEnglishContent ? ["id", "en"] : ["id"],
            };
          });

          const articleEntries = articles.map((article) => {
            const hasEnglishContent =
              article.isTranslated &&
              Boolean(article.title_en?.trim()) &&
              Boolean(article.content_en?.trim());

            return {
              slug: article.slug,
              updatedAt: article.updatedAt,
              locales: hasEnglishContent ? ["id", "en"] : ["id"],
            };
          });

          res.setHeader("Cache-Control", "public, max-age=60, s-maxage=300");

          res.status(200).json({
            products: productEntries,
            articles: articleEntries,
          });
        } catch (error) {
          next(error);
        }
      },
    );
  }

  getRouter(): Router {
    return this.router;
  }
}
