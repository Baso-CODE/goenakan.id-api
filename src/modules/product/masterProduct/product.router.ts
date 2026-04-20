// product/product.router.ts
import { Router } from "express";
import { autoInjectable } from "tsyringe";
import { ProductController } from "./product.controller";

import multer from "multer";
import { debugMiddleware } from "../../../middleware/debugMiddleware";
import { NextAuthMiddleware } from "../../../middleware/nextAuth.middleware";
import { parseFormData } from "../../../middleware/parseFormData.middleware";
import { verifyRole } from "../../../middleware/role.middleware";
import { transformVariantFiles } from "../../../middleware/transformVariantFiles";

const upload = multer({ storage: multer.memoryStorage() });

// Konfigurasi Multer untuk multiple fields (gambar dan video)
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
    const requiredRole = ["SUPER_ADMIN"];
    const auth = this.nextAuthMiddleware.verifyNextAuthToken;

    // GET ALL PRODUCTS
    this.router.get(
      "/",
      auth,
      verifyRole(requiredRole),
      this.productController.getAllProducts,
    );

    // GET ALL PRODUCTS PUBLIC
    this.router.get("/public", this.productController.getAllProductsPublic);
    this.router.get(
      "/best-sellers",
      this.productController.getBestSellerProducts,
    );

    // GET ALL PRODUCTS FOR ORDER
    this.router.get(
      "/order",
      // auth,
      // verifyRole(requiredRole),
      this.productController.getAllProductsForOrder,
    );

    this.router.get(
      "/top-selling",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.productController.getTopSelling,
    );

    // GET PRODUCT BY ID
    this.router.get(
      "/:id",
      auth,
      verifyRole(requiredRole),
      this.productController.getProductById,
    );

    this.router.post(
      "/",
      auth,
      verifyRole(requiredRole),
      debugMiddleware,
      productUploadFields,
      parseFormData,
      transformVariantFiles,
      // validateBody(CreateProductDTO), // Anda dapat mengaktifkan ini setelah validasi data berhasil
      this.productController.createProduct,
    );

    this.router.patch(
      "/:id",
      auth,
      verifyRole(requiredRole),
      this.productController.updateProductCore,
    );

    // DELETE PRODUCT
    this.router.delete(
      "/:id",
      auth,
      verifyRole(requiredRole),
      this.productController.deleteProduct,
    );

    this.router.put(
      "/:id/price-tiers",
      auth,
      verifyRole(requiredRole),
      this.productController.updatePriceTiers,
    );

    // === MEDIA ===
    this.router.post(
      "/:id/image",
      auth,
      verifyRole(requiredRole),
      upload.single("image"),
      this.productController.addImage,
    );
    this.router.delete(
      "/image/:imageId",
      auth,
      verifyRole(requiredRole),
      this.productController.deleteImage,
    );

    this.router.patch(
      "/image/:imageId/seo",
      auth,
      verifyRole(requiredRole),
      this.productController.updateImageSEO,
    );

    this.router.post(
      "/:id/video",
      auth,
      verifyRole(requiredRole),
      this.productController.addVideo,
    );
    this.router.delete(
      "/video/:videoId",
      auth,
      verifyRole(requiredRole),
      this.productController.deleteVideo,
    );
    this.router.patch(
      "/video/:videoId/seo",
      auth,
      verifyRole(requiredRole),
      this.productController.updateVideoSEO,
    );

    this.router.put(
      "/:id/variants",
      upload.fields([{ name: "variantImages", maxCount: 50 }]),
      auth,
      verifyRole(requiredRole),
      this.productController.updateProductVariants,
    );

    // UPDATE PRODUCT ATTRIBUTES
    this.router.put(
      "/:id/attributes",
      auth,
      verifyRole(requiredRole),
      this.productController.updateProductAttributes,
    );

    this.router.put(
      "/:id/variants/:variantId/images",
      upload.array("images", 20),
      auth,
      verifyRole(requiredRole),
      this.productController.updateVariantImages,
    );

    this.router.get(
      "/export/excel",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.productController.exportProduct,
    );

    this.router.put(
      "/:id/seo",
      this.nextAuthMiddleware.verifyNextAuthToken,
      // validationMiddleware(UpdateProductSeoDTO),
      this.productController.updateProductSEO,
    );

    this.router.get(
      "/:id/seo",
      this.nextAuthMiddleware.verifyNextAuthToken,
      this.productController.getProductSEO,
    );
    this.router.post(
      "/generate-sku",
      this.nextAuthMiddleware.verifyNextAuthToken,
      this.productController.generateSku,
    );
  };

  getRouter(): Router {
    return this.router;
  }
}
