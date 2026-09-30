import compression from "compression";
import cookieParser from "cookie-parser";
import cors from "cors";
import "dotenv/config";
import express, { json } from "express";
import helmet from "helmet";
import "reflect-metadata";
import { container } from "tsyringe";
import { env } from "./config";

import { errorMiddleware } from "./middleware/error.middleware";

import {
  authLimiter,
  globalLimiter,
  publicLimiter,
} from "./middleware/rateLimiter.middleware";

import { AnalyticsRouter } from "./modules/admin/analytics/analytics.router";
import { CashflowRouter } from "./modules/admin/cashflow/cashflow.router";
import { ClientRouter } from "./modules/admin/client/client.router";
import { ContactMessageRouter } from "./modules/admin/contact-message/contact-message.router";
import { CurrencyRouter } from "./modules/admin/currency/currency.router";
import { DepartmentRouter } from "./modules/admin/department/department.router";
import { FinanceRouter } from "./modules/admin/finance/finance.router";
import { LogisticsRouter } from "./modules/admin/inbound-outbound/logistic.router";
import { InvoiceRouter } from "./modules/admin/invoice/invoice.router";
import { NoteRouter } from "./modules/admin/notes-invoice/notes.router";
import { ShipmentNoteCategoryRouter } from "./modules/admin/notes-shipment/notesShipmentCategory.router";
import { OrderRouter } from "./modules/admin/order/order.router";
import { AttributeRouter } from "./modules/admin/product/attributes-product/attributes.router";
import { ProductCategoryRouter } from "./modules/admin/product/category-product/categoryProduct.router";
import { ItemCategoryRouter } from "./modules/admin/product/item-category-product/item-category.router";
import { ItemNameRouter } from "./modules/admin/product/item-names-product/item-names.router";
import { ProductRouter } from "./modules/admin/product/master-product/product.router";
import { MaterialTypeRouter } from "./modules/admin/product/material-type-product/material-type.router";
import { SupplierCogsRouter } from "./modules/admin/product/supplier-cogs/supplier-cogs.router";
import { ProductTagRouter } from "./modules/admin/product/tags-product/tags.router";
import { PurchaseChannelRouter } from "./modules/admin/purchase-channel/purchaseChannel.router";
import { PurchaseOrderRouter } from "./modules/admin/purchase-order/purchaseOrder.router";
import { QuotationNoteCategoryRouter } from "./modules/admin/quotation/quotation-note-category/quotationNoteCategory.router";
import { QuotationRouter } from "./modules/admin/quotation/quotation.router";
import { ReplacementOrderRouter } from "./modules/admin/replacement-order/replacementOrder.router";
import { RoleRouter } from "./modules/admin/roles/roles.router";
import { SalesRouter } from "./modules/admin/sales/sales.router";
import { UserRouter } from "./modules/admin/user/userManagement.router";
import { VendorCategoryRouter } from "./modules/admin/vendor/category-vendor/categoryVendor.router";
import { ItemVendorRouter } from "./modules/admin/vendor/item-vendor/itemVendor.router";
import { ContactPlatformRouter } from "./modules/admin/vendor/platform/platform.route";
import { VendorRouter } from "./modules/admin/vendor/vendo-master/vendor.router";
import { PrismaService } from "./modules/prisma/prisma.service";
import { CustomerAddressRouter } from "./modules/web-clients/address/customer-address.router";

