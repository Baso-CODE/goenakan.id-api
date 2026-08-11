import { NextFunction, Request, Response } from "express";
import { injectable } from "tsyringe";
import { ContactService } from "./contact-message.service";

@injectable()
export class ContactController {
  constructor(private readonly contactService: ContactService) {}

  // =========================================================================
  // 1. CREATE MESSAGE (Public / Landing Page)
  // =========================================================================
  createMessage = async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Data yang dikirim dari form frontend ada di req.body
      const data = req.body;

      const result = await this.contactService.createContactMessage(data);

      res.status(201).json({
        success: true,
        message: "Pesan berhasil dikirim",
        data: result,
      });
    } catch (error) {
      next(error); // Lempar error ke error handler global
    }
  };

  // =========================================================================
  // 2. GET ALL MESSAGES (Admin Dashboard)
  // =========================================================================
  getAllMessages = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, take, search, isRead } = req.query;

      const result = await this.contactService.getAllContactMessages({
        page: Number(page),
        take: Number(take),
        search: search as string,
        isRead: isRead as string | boolean,
      });

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  // =========================================================================
  // 3. GET MESSAGE DETAIL (Admin Dashboard)
  // =========================================================================
  getMessageDetail = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      // ID pesan ada di URL parameter (contoh: /api/contacts/5)
      const id = Number(req.params.id);

      const result = await this.contactService.getContactMessageDetail(id);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  // =========================================================================
  // 4. DELETE MESSAGE (Admin Dashboard)
  // =========================================================================
  deleteMessage = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = Number(req.params.id);

      const result = await this.contactService.deleteContactMessage(id);

      res.status(200).json({
        success: true,
        message: result.message,
      });
    } catch (error) {
      next(error);
    }
  };
}
