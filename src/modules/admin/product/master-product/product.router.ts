import { Router } from "express";
import multer from "multer";
import { autoInjectable } from "tsyringe";
import { ProductController } from "./product.controller";

import { debugMiddleware } from "../../../../middleware/debugMiddleware";
import { NextAuthMiddleware } from "../../../../middleware/nextAuth.middleware";
import { parseFormData } from "../../../../middleware/parseFormData.middleware";
import { autoVerifyPermission } from "../../../../middleware/permission.middleware";
import { transformVariantFiles } from "../../../../middleware/transformVariantFiles";
import { validateBody } from "../../../../middleware/validation.middleware";
import { SyncMockupPayloadDto } from "./dto/syncMockups.dto";

const upload = multer({ storage: multer.memoryStorage() });

const productUploadFields = upload.fields([
  { name: "images", maxCount: 10 },
  { name: "videos", maxCount: 3 },
  { name: "variantImages", maxCount: 50 },
  { name: "data", maxCount: 1 },
]);

@autoInjectable()
export class ProductRouter {
  private readonly router: Router = Router();

  constructor(
    private readonly productController: ProductController,
    private readonly nextAuthMiddleware: NextAuthMiddleware,
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes = (): void => {
    // PUBLIC
    this.router.get(
      "/public/filters",
      this.productController.getFIlterProducts,
    );

    this.router.get(
      "/best-sellers",
      this.productController.getBestSellerProducts,
    );

    this.router.get("/order", this.productController.getAllProductsForOrder);

    this.router.get("/public", this.productController.getAllProductsPublic);

    this.router.get(
      "/public/:slug/related",
      this.productController.getRelatedProducts,
    );

    this.router.get(
      "/public/:slug",
      this.productController.getProductBySlugPublic,
    );

    // ADMIN PROTECTED
    this.router.use(this.nextAuthMiddleware.verifyNextAuthToken);
    this.router.use(autoVerifyPermission("product"));

    this.router.get("/", this.productController.getAllProducts);

    this.router.get("/top-selling", this.productController.getTopSelling);

    this.router.get("/export/excel", this.productController.exportProduct);

    this.router.post("/generate-sku", this.productController.generateSku);

    this.router.post(
      "/master-price/batch-preview",
      this.productController.batchPreviewMasterPrice,
    );

    this.router.post(
      "/master-price/batch-update",
      this.productController.batchUpdateMasterPrice,
    );

    this.router.post(
      "/",
      debugMiddleware,
      productUploadFields,
      parseFormData,
      transformVariantFiles,
      this.productController.createProduct,
    );

    this.router.get("/:id/seo", this.productController.getProductSEO);

    this.router.put("/:id/seo", this.productController.updateProductSEO);

    this.router.get("/:id", this.productController.getProductById);

    this.router.patch("/:id", this.productController.updateProductCore);

    this.router.delete("/:id", this.productController.deleteProduct);

    this.router.put(
      "/:id/price-tiers",
      this.productController.updatePriceTiers,
    );

    this.router.put(
      "/:id/master-price",
      this.productController.updateMasterPrice,
    );

    this.router.post(
      "/:id/image",
      upload.single("image"),
      this.productController.addImage,
    );

    this.router.post(
      "/:id/images",
      upload.array("images", 10),
      this.productController.addMultipleImages,
    );

    this.router.patch("/:id/media-order", this.productController.reorderMedia);

    this.router.delete("/image/:imageId", this.productController.deleteImage);

    this.router.patch(
      "/image/:imageId/seo",
      this.productController.updateImageSEO,
    );

    this.router.post(
      "/image/:imageId/color-mask",
      upload.single("colorMask"),
      this.productController.uploadColorMask,
    );

    this.router.put(
      "/image/:imageId/mockups",
      validateBody(SyncMockupPayloadDto),
      this.productController.syncMockupAreas,
    );

    this.router.post("/:id/video", this.productController.addVideo);

    this.router.delete("/video/:videoId", this.productController.deleteVideo);

    this.router.patch(
      "/video/:videoId/seo",
      this.productController.updateVideoSEO,
    );

    this.router.put(
      "/:id/variants",
      upload.fields([{ name: "variantImages", maxCount: 50 }]),
      this.productController.updateProductVariants,
    );

    this.router.put(
      "/:id/attributes",
      this.productController.updateProductAttributes,
    );

    this.router.put(
      "/:id/variants/:variantId/images",
      upload.array("images", 20),
      this.productController.updateVariantImages,
    );
  };

  getRouter(): Router {
    return this.router;
  }
}