import { syncPermissionsToDatabase } from "./helpers/syncPermissions";
import { ArticleRouter } from "./modules/admin/content/article/article.router";
import { ArticleBannerRouter } from "./modules/admin/content/article/banner-article/articleBanner.router";
import { ArticleCategoryRouter } from "./modules/admin/content/article/category-article/articleCategory.router";
import { ArticleSeoRouter } from "./modules/admin/content/article/seo/articleSEO.router";
import { BannerProductRouter } from "./modules/admin/content/banner-product/banner-product.router";
import { PopupBannerRouter } from "./modules/admin/content/banner/banner.router";
import { BestPriceGuaranteeRouter } from "./modules/admin/content/best-pric-guarantee/bestPriceGuarantee.router";
import { BrandClientRouter } from "./modules/admin/content/brand-client/brandClient.router";
import { ClientLogoRouter } from "./modules/admin/content/clien-logo/clientLogo.router";
import { EventCategoryRouter } from "./modules/admin/content/event-category/event-category.router";
import { FaqRouter } from "./modules/admin/content/faq/faq.router";
import { HeroRouter } from "./modules/admin/content/hero/hero.router";
import { PolicyRouter } from "./modules/admin/content/policy/policy.router";
import { PortfolioRouter } from "./modules/admin/content/portfolio/portfolio.router";
import { AppSettingRouter } from "./modules/admin/content/setting/setting.router";
import { SuccessStoryRouter } from "./modules/admin/content/success-story/successStory.router";
import { SampleHistoryRouter } from "./modules/admin/sampleHistory/sampleHistory.router";
import { UploadRouter } from "./modules/upload/upload.router";
import { AuthWebClientRouter } from "./modules/web-clients/auth-client/auth-client.router";
import { CartRouter } from "./modules/web-clients/cart/cart.router";
import { CustomerProfileRouter } from "./modules/web-clients/customer-profile/customer-profile.router";
import { TrackingRouter } from "./modules/web-clients/tracking/tracking.router";
import { WebOrderRouter } from "./modules/web-clients/web-order/web-order.router";
import { WhatsappCronService } from "./modules/whatsapp/notification/whatsapp-cron.service";
import { WhatsappRouter } from "./modules/whatsapp/whatsapp.routes";
import { WhatsappService } from "./modules/whatsapp/whatsapp.service";
import { WilayahRouter } from "./modules/wilayah/wilayah.router";
import { initializeCronJobs } from "./utils/cron";
export default class App {
  public app;

  constructor() {
    this.app = express();
    container.registerSingleton(WhatsappService);
    container.registerSingleton(WhatsappCronService);
    this.configure();
    this.routes();
    this.handleError();
  }

