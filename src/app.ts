import cookieParser from "cookie-parser";
import cors from "cors";
import express, { json } from "express";
import helmet from "helmet";
import "reflect-metadata";
import { container } from "tsyringe";
import { env } from "./config";

import { errorMiddleware } from "./middleware/error.middleware";
import { AuthRouter } from "./modules/auth/auth.router";
import { CashflowRouter } from "./modules/cashflow/cashflow.router";
import { ClientRouter } from "./modules/client/client.router";
import { PopupBannerRouter } from "./modules/content/banner/banner.router";
import { ClientLogoRouter } from "./modules/content/clientLogo/clientLogo.router";
import { FaqRouter } from "./modules/content/faq/faq.router";
import { HeroRouter } from "./modules/content/hero/hero.router";
import { AppSettingRouter } from "./modules/content/setting/setting.router";
import { CurrencyRouter } from "./modules/currency/currency.router";
import { DepartmentRouter } from "./modules/department/department.router";
import { LogisticsRouter } from "./modules/iboundOutbound/logistic.router";
import { InvoiceRouter } from "./modules/invoice/invoice.router";
import { NoteRouter } from "./modules/notes/notes.router";
import { OrderRouter } from "./modules/order/order.router";
import { AttributeRouter } from "./modules/product/attributes/attributes.router";
import { ProductCategoryRouter } from "./modules/product/category/categoryProduct.router";
import { ProductRouter } from "./modules/product/masterProduct/product.router";
import { PurchaseChannelRouter } from "./modules/purchaseChannel/purchaseChannel.router";
import { QuotationRouter } from "./modules/quotation/quotation.router";
import { SalesRouter } from "./modules/sales/sales.router";
import { VendorCategoryRouter } from "./modules/vendor/categoryVendor/categoryVendor.router";
import { ItemVendorRouter } from "./modules/vendor/itemVendor/itemVendor.router";
import { ContactPlatformRouter } from "./modules/vendor/platform/platform.route";
import { VendorRouter } from "./modules/vendor/vendorMaster/vendor.router";
export default class App {
  public app;

  constructor() {
    this.app = express();
    this.configure();
    this.routes();
    this.handleError();
  }

  private configure(): void {
    this.app.use(helmet());
    this.app.use(cors());
    this.app.use(json());
    this.app.use(cookieParser());
  }

  private routes(): void {
    const authRouter = container.resolve(AuthRouter);
    const categoryVendorRouter = container.resolve(VendorCategoryRouter);
    const itemVendorRouter = container.resolve(ItemVendorRouter);
    const vendorRouter = container.resolve(VendorRouter);
    const contactPlatformRouter = container.resolve(ContactPlatformRouter);
    const clientRouter = container.resolve(ClientRouter);
    const producCategorytRouter = container.resolve(ProductCategoryRouter);
    const producAttributesRouter = container.resolve(AttributeRouter);
    const producRouter = container.resolve(ProductRouter);
    const salesRouter = container.resolve(SalesRouter);
    const departmentRouter = container.resolve(DepartmentRouter);
    const purchaseChannelRouter = container.resolve(PurchaseChannelRouter);
    const orderRouter = container.resolve(OrderRouter);
    const invoiceRouter = container.resolve(InvoiceRouter);
    const cashflowRouter = container.resolve(CashflowRouter);
    const noteRouter = container.resolve(NoteRouter);
    const logisticsRouter = container.resolve(LogisticsRouter);
    const faqsRouter = container.resolve(FaqRouter);
    const heroRouter = container.resolve(HeroRouter);
    const quotationRouter = container.resolve(QuotationRouter);
    const bannerRouter = container.resolve(PopupBannerRouter);
    const clientLogoRouter = container.resolve(ClientLogoRouter);
    const appSettingRouter = container.resolve(AppSettingRouter);
    const currencyRouter = container.resolve(CurrencyRouter);

    this.app.get("/", (_, res) => {
      res.send("Welcome");
    });

    this.app.use("/auth", authRouter.getRouter());
    this.app.use("/vendors", vendorRouter.getRouter());
    this.app.use("/vendor-categories", categoryVendorRouter.getRouter());
    this.app.use("/vendor-items", itemVendorRouter.getRouter());
    this.app.use("/contact-platforms", contactPlatformRouter.getRouter());
    this.app.use("/clients", clientRouter.getRouter());
    this.app.use("/product-categories", producCategorytRouter.getRouter());
    this.app.use("/product-attributes", producAttributesRouter.getRouter());
    this.app.use("/products", producRouter.getRouter());
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
    this.app.use("/content/heros", heroRouter.getRouter());
    this.app.use("/content/client-logos", clientLogoRouter.getRouter());
    this.app.use("/app-settings", appSettingRouter.getRouter());
    this.app.use("/currencies", currencyRouter.getRouter());
  }
  private handleError(): void {
    this.app.use(errorMiddleware);
  }

  public start(): void {
    this.app.listen(env().PORT, () => {
      console.log(`  ➜  [API] Local:   http://localhost:${env().PORT}`);
    });
  }
}
