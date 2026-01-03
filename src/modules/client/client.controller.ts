import { Request, Response, NextFunction } from "express";
import { injectable } from "tsyringe";
import { ClientService } from "./client.service";
import { CreateClientDTO } from "./dto/createClient.dto";
import { UpdateClientDTO } from "./dto/updateClient.dto";
import { ClientListQueryDTO } from "./dto/queryExportClient.dto";

@injectable()
export class ClientController {
  constructor(private readonly clientService: ClientService) {}

  createClient = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as CreateClientDTO;
      const result = await this.clientService.createClient(body);
      res.status(201).send(result);
    } catch (error) {
      next(error);
    }
  };

  getAllClients = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, take, type, search } = req.query;

      const result = await this.clientService.getAllClients({
        page: Number(page) || 1,
        take: Number(take) || 10,
        type: (type as string) || "ALL",
        search: (search as string) || "",
      });

      res.status(200).json({
        success: true,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  };

  getClientById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const result = await this.clientService.getClientById(id);
      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  updateClient = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const body = req.body as UpdateClientDTO;
      const result = await this.clientService.updateClient(id, body);
      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  deleteClient = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const result = await this.clientService.deleteClient(id);
      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  // === GET ALL CLIENTS FOR ORDER ===
  getAllClientsForOrder = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const clients = await this.clientService.getAllClientsForOrder();
      res.status(200).json(clients);
    } catch (error) {
      next(error);
    }
  };

  exportClients = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = req.query as unknown as ClientListQueryDTO;

      const excelBuffer = await this.clientService.exportClientsToExcel(query);

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="data-vendor-items-export.xlsx"',
      );
      res.send(excelBuffer);
    } catch (error) {
      next(error);
    }
  };
}