  private configure(): void {
    this.app.set("trust proxy", 1);
    this.app.use(compression());
    this.app.use(helmet());

    this.app.use(globalLimiter);
    this.app.use(
      cors({
        origin: true,
        credentials: true,
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allowedHeaders: [
          "Content-Type",
          "Authorization",
          "X-Requested-With",
          "x-country",
        ],
      }),
    );

    this.app.use(json({ limit: "50mb" }));
    this.app.use(cookieParser());
  }
  private routes(): void {
    const categoryVendorRouter = container.resolve(VendorCategoryRouter);
    const itemVendorRouter = container.resolve(ItemVendorRouter);
    const vendorRouter = container.resolve(VendorRouter);
    const contactPlatformRouter = container.resolve(ContactPlatformRouter);
    const clientRouter = container.resolve(ClientRouter);
    const producCategorytRouter = container.resolve(ProductCategoryRouter);
    const producTagRouter = container.resolve(ProductTagRouter);
    const supplierCogsRouter = container.resolve(SupplierCogsRouter);
    const producAttributesRouter = container.resolve(AttributeRouter);
    const producRouter = container.resolve(ProductRouter);
    const itemCategoryRouter = container.resolve(ItemCategoryRouter);
    const itemNamesRouter = container.resolve(ItemNameRouter);
    const materialTypeRouter = container.resolve(MaterialTypeRouter);
    const salesRouter = container.resolve(SalesRouter);
    const departmentRouter = container.resolve(DepartmentRouter);
    const purchaseChannelRouter = container.resolve(PurchaseChannelRouter);
    const orderRouter = container.resolve(OrderRouter);
    const invoiceRouter = container.resolve(InvoiceRouter);
    const cashflowRouter = container.resolve(CashflowRouter);
    const noteRouter = container.resolve(NoteRouter);
    const logisticsRouter = container.resolve(LogisticsRouter);
    const notesShipmentCategoryRouter = container.resolve(
      ShipmentNoteCategoryRouter,
    );
    const faqsRouter = container.resolve(FaqRouter);
    const policyRouter = container.resolve(PolicyRouter);
    const bestPriceGuaranteeRouter = container.resolve(
      BestPriceGuaranteeRouter,
    );
    const heroRouter = container.resolve(HeroRouter);
    const quotationRouter = container.resolve(QuotationRouter);
    const bannerRouter = container.resolve(PopupBannerRouter);
    const clientLogoRouter = container.resolve(ClientLogoRouter);
    const appSettingRouter = container.resolve(AppSettingRouter);
    const currencyRouter = container.resolve(CurrencyRouter);
    const quotationNoteCategoryRouter = container.resolve(
      QuotationNoteCategoryRouter,
    );
    const financeRouter = container.resolve(FinanceRouter);
    const categoryArticleRouter = container.resolve(ArticleCategoryRouter);
    const articleBannerRouter = container.resolve(ArticleBannerRouter);
    const articleRouter = container.resolve(ArticleRouter);
    const articleSeoRouter = container.resolve(ArticleSeoRouter);
    const brandClientRouter = container.resolve(BrandClientRouter);
    const portfolioRouter = container.resolve(PortfolioRouter);
    const contactMessageRouter = container.resolve(ContactMessageRouter);
    const cartRouter = container.resolve(CartRouter);
    const authWebClientRouter = container.resolve(AuthWebClientRouter);
    const customAddressRouter = container.resolve(CustomerAddressRouter);
    const customerProfileRouter = container.resolve(CustomerProfileRouter);
    const webOrderRouter = container.resolve(WebOrderRouter);
    const eventCategoryRouter = container.resolve(EventCategoryRouter);
    const bannerProductRouter = container.resolve(BannerProductRouter);
    const analyticsRouter = container.resolve(AnalyticsRouter);
    const purchaseOrderRouter = container.resolve(PurchaseOrderRouter);
    const userRouter = container.resolve(UserRouter);
    const roleRouter = container.resolve(RoleRouter);
    const wilayahRouter = container.resolve(WilayahRouter);
    const whatsappRouter = container.resolve(WhatsappRouter);
    const replacementOrderRouter = container.resolve(ReplacementOrderRouter);
    const trackingRouter = container.resolve(TrackingRouter);
    const sampleHistoryRouter = container.resolve(SampleHistoryRouter);
    const sucessStoryRouter = container.resolve(SuccessStoryRouter);
    const uploadRouter = container.resolve(UploadRouter);

    this.app.get("/", (_, res) => {
      res.send("Welcome");
    });

    this.app.use("/vendors", vendorRouter.getRouter());
    this.app.use("/vendor-categories", categoryVendorRouter.getRouter());
    this.app.use("/vendor-items", itemVendorRouter.getRouter());
    this.app.use("/contact-platforms", contactPlatformRouter.getRouter());
    this.app.use("/clients", clientRouter.getRouter());
    this.app.use("/product-categories", producCategorytRouter.getRouter());
    this.app.use("/product-attributes", producAttributesRouter.getRouter());
    this.app.use("/product-tags", producTagRouter.getRouter());
    this.app.use("/supplier-cogs", supplierCogsRouter.getRouter());
    this.app.use("/products", producRouter.getRouter());
    this.app.use("/item-categories", itemCategoryRouter.getRouter());
    this.app.use("/item-names", itemNamesRouter.getRouter());
    this.app.use("/material-types", materialTypeRouter.getRouter());
    this.app.use("/sales", salesRouter.getRouter());
    this.app.use("/departments", departmentRouter.getRouter());
    this.app.use("/purchase-channels", purchaseChannelRouter.getRouter());
    this.app.use("/orders", orderRouter.getRouter());
    this.app.use("/invoices", invoiceRouter.getRouter());
    this.app.use("/cashflows", cashflowRouter.getRouter());
    this.app.use("/invoice-notes", noteRouter.getRouter());
    this.app.use("/logistics", logisticsRouter.getRouter());
    this.app.use("/quotations", quotationRouter.getRouter());
    this.app.use("/content/popup-banners", bannerRouter.getRouter());
    this.app.use("/content/faqs", faqsRouter.getRouter());
    this.app.use("/content/policies", policyRouter.getRouter());
    this.app.use(
      "/content/best-price-guarantee",
      bestPriceGuaranteeRouter.getRouter(),
    );
    this.app.use("/content/heros", heroRouter.getRouter());
    this.app.use("/content/client-logos", clientLogoRouter.getRouter());
    this.app.use("/app-settings", appSettingRouter.getRouter());
    this.app.use("/currencies", currencyRouter.getRouter());
    this.app.use(
      "/shipment-notes-categories",
      notesShipmentCategoryRouter.getRouter(),
    );
    this.app.use(
      "/quotation-notes-categories",
      quotationNoteCategoryRouter.getRouter(),
    );
    this.app.use("/finance", financeRouter.getRouter());
    this.app.use("/article-categories", categoryArticleRouter.getRouter());
    this.app.use("/articles-banners", articleBannerRouter.getRouter());
    this.app.use("/articles", publicLimiter, articleRouter.getRouter());
    this.app.use("/article-seo", articleSeoRouter.getRouter());
    this.app.use("/brand-clients", brandClientRouter.getRouter());
    this.app.use("/portfolios", publicLimiter, portfolioRouter.getRouter());
    this.app.use("/contact-messages", contactMessageRouter.getRouter());
    this.app.use("/cart", cartRouter.getRouter());
    this.app.use(
      "/auth-web-client",
      authLimiter,
      authWebClientRouter.getRouter(),
    );
    this.app.use("/addresses", customAddressRouter.getRouter());
    this.app.use("/customer-profile", customerProfileRouter.getRouter());
    this.app.use("/web-orders", publicLimiter, webOrderRouter.getRouter());
    this.app.use(
      "/event-categories",
      publicLimiter,
      eventCategoryRouter.getRouter(),
    );
    this.app.use("/banner-products", bannerProductRouter.getRouter());
    this.app.use("/analytics", analyticsRouter.getRouter());
    this.app.use("/purchase-orders", purchaseOrderRouter.getRouter());
    this.app.use("/users", userRouter.getRouter());
    this.app.use("/roles", roleRouter.getRouter());
    this.app.use("/wilayah", wilayahRouter.getRouter());
    this.app.use("/whatsapp", whatsappRouter.getRouter());
    this.app.use("/replacement-orders", replacementOrderRouter.getRouter());
    this.app.use("/tracking", trackingRouter.getRouter());
    this.app.use("/sample-history", sampleHistoryRouter.getRouter());
    this.app.use("/success-story", sucessStoryRouter.getRouter());
    this.app.use("/uploads", uploadRouter.getRouter());
  }
  private handleError(): void {
    this.app.use(errorMiddleware);
  }
  public async start(): Promise<void> {
    try {
      const prismaService = container.resolve(PrismaService);
      // matikan kalau sudah di deploy
      await syncPermissionsToDatabase(prismaService);
      console.log("✅ Sinkronisasi permissions berhasil dijalankan!");
    } catch (error) {
      console.error("❌ Gagal menjalankan sinkronisasi permissions:", error);
    }

    // Melanjutkan menyalakan server Express
    this.app.listen(env().PORT, () => {
      console.log(`  ➜  [API] Local:   http://localhost:${env().PORT}`);
      try {
        initializeCronJobs();
      } catch (error) {
        console.error("❌ Gagal menginisialisasi Cron Jobs:", error);
      }
    });
  }
}
