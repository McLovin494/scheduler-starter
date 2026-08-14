import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { JwtPayload } from "../types/JwtPayload.js";

export interface AuthedRequest extends Request {
  user?: {
    id:string
  };
}

export function protect(req: AuthedRequest, res: Response, next: NextFunction) {
  const authHeader=req.headers.authorization
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
        data: {},
      });
    }
    try {
    const token=authHeader.split(" ")[1];
    const payload=jwt.verify(
      token,
      process.env.JWT_ACCESS_SECRET!
    ) as JwtPayload
    if(payload.type!=="access"){
      return res.status(401).json({
        success:false,
        message:"Invalid access token",
        data:{}
      })
    }
    req.user={
      id:payload.id
    }
    next()
  } catch {
 return res.status(401).json({
      success: false,
      message: "Invalid or expired access token",
      data: {},
    });
    }
}
