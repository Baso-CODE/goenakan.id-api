import { NextFunction, Request, Response } from "express";
import { autoInjectable } from "tsyringe";
import {
  CompleteProductionDTO,
  CreateProductionDTO,
} from "./dto/createProduction.dto";
import { ProductionService } from "./production.service";

@autoInjectable()
export class ProductionController {
  constructor(private readonly productionService: ProductionService) {}

  // POST /production/start
  start = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const dto = req.body as CreateProductionDTO;
      const result = await this.productionService.startProduction(dto);

      res.status(201).json({
        message: "Production started successfully",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  // PATCH /production/:id/complete
  complete = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const dto = req.body as CompleteProductionDTO;

      const result = await this.productionService.completeProduction(id, dto);

      res.status(200).json({
        message: "Production marked as completed",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };
}
