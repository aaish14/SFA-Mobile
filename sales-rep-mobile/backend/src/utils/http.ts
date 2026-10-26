import type { Response } from "express";
/**
 * Return the shared success envelope containing the response data and user-facing message.
 */
export const ok = (res: Response, data: unknown, message = "Operation successful") =>
  res.json({ success: true, data, message });
/**
 * Return the shared failure envelope with an HTTP status, stable error code and user-facing
 * message.
 */
export const fail = (res: Response, status: number, message: string, errorCode: string) =>
  res.status(status).json({ success: false, data: null, message, errorCode });
