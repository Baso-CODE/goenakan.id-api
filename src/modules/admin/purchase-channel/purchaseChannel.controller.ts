import { Request, Response, NextFunction } from "express";
import { injectable } from "tsyringe";

import { PurchaseChannelService } from "./purchaseChannel.service";
import { CreatePurchaseChannelDTO } from "./dto/createPurchaseChannel.dto";
import { UpdatePurchaseChannelDTO } from "./dto/udpatepurchaseChannel.dto";

@injectable()
export class PurchaseChannelController {
  constructor(
    private readonly purchaseChannelService: PurchaseChannelService,
  ) {}

  // === CREATE PURCHASE CHANNEL ===
  createPurchaseChannel = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const body = req.body as CreatePurchaseChannelDTO;
      const result =
        await this.purchaseChannelService.createPurchaseChannel(body);
      res.status(201).send(result);
    } catch (error) {
      next(error);
    }
  };

  // === GET ALL PURCHASE CHANNELS ===
  getAllPurchaseChannels = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { page, take, search } = req.query;

      const result = await this.purchaseChannelService.getAllPurchaseChannels({
        page: Number(page),
        take: Number(take),
        search: search as string,
      });

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  // === GET PURCHASE CHANNEL LIST (FOR DROPDOWN) ===
  getPurchaseChannelList = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const result = await this.purchaseChannelService.getPurchaseChannelList();
      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  // === GET PURCHASE CHANNEL BY ID ===
  getPurchaseChannelBySlug = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { slug } = req.params;
      const result =
        await this.purchaseChannelService.getPurchaseChannelBySlug(slug);
      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  // === UPDATE PURCHASE CHANNEL ===
  updatePurchaseChannel = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { slug } = req.params;
      const body = req.body as UpdatePurchaseChannelDTO;

      const result = await this.purchaseChannelService.updatePurchaseChannel(
        slug,
        body,
      );
      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  // === DELETE PURCHASE CHANNEL ===
  deletePurchaseChannel = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { id } = req.params;

      const result =
        await this.purchaseChannelService.deletePurchaseChannel(id);
      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };
}
