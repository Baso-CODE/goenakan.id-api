import { NextFunction, Request, Response } from "express";
import { injectable } from "tsyringe";
import { CreateUserDTO } from "./dto/userManagement.dto";
import { UserService } from "./userManagement.service";

@injectable()
export class UserController {
  constructor(private readonly userService: UserService) {}

  // === CREATE USER ===
  createUser = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data: CreateUserDTO = req.body;
      const file: Express.Multer.File | undefined = req.file;

      // Panggil service dan teruskan data beserta file image (jika ada)
      const result = await this.userService.createUser(data, file);

      res.status(201).send(result);
    } catch (error) {
      next(error);
    }
  };

  // === GET ALL USERS ===
  getAllUsers = async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Jika ke depannya Anda menambahkan fitur pagination/search di UserService,
      // Anda bisa mengekstrak req.query di sini seperti pada SalesController.
      const users = await this.userService.getAllUsers();

      res.status(200).json(users);
    } catch (error) {
      next(error);
    }
  };

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

  // =========================================================================
  // BOILERPLATE UNTUK FITUR SELANJUTNYA (GET BY ID, UPDATE, DELETE)
  // Anda bisa mengisinya nanti jika sudah membuat fungsinya di UserService
  // =========================================================================

  /*
  // === GET USER BY ID ===
  getUserById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const user = await this.userService.getUserById(id);
      res.status(200).send(user);
    } catch (error) {
      next(error);
    }
  };

  // === UPDATE USER ===
  updateUser = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const data = req.body;
      const file = req.file;

      const updatedUser = await this.userService.updateUser(id, data, file);
      res.status(200).send(updatedUser);
    } catch (error) {
      next(error);
    }
  };

  // === DELETE USER ===
  deleteUser = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const result = await this.userService.deleteUser(id);
      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };
  */
}
