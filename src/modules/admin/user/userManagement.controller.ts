import { NextFunction, Request, Response } from "express";
import { injectable } from "tsyringe";
import { AuthenticatedRequest } from "../../../middleware/AuthenticatedUser";
import { ApiError } from "../../../utils/api-error";
import { CreateUserDTO, UpdateUserDTO } from "./dto/userManagement.dto";
import { UserService } from "./userManagement.service";

@injectable()
export class UserController {
  constructor(private readonly userService: UserService) {}

  // ==========================================
  // CREATE USER
  // ==========================================
  createUser = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data: CreateUserDTO = req.body;
      const file: Express.Multer.File | undefined = req.file;

      const result = await this.userService.createUser(data, file);

      res.status(201).send(result);
    } catch (error) {
      next(error);
    }
  };

  // ==========================================
  // GET ALL USERS
  // ==========================================
  getAllUsers = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const users = await this.userService.getAllUsers();

      res.status(200).json(users);
    } catch (error) {
      next(error);
    }
  };

  // ==========================================
  // GET AUTHORS
  // ==========================================
  getAuthorsForFilter = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const authors = await this.userService.getAllAuthors();

      res.status(200).json(authors);
    } catch (error) {
      next(error);
    }
  };

  // ==========================================
  // UPDATE USER
  // ==========================================
  updateUser = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);

      const data: UpdateUserDTO = req.body;

      const file: Express.Multer.File | undefined = req.file;

      const updatedUser = await this.userService.updateUser(id, data, file);

      res.status(200).json(updatedUser);
    } catch (error) {
      next(error);
    }
  };

  // ==========================================
  // GET USER BY ID
  // ==========================================
  getUserById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);

      const user = await this.userService.getUserById(id);

      res.status(200).json(user);
    } catch (error) {
      next(error);
    }
  };

  // Public: aktivasi akun lewat email.
  activateAdminAccount = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { token, password } = req.body;

      const result = await this.userService.activateAdminAccount(
        token,
        password,
      );

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  // Protected: kirim ulang hanya oleh Super Admin.
  resendAdminInvitation = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const id = String(req.params.id);

      const result = await this.userService.resendAdminInvitation(id);

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  // ==========================================
  // UPDATE USER SIGNATURE
  // ==========================================
  updateSignature = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const actorId = authReq.user?.id;

      if (!actorId) {
        throw new ApiError("Unauthorized: User ID tidak ditemukan.", 401);
      }

      // /me/signature => gunakan user login
      // /:id/signature => gunakan target dari URL
      const targetUserId = req.params.id ? String(req.params.id) : actorId;

      const file: Express.Multer.File | undefined = req.file;

      const result = await this.userService.updateUserSignature(
        actorId,
        targetUserId,
        file,
      );

      res.status(200).json({
        success: true,
        message: "Tanda tangan berhasil diperbarui.",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  getMySignature = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as AuthenticatedRequest).user?.id;

      if (!userId) {
        throw new ApiError("Unauthorized", 401);
      }

      const result = await this.userService.getMySignature(userId);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };
}
