import countryToCurrency from "country-to-currency";
import { NextFunction, Request, Response } from "express";
import { injectable } from "tsyringe";
import { ApiError } from "../../../utils/api-error";
import { CurrencyConversionService } from "./convertionCurrency.service";
import { CurrencyService } from "./currency.service";
import {
  ConvertCurrencyDTO,
  CreateCurrencyDTO,
  UpdateCurrencyDTO,
} from "./dto/currency.dto";

@injectable()
export class CurrencyController {
  constructor(
    private readonly currencyService: CurrencyService,
    private readonly conversionService: CurrencyConversionService,
  ) {}

  // ==========================================
  // GET ALL (With Optional Search)
  // ==========================================
  getAll = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const search = req.query.search as string | undefined;
      const result = await this.currencyService.getAllCurrencies(search);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  // ==========================================
  // GET ONE BY CODE
  // ==========================================
  getOne = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { code } = req.params;
      const result = await this.currencyService.getCurrencyByCode(code);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  // ==========================================
  // CREATE
  // ==========================================
  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Body sudah divalidasi oleh middleware sebagai CreateCurrencyDTO
      const body = req.body as CreateCurrencyDTO;

      const result = await this.currencyService.createCurrency(body);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  };

  // ==========================================
  // UPDATE
  // ==========================================
  update = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { code } = req.params;
      const body = req.body as UpdateCurrencyDTO;

      const result = await this.currencyService.updateCurrency(code, body);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  // ==========================================
  // DELETE
  // ==========================================
  delete = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { code } = req.params;
      await this.currencyService.deleteCurrency(code);

      res.status(200).json({ message: "Currency deleted successfully" });
    } catch (error) {
      next(error);
    }
  };

  convert = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as ConvertCurrencyDTO;
      const result = await this.conversionService.convertCurrency(body);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  // ==========================================
  // PUBLIC CURRENCY ESTIMATION
  // ==========================================
  getPublicEstimateRate = async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    res.setHeader("Cache-Control", "no-store");

    const rawCountry = req.query.country;
    const rawCurrency = req.query.currency;

    // ==========================================
    // 1. VALIDATE COUNTRY INPUT
    // ==========================================
    if (
      rawCountry !== undefined &&
      (typeof rawCountry !== "string" || !/^[A-Z]{2}$/i.test(rawCountry.trim()))
    ) {
      res.status(400).json({
        success: false,
        message: "Invalid country code",
      });

      return;
    }

    const country =
      typeof rawCountry === "string" ? rawCountry.trim().toUpperCase() : "ID";

    // ==========================================
    // 2. EXISTING COUNTRY TO CURRENCY MAPPING
    // ==========================================
    const detectedCurrency =
      countryToCurrency[country as keyof typeof countryToCurrency] || "IDR";

    let targetCurrency: string = detectedCurrency;

    // ==========================================
    // 3. OPTIONAL MANUAL CURRENCY OVERRIDE
    // ==========================================
    if (rawCurrency !== undefined) {
      if (typeof rawCurrency !== "string") {
        res.status(400).json({
          success: false,
          message: "Invalid currency code",
        });

        return;
      }

      const manualCurrency = rawCurrency.trim().toUpperCase();

      const supportedCurrencies = new Set<string>([
        "IDR",
        ...Object.values(countryToCurrency),
      ]);

      if (
        !/^[A-Z]{3}$/.test(manualCurrency) ||
        !supportedCurrencies.has(manualCurrency)
      ) {
        res.status(400).json({
          success: false,
          message: "Unsupported currency",
        });

        return;
      }

      targetCurrency = manualCurrency;
    }

    // ==========================================
    // 4. IDR DOES NOT REQUIRE CONVERSION
    // ==========================================
    if (targetCurrency === "IDR") {
      res.setHeader("Cache-Control", "public, max-age=300, s-maxage=300");

      res.status(200).json({
        success: true,
        data: {
          country,
          detectedCurrency,
          baseCurrency: "IDR",
          targetCurrency: "IDR",
          transactionCurrency: "IDR",
          rate: 1,
          updatedAt: null,
          source: "same-currency",
          isEstimate: true,
        },
      });

      return;
    }

    // ==========================================
    // 5. REUSE EXISTING CONVERSION SERVICE
    // ==========================================
    try {
      const result = await this.conversionService.convertCurrency({
        fromCurrency: "IDR",
        toCurrency: targetCurrency,
        amount: 1,
      });

      const rate = Number(result.rate);

      if (!Number.isFinite(rate) || rate <= 0) {
        throw new Error("Invalid currency conversion rate");
      }

      res.setHeader("Cache-Control", "public, max-age=300, s-maxage=300");

      res.status(200).json({
        success: true,
        data: {
          country,
          detectedCurrency,
          baseCurrency: "IDR",
          targetCurrency,
          transactionCurrency: "IDR",
          rate,
          updatedAt: result.timestamp,
          source: result.source,
          isEstimate: true,
        },
      });
    } catch (error) {
      if (error instanceof ApiError && error.status === 400) {
        res.status(400).json({
          success: false,
          message: "Currency is not supported by exchange rate provider",
        });

        return;
      }

      console.error("[Public Currency Estimation]", {
        country,
        currency: targetCurrency,
        message: error instanceof Error ? error.message : "Unknown error",
      });

      res.setHeader("Retry-After", "60");

      res.status(503).json({
        success: false,
        message: "Currency estimation is temporarily unavailable",
      });
    }
  };
}
