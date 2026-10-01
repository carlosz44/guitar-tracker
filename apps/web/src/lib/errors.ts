import { validationMessage } from "@/i18n/es";
import { ApiError } from "./api";

export function errorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError && error.key) {
    const message = validationMessage(error.key);
    if (message !== validationMessage(undefined)) return message;
  }
  return fallback;
}
