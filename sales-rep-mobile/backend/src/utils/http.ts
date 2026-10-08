import type { Response } from "express";
export const ok = (
  res: Response,
  data: unknown,
  message = "Operation successful",
) => res.json({ success: true, data, message });
export const fail = (
  res: Response,
  status: number,
  message: string,
  errorCode: string,
) =>
  res.status(status).json({ success: false, data: null, message, errorCode });
