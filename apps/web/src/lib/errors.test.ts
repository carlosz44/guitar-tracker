import { topicErrors } from "@ds/shared";
import { describe, expect, it } from "vitest";
import { es } from "@/i18n/es";
import { ApiError } from "./api";
import { errorMessage } from "./errors";

describe("errorMessage", () => {
  it("translates a server validation key into Spanish", () => {
    const error = new ApiError(400, {
      error: "invalid",
      issues: [{ path: ["parentId"], message: topicErrors.cycle }],
    });
    expect(errorMessage(error, "x")).toBe(es.validation[topicErrors.cycle]);
  });

  it("translates a top-level error key", () => {
    expect(errorMessage(new ApiError(409, { error: topicErrors.hasLessons }), "x")).toBe(
      es.validation[topicErrors.hasLessons],
    );
  });

  it("falls back for unknown errors", () => {
    expect(errorMessage(new ApiError(500, { error: "internal" }), "fallback")).toBe("fallback");
    expect(errorMessage(new Error("boom"), "fallback")).toBe("fallback");
  });
});
