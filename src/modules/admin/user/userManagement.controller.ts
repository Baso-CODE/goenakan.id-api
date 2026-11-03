import { NextFunction, Request, Response } from "express";
import { injectable } from "tsyringe";

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
}
