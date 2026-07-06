import { Router } from "express";
import { autoInjectable } from "tsyringe";
import { WilayahController } from "./wilayah.controller";

@autoInjectable()
export class WilayahRouter {
  private readonly router: Router = Router();

  constructor(private readonly wilayahController: WilayahController) {
    this.initializeRoutes();
  }

  private initializeRoutes = (): void => {
    this.router.get("/provinces", this.wilayahController.getProvinces);

    this.router.get(
      "/regencies/:provinceCode",
      this.wilayahController.getRegencies,
    );

    this.router.get(
      "/districts/:regencyCode",
      this.wilayahController.getDistricts,
    );

    this.router.get(
      "/villages/:districtCode",
      this.wilayahController.getVillages,
    );
  };

  getRouter(): Router {
    return this.router;
  }
}
