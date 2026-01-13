import { NextFunction, Request, Response } from "express";
import { autoInjectable } from "tsyringe";

import { CreateShipmentDTO } from "./dto/createShipment.dto";
import { MarkShipmentArrivedDTO } from "./dto/updateShipment.dto";
import { ShipmentService } from "./shipment.service";

@autoInjectable()
export class ShipmentController {
  constructor(private readonly shipmentService: ShipmentService) {}

  // POST /shipments
  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const dto = req.body as CreateShipmentDTO;
      const result = await this.shipmentService.createShipment(dto);

      res.status(201).json({
        message: "Shipment created successfully",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  // PATCH /shipments/:id/arrive
  markArrived = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const dto = req.body as MarkShipmentArrivedDTO;

      const result = await this.shipmentService.markShipmentArrived(id, dto);

      res.status(200).json({
        message: "Shipment marked as arrived",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  // GET /shipments/order/:orderId
  getHistoryByOrder = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { orderId } = req.params;
      const result = await this.shipmentService.getShipmentHistory(orderId);

      res.status(200).json({
        message: "Shipment history retrieved",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };
}
