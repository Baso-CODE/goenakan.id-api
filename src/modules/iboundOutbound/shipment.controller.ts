import { NextFunction, Request, Response } from "express";
import { autoInjectable } from "tsyringe";

import { CreateShipmentDTO } from "./dto/createShipment.dto";
import {
  AddShipmentHistoryDTO,
  UpdateShipmentInfoDTO,
} from "./dto/updateShipment.dto";
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

  // PATCH /shipments/:id/status
  // (Dulu markArrived, sekarang lebih general untuk semua step tracking)
  addHistory = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const dto = req.body as AddShipmentHistoryDTO;

      const result = await this.shipmentService.addShipmentHistory(id, dto);

      res.status(200).json({
        message: "Shipment status/history updated successfully",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  // PATCH /shipments/:id/info
  // (Endpoint BARU: Untuk edit resi/kurir jika ada typo, tanpa nambah history)
  updateInfo = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const dto = req.body as UpdateShipmentInfoDTO;

      const result = await this.shipmentService.updateShipmentInfo(id, dto);

      res.status(200).json({
        message: "Shipment information updated successfully",
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
      // Perhatikan nama method di service sudah berubah
      const result =
        await this.shipmentService.getShipmentHistoryByOrder(orderId);

      res.status(200).json({
        message: "Shipment list retrieved",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  // GET /shipments/:id
  getOne = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const result = await this.shipmentService.getShipmentById(id);

      res.status(200).json({
        message: "Shipment details retrieved",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };
}
