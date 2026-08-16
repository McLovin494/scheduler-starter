import { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import { AppError } from "../utils/AppError.js";

export const errorHandler = (
    err: any,
    req: Request,
    res: Response,
    next: NextFunction
) => {

    console.error(err);

    // Our custom errors
    if (err instanceof AppError) {
        return res.status(err.statusCode).json({
            success: false,
            message: err.message,
            data: {}
        });
    }

    // Mongoose validation error
    if (err instanceof mongoose.Error.ValidationError) {
        return res.status(400).json({
            success: false,
            message: "Validation failed",
            errors: Object.values(err.errors).map(
                (error: any) => error.message
            ),
            data: {}
        });
    }

    // MongoDB duplicate key
    if (err.code === 11000) {
        const field = Object.keys(err.keyValue || {})[0];

        return res.status(409).json({
            success: false,
            message: `${field || "Resource"} already exists`,
            data: {}
        });
    }

    // Mongoose invalid ObjectId
    if (err instanceof mongoose.Error.CastError) {
        return res.status(400).json({
            success: false,
            message: `Invalid ${err.path}`,
            data: {}
        });
    }

    // Unknown error
    return res.status(500).json({
        success: false,
        message: "Internal server error",
        data: {}
    });
};