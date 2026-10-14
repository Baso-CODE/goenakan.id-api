import countryToCurrency from "country-to-currency";
import { NextFunction, Request, Response } from "express";
import { injectable } from "tsyringe";
import { CreateProductDTO } from "./dto/createProduct.dto";
import { ProductSeoDTO } from "./dto/productSEO.dto";
import { UpdateProductAttributesDTO } from "./dto/updateAttributes.dto";
import { UpdateProductCoreDTO } from "./dto/updateProduct.dto";
import { UpdateProductImageDTO } from "./dto/updateProductImage.dto";
import { UpdateProductVideoDTO } from "./dto/updateProductVideo.dto";
import {
  UpdateProductVariantFiles,
  UpdateProductVariantsDTO,
} from "./dto/updateVariantsProduct.dto";
import { ProductExportQuery, ProductService } from "./product.service";

// Tipe untuk req.files dari multer.fields
interface ProductFiles {
  images?: Express.Multer.File[];
  videos?: Express.Multer.File[];
  variantImages?: {
    [variantIndex: number]: Express.Multer.File[];
  };
}

@injectable()
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  // === CREATE PRODUCT ===
  createProduct = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data: CreateProductDTO = req.body;

      const files: ProductFiles = (req.files as unknown as ProductFiles) || {};

      const result = await this.productService.createProduct(data, files);
      res.status(201).send(result);
    } catch (error) {
      next(error);
    }
  };

  // === GET ALL PRODUCTS ===
  getAllProducts = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, take, search, categoryId, isCustom, startDate, endDate } =
        req.query;

      const products = await this.productService.getAllProducts({
        page: page ? Number(page) : 1,
        take: take ? Number(take) : 10,
        search: search as string,
        categoryId: categoryId as string,
        startDate: startDate as string,
        endDate: endDate as string,
        isCustom:
          typeof isCustom === "string" ? isCustom === "true" : undefined,
      });

      res.status(200).json(products);
    } catch (error) {
      next(error);
    }
  };

  // === GET ALL PRODUCTS (CONTROLLER) ===
  getAllProductsPublic = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const {
        page,
        take,
        search,
        categoryId,
        isCustom,
        category,
        itemCategory,
        itemName,
        minPrice,
        maxPrice,
        availability,
        sort,
        attributes,
        country,
        lang,
      } = req.query;

      let targetCurrency = "IDR";

      if (country && typeof country === "string") {
        const countryCode = country.toUpperCase();

        if (countryCode === "ID") {
          targetCurrency = "IDR";
        } else {
          const autoCurrency =
            countryToCurrency[countryCode as keyof typeof countryToCurrency];
          targetCurrency = autoCurrency || "USD";
        }
      }

      // console.log("Target Currency hasil kalkulasi:", targetCurrency);

      // Teruskan parameter beserta targetCurrency dan lang ke Service
      const products = await this.productService.getAllProductsPublic({
        page: page ? Number(page) : undefined,
        take: take ? Number(take) : undefined,
        search: search as string,
        categoryId: categoryId as string,
        isCustom:
          typeof isCustom === "string" ? isCustom === "true" : undefined,
        category: category as string,
        itemCategory: itemCategory as string,
        itemName: itemName as string,
        minPrice: minPrice as string,
        maxPrice: maxPrice as string,
        availability: availability as string,
        sort: sort as string,
        attributes: attributes as string,
        targetCurrency,
        lang: (lang as string) || "id", //  3. Teruskan lang ke service
      });

      res.status(200).json(products);
    } catch (error) {
      next(error);
    }
  };

  // === GET PRODUCT BY ID ===
  getProductById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const product = await this.productService.getProductById(id);

      res.status(200).send(product);
    } catch (error) {
      next(error);
    }
  };

  // === UPDATE CORE PRODUCT DATA ===
  updateProductCore = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { id } = req.params;
      const data: UpdateProductCoreDTO = req.body;

      // Catatan: Media/Attributes/Tiers di-update di endpoint terpisah untuk menghindari kompleksitas
      const updatedProduct = await this.productService.updateProductCore(
        id,
        data,
      );

      res.status(200).send(updatedProduct);
    } catch (error) {
      next(error);
    }
  };

  // === DELETE PRODUCT ===
  deleteProduct = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const result = await this.productService.deleteProduct(id);
      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  // === UPDATE PRICE TIERS ===
  updatePriceTiers = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { id } = req.params;
      const data = req.body;
      const updated = await this.productService.updatePriceTiers(id, data);
      res.status(200).send(updated);
    } catch (error) {
      next(error);
    }
  };

  // === UPDATE MASTER PRICE ===
  updateMasterPrice = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { id } = req.params;
      const data = req.body;
      const updated = await this.productService.updateMasterPrice(id, data);
      res.status(200).send(updated);
    } catch (error) {
      next(error);
    }
  };

  // === BATCH PREVIEW MASTER PRICE ===
  batchPreviewMasterPrice = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const data = req.body;
      const preview = await this.productService.previewBatchPrices(data);
      res.status(200).send(preview);
    } catch (error) {
      next(error);
    }
  };

  // === BATCH UPDATE MASTER PRICE ===
  batchUpdateMasterPrice = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const data = req.body;
      const result = await this.productService.updateBatchPrices(data);
      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  // === ADD IMAGE ===
  addImage = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const file = req.file as Express.Multer.File;
      const metadata = req.body;
      const image = await this.productService.addImage(id, file, metadata);
      res.status(201).send(image);
    } catch (error) {
      next(error);
    }
  };

  // === ADD MULTIPLE IMAGES ===
  addMultipleImages = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { id } = req.params;
      const files = req.files as Express.Multer.File[];
      const metadataList = req.body.metadataList
        ? typeof req.body.metadataList === "string"
          ? JSON.parse(req.body.metadataList)
          : req.body.metadataList
        : undefined;

      const updated = await this.productService.addMultipleImages(
        id,
        files,
        metadataList,
      );
      res.status(201).send(updated);
    } catch (error) {
      next(error);
    }
  };

  // === REORDER MEDIA ===
  reorderMedia = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { type, orderedIds } = req.body;
      const updated = await this.productService.reorderMedia(
        id,
        type,
        orderedIds,
      );
      res.status(200).send(updated);
    } catch (error) {
      next(error);
    }
  };

  // === DELETE IMAGE ===
  deleteImage = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { imageId } = req.params;
      const result = await this.productService.deleteImage(imageId);
      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  // === UPLOAD COLOR MASK ===
  uploadColorMask = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { imageId } = req.params;
      const file = req.file as Express.Multer.File;
      const result = await this.productService.uploadColorMask(imageId, file);
      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  // === ADD VIDEO (UPDATED FOR DIRECT UPLOAD) ===
  addVideo = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      const payload = req.body;

      const video = await this.productService.addVideo(id, payload);

      res.status(201).send(video);
    } catch (error) {
      next(error);
    }
  };

  // === DELETE VIDEO ===
  deleteVideo = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { videoId } = req.params;
      const result = await this.productService.deleteVideo(videoId);
      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  // === GET ALL PRODUCTS FOR ORDER ===
  getAllProductsForOrder = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const query = {
        categoryId: req.query.categoryId as string | undefined,
        isCustom: req.query.isCustom as string | undefined,
      };
      const products = await this.productService.getAllProductsForOrder(query);
      res.status(200).json(products);
    } catch (error) {
      next(error);
    }
  };

  // === UPDATE PRODUCT ATTRIBUTES ===
  updateProductAttributes = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const dto: UpdateProductAttributesDTO = {
        productId: req.params.id,
        attributeValueIds: req.body.attributeValueIds,
        priceModifiers: req.body.priceModifiers,
        weights: req.body.weights,
        widths: req.body.widths,
        heights: req.body.heights,
        lengths: req.body.lengths,
        orderedAttributeIds: req.body.orderedAttributeIds,
        orderedAttributeValueIds: req.body.orderedAttributeValueIds,
      };

      const result = await this.productService.updateProductAttributes(dto);
      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  // === UPDATE PRODUCT VARIANTS (GENERAL) ===
  updateProductVariants = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      // data JSON berada pada req.body.data
      const dto: UpdateProductVariantsDTO = JSON.parse(req.body.data);

      // cast files
      const files = req.files as unknown as UpdateProductVariantFiles;

      const result = await this.productService.updateProductVariants(
        dto,
        files,
      );

      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  // === UPDATE VARIANT IMAGES ONLY ===
  updateVariantImages = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { id: productId, variantId } = req.params;

      // metadata dikirim sebagai JSON string pada field "metadata"
      const metadata = JSON.parse(req.body.metadata);

      // files datang dari multer.fields -> req.files.images[]
      const files = {
        images: (req.files as any)?.images || [],
      };

      const result = await this.productService.updateVariantImages(
        productId,
        variantId,
        metadata,
        files,
      );

      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  exportProduct = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = req.query as unknown as ProductExportQuery;
      const excelBuffer =
        await this.productService.exportProductsToExcel(query);

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="data-vendor-master-export${new Date().toISOString().slice(0, 10)}.xlsx"`,
      );
      res.send(excelBuffer);
    } catch (error) {
      next(error);
    }
  };

  updateImageSEO = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { imageId } = req.params;
      const data: UpdateProductImageDTO = req.body;

      const updatedImage = await this.productService.updateProductImageSEO(
        imageId,
        data,
      );

      res.status(200).send(updatedImage);
    } catch (error) {
      next(error);
    }
  };

  updateVideoSEO = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { videoId } = req.params;
      const data: UpdateProductVideoDTO = req.body;

      const updatedVideo = await this.productService.updateProductVideoSEO(
        videoId,
        data,
      );

      res.status(200).send(updatedVideo);
    } catch (error) {
      next(error);
    }
  };

  // === UPDATE/CREATE SEO ===
  updateProductSEO = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { id } = req.params;
      const data: ProductSeoDTO = req.body;

      const result = await this.productService.upsertProductSEO(id, data);

      res.status(200).send({
        message: "Product SEO data updated successfully",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  // === GET SEO DATA ===
  getProductSEO = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const result = await this.productService.getProductSEO(id);
      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  // === GENERATE SKU CONTROLLER ===
  generateSku = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const {
        productName,
        categoryId,
        itemCategoryId,
        itemNameId,
        materialTypeId,
      } = req.body;

      const sku = await this.productService.generateSku({
        productName,
        categoryId,
        itemCategoryId,
        itemNameId,
        materialTypeId,
      });

      res.status(200).json({ sku });
    } catch (error) {
      next(error);
    }
  };

  getTopSelling = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { limit, startDate, endDate } = req.query;

      const result = await this.productService.getTopSellingProducts({
        limit: limit ? Number(limit) : 5,
        startDate: startDate as string,
        endDate: endDate as string,
      });

      res.status(200).json({ data: result });
    } catch (error) {
      next(error);
    }
  };

  // === GET BEST SELLER PRODUCTS ===
  // === GET BEST SELLER PRODUCTS ===
  getBestSellerProducts = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { country, lang } = req.query;

      // 1. Tentukan mata uang default
      let targetCurrency = "IDR";

      // 2. Konversi country menjadi mata uang yang sesuai
      if (country && typeof country === "string") {
        const countryCode = country.toUpperCase();
        if (countryCode === "ID") {
          targetCurrency = "IDR";
        } else {
          const autoCurrency =
            countryToCurrency[countryCode as keyof typeof countryToCurrency];
          targetCurrency = autoCurrency || "USD"; // Fallback ke USD jika tidak ditemukan
        }
      }

      // 3. Panggil service dengan mengirimkan targetCurrency dan lang
      const result = await this.productService.getBestSellerProducts(
        targetCurrency,
        typeof lang === "string" ? lang : "id",
      );

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  // === GET PRODUCT BY SLUG (PUBLIC) ===
  getProductBySlugPublic = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { slug } = req.params;
      const { country, lang } = req.query;

      //  DEBUGGING: Cek data apa yang masuk dari frontend
      // console.log("🔍 [DEBUG DETAIL PRODUCT] Slug:", slug);
      // console.log("🔍 [DEBUG DETAIL PRODUCT] Country from Query:", country);
      // console.log("🔍 [DEBUG DETAIL PRODUCT] Lang from Query:", lang);

      let targetCurrency = "IDR";
      if (country && typeof country === "string") {
        const countryCode = country.toUpperCase();
        if (countryCode === "ID") {
          targetCurrency = "IDR";
        } else {
          const autoCurrency =
            countryToCurrency[countryCode as keyof typeof countryToCurrency];
          targetCurrency = autoCurrency || "USD";
        }
      }

      console.log(
        "🔍 [DEBUG DETAIL PRODUCT] Target Currency Result:",
        targetCurrency,
      );

      const product = await this.productService.getProductBySlugPublic(
        slug,
        targetCurrency,
        typeof lang === "string" ? lang : "id",
      );

      res.status(200).json({
        success: true,
        data: product,
      });
    } catch (error) {
      next(error);
    }
  };

  // === GET RELATED PRODUCTS ===
  getRelatedProducts = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { slug } = req.params;
      const related = await this.productService.getRelatedProducts(slug);

      res.status(200).json({
        success: true,
        data: related,
      });
    } catch (error) {
      next(error);
    }
  };

  // === GET FILTER PRODUCTS ===
  getFIlterProducts = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const lang = (req.query.lang as string) || "id";

      const result = await this.productService.getProductFilterOptions(lang);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  // === SYNC MOCKUP AREAS FOR IMAGE ===
  syncMockupAreas = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { imageId } = req.params;
      const data = req.body;
      const result = await this.productService.syncMockupAreas(imageId, data);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };
}
