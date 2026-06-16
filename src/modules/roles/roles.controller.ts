import { NextFunction, Request, Response } from "express";
import { injectable } from "tsyringe";
import { CreateRoleDTO, UpdateRoleDTO } from "./dto/roles.dto";
import { RoleService } from "./roles.service";

@injectable()
export class RoleController {
  constructor(private readonly roleService: RoleService) {}

  // === CREATE ROLE ===
  createRole = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data: CreateRoleDTO = req.body;
      const result = await this.roleService.createRole(data);

      res.status(201).send(result);
    } catch (error) {
      next(error);
    }
  };

  // === GET ALL ROLES (WITH PAGINATION) ===
  getAllRoles = async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Ekstrak query parameters untuk pagination dan search
      const { page, take, search } = req.query;

      const roles = await this.roleService.getAllRoles({
        page: Number(page),
        take: Number(take),
        search: search as string,
      });

      res.status(200).json(roles);
    } catch (error) {
      next(error);
    }
  };

  // === GET ROLES LIST (UNTUK DROPDOWN) ===
  getRolesList = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rolesList = await this.roleService.getRolesList();

      res.status(200).json(rolesList);
    } catch (error) {
      next(error);
    }
  };

  // === GET ROLE BY ID ===
  getRoleById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const role = await this.roleService.getRoleById(id);

      res.status(200).send(role);
    } catch (error) {
      next(error);
    }
  };

  // === UPDATE ROLE ===
  updateRole = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const data: UpdateRoleDTO = req.body;

      const updatedRole = await this.roleService.updateRole(id, data);

      res.status(200).send(updatedRole);
    } catch (error) {
      next(error);
    }
  };

  // === DELETE ROLE ===
  deleteRole = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const result = await this.roleService.deleteRole(id);

      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };
}
