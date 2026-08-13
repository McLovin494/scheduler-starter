import { Schema, model, type Document } from "mongoose";

export interface IRefreshToken extends Document {
  userId: string;
  jti: string;
  expiredAt: Date;
  issuedAt: Date;
  tokenHash: string;
  revokedAt: Date | null;
}

const refreshTokenSchema = new Schema<IRefreshToken>({
  userId: {
    type: String,
    required: true,
  },

  jti: {
    type: String,
    required: true,
    unique: true,
  },

  expiredAt: {
    type: Date,
    required: true,
  },

  issuedAt: {
    type: Date,
    required: true,
  },

  tokenHash: {
    type: String,
    required: true,
  },

  revokedAt: {
    type: Date,
    default: null,
  },
});

export const RefreshToken = model<IRefreshToken>(
  "RefreshToken",
  refreshTokenSchema
);