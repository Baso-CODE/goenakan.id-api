import { NextFunction, Request, Response } from "express";
import { injectable } from "tsyringe";
import { CreateOrderDTO } from "./dto/createOrder.dto";
import { OrderExportQuery, OrderService } from "./order.service";

@injectable()
export class OrderController {
  constructor(private readonly orderService: OrderService) {}
  createOrder = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as CreateOrderDTO;
      const authorId = (req as any).user?.id;
      if (authorId) {
        body.createdById = authorId;
      }

      const result = await this.orderService.createOrder(body);
      res.status(201).send(result);
    } catch (error) {
      next(error);
    }
  };

  updateOrder = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const body = req.body as any;

      const authorId = (req as any).user?.id;
      if (authorId) {
        body.updatedById = authorId;
      }

      const result = await this.orderService.updateOrder(id, body);
      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  getOrderByIdUpdate = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { id } = req.params;
      const result = await this.orderService.getOrderForUpdate(id);

      res.status(201).send(result);
    } catch (error) {
      next(error);
    }
  };

  getOrderByIdDetail = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { id } = req.params;
      const result = await this.orderService.getOrderForDetail(id);

      res.status(201).send(result);
    } catch (error) {
      next(error);
    }
  };

  getAllOrder = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, take, search, salesCategory, startDate, endDate } =
        req.query;

      const result = await this.orderService.getAllOrders({
        page: page && !isNaN(Number(page)) ? Number(page) : 1,
        take: take && !isNaN(Number(take)) ? Number(take) : 10,

        // Handle string filtering
        search: search ? String(search) : undefined,

        salesCategory:
          salesCategory && String(salesCategory) !== "ALL"
            ? String(salesCategory)
            : undefined,

        startDate: startDate ? String(startDate) : undefined,
        endDate: endDate ? String(endDate) : undefined,
      });

      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  exportOrders = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query: OrderExportQuery = {
        startDate: req.query.startDate as string,
        endDate: req.query.endDate as string,
        search: req.query.search as string,
        salesCategory: req.query.salesCategory as string,
      };

      const excelBuffer = await this.orderService.exportOrdersToExcel(query);

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="orders-export-${new Date().toISOString().slice(0, 10)}.xlsx"`,
      );

      res.send(excelBuffer);
    } catch (error) {
      next(error);
    }
  };

  getForTracking = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const result = await this.orderService.getOrderForTracking(id);

      res.status(200).json({
        message: "Order tracking data retrieved",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  getSampleOrders = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, take, search, startDate, endDate } = req.query;

      const result = await this.orderService.getAllOrders({
        page: page && !isNaN(Number(page)) ? Number(page) : 1,
        take: take && !isNaN(Number(take)) ? Number(take) : 10,
        search: search ? String(search) : undefined,
        startDate: startDate ? String(startDate) : undefined,
        endDate: endDate ? String(endDate) : undefined,
        salesCategory: "SAMPLE",
      });

      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  getSampleStats = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.orderService.getSampleStats();
      res.status(200).json({
        message: "Sample statistics retrieved",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  // === GET SAMPLE REFERENCES (Hanya ID & Nomor untuk Dropdown Order) ===
  getSampleOrderReferences = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const result = await this.orderService.getSampleOrderReferences();

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  generatePoNumber = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const salesCategory =
        (req.query.category as "SALES" | "SAMPLE") || "SALES";

      const result = await this.orderService.generatePoNumberAPI(salesCategory);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  getChartData = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { year } = req.query;
      const data = await this.orderService.getSalesAnalytics(
        year ? Number(year) : undefined,
      );
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  };

  getMetrics = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.orderService.getSalesMetrics();
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  };

  getGeneralStats = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.orderService.getGeneralOrderStats();
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  getOrderByIdReplacement = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { id } = req.params;
      const result = await this.orderService.getOrderForReplacement(id);

      res.status(200).send({ data: result });
    } catch (error) {
      next(error);
    }
  };
}
