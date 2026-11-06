import { notFound, redirect } from "next/navigation";
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { withApiHandler, ok, runAction } from "@backend/lib/api/response";
import { AppError, Errors } from "@backend/lib/errors/app-error";
import { handleApiError, normalizeError } from "@backend/lib/errors/api-error-handler";
import { isTransientDbError, mapPrismaError, retryTransient } from "@backend/lib/errors/prisma-error-handler";
import { redact } from "@backend/lib/logging/logger";

const prismaError = (code: string, meta?: Record<string, unknown>) =>
  Object.assign(new Error(`Invalid prisma.user.create() invocation: secret SQL details for ${code}`), {
    name: "PrismaClientKnownRequestError",
    code,
    meta,
  });

describe("AppError", () => {
  it("maps codes to HTTP status", () => {
    expect(Errors.unauthenticated().statusCode).toBe(401);
    expect(Errors.forbidden().statusCode).toBe(403);
    expect(Errors.notFound("patient")).toMatchObject({ statusCode: 404, message: "The requested patient could not be found." });
    expect(Errors.validation().statusCode).toBe(400);
    expect(Errors.conflict().statusCode).toBe(409);
    expect(Errors.rateLimited().statusCode).toBe(429);
    expect(new AppError("DATABASE_ERROR").statusCode).toBe(503);
    expect(new AppError("INTERNAL_ERROR").statusCode).toBe(500);
  });
});

describe("normalizeError", () => {
  it("turns invalid form input into field errors", () => {
    const schema = z.object({ email: z.email(), age: z.number().min(18) });
    const result = schema.safeParse({ email: "nope", age: 3 });
    const error = normalizeError(result.error);
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(Object.keys(error.fields ?? {})).toEqual(["email", "age"]);
  });

  it("maps a duplicate record to CONFLICT", () => {
    const error = mapPrismaError(prismaError("P2002", { target: ["email"] }));
    expect(error).toMatchObject({ code: "CONFLICT", statusCode: 409, fields: { email: ["This value is already in use."] } });
  });

  it("maps a missing record to NOT_FOUND", () => {
    expect(mapPrismaError(prismaError("P2025"))).toMatchObject({ code: "NOT_FOUND", statusCode: 404 });
  });

  it("maps database outages to DATABASE_ERROR", () => {
    const init = Object.assign(new Error("Can't reach database server at 10.0.0.5:3306"), { name: "PrismaClientInitializationError" });
    expect(normalizeError(init)).toMatchObject({ code: "DATABASE_ERROR", statusCode: 503 });
    const nested = Object.assign(new Error("adapter failure"), {
      name: "DriverAdapterError",
      cause: Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }),
    });
    expect(normalizeError(nested).code).toBe("DATABASE_ERROR");
  });

  // Shapes captured from @prisma/adapter-mariadb 7.10 against an unreachable / refusing MySQL.
  const adapterError = (code: string, cause: Record<string, unknown>) =>
    Object.assign(new Error("Invalid `prisma.user.findFirst()` invocation"), {
      name: "PrismaClientKnownRequestError",
      code,
      meta: { modelName: "User", driverAdapterError: { name: "DriverAdapterError", cause } },
    });

  it("maps driver-adapter pool / connection failures to DATABASE_ERROR", () => {
    const poolTimeout = adapterError("P2039", {
      originalCode: "45028",
      kind: "mysql",
      code: 45028,
      message: "pool failed to retrieve a connection from pool",
      state: "HY000",
    });
    expect(normalizeError(poolTimeout)).toMatchObject({ code: "DATABASE_ERROR", statusCode: 503 });
    expect(normalizeError(adapterError("P2010", { kind: "mysql", code: 45028 })).code).toBe("DATABASE_ERROR");
    expect(normalizeError(adapterError("P2039", { kind: "DatabaseNotReachable", host: "db" })).code).toBe("DATABASE_ERROR");
    expect(normalizeError(adapterError("P2039", { kind: "TooManyConnections", cause: "" })).code).toBe("DATABASE_ERROR");
    expect(isTransientDbError(poolTimeout)).toBe(true);
  });

  it("maps adapter unique / FK / deadlock errors", () => {
    const unique = adapterError("P2002", { kind: "UniqueConstraintViolation", constraint: { fields: ["email"] } });
    expect(normalizeError(unique)).toMatchObject({ code: "CONFLICT", fields: { email: ["This value is already in use."] } });
    const uniqueNoCode = adapterError("P2039", { kind: "UniqueConstraintViolation", constraint: { index: "users_email_key" } });
    expect(normalizeError(uniqueNoCode)).toMatchObject({ code: "CONFLICT" });
    expect(normalizeError(adapterError("P2039", { kind: "ForeignKeyConstraintViolation" })).code).toBe("VALIDATION_ERROR");
    const deadlock = adapterError("P2039", { kind: "TransactionWriteConflict" });
    expect(normalizeError(deadlock).code).toBe("CONFLICT");
    expect(isTransientDbError(deadlock)).toBe(true);
    expect(isTransientDbError(unique)).toBe(false);
  });

  it("hides unexpected exceptions behind a generic message", () => {
    const error = normalizeError(new TypeError("Cannot read properties of undefined (reading 'medicalNotes')"));
    expect(error.code).toBe("INTERNAL_ERROR");
    expect(error.message).not.toContain("medicalNotes");
  });
});

describe("handleApiError", () => {
  it("returns the standard error envelope without sensitive details", async () => {
    const response = handleApiError(prismaError("P1234"), "req-123");
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({
      success: false,
      error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again.", requestId: "req-123" },
    });
    const raw = JSON.stringify(body);
    expect(raw).not.toMatch(/SQL|prisma|stack|P1234/i);
  });

  it("returns field errors for validation failures", async () => {
    const response = handleApiError(Errors.validation({ email: ["Enter a valid email address"] }));
    expect(response.status).toBe(400);
    expect((await response.json()).error.fields).toEqual({ email: ["Enter a valid email address"] });
  });

  it("re-throws Next.js redirect and notFound control flow", () => {
    let redirectError: unknown;
    try {
      redirect("/login");
    } catch (e) {
      redirectError = e;
    }
    expect(() => handleApiError(redirectError)).toThrow();
    let notFoundError: unknown;
    try {
      notFound();
    } catch (e) {
      notFoundError = e;
    }
    expect(() => handleApiError(notFoundError)).toThrow();
  });
});

describe("withApiHandler / runAction boundaries", () => {
  const request = (method: string, origin?: string) =>
    new NextRequest("http://localhost:3000/api/test", { method, headers: origin ? { origin } : {} });

  it("wraps success responses and sets a request id", async () => {
    const handler = withApiHandler(async () => ok({ hello: "world" }, { message: "Done" }));
    const response = await handler(request("GET"), { params: Promise.resolve({}) });
    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBeTruthy();
    expect(await response.json()).toEqual({ success: true, data: { hello: "world" }, message: "Done" });
  });

  it("converts thrown AppErrors into the error envelope", async () => {
    const handler = withApiHandler(async () => {
      throw Errors.notFound("patient");
    });
    const response = await handler(request("GET"), { params: Promise.resolve({}) });
    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("NOT_FOUND");
  });

  it("blocks cross-site mutating requests (CSRF)", async () => {
    const inner = vi.fn(async () => ok(null));
    const handler = withApiHandler(inner);
    const response = await handler(request("POST", "https://evil.example"), { params: Promise.resolve({}) });
    expect(response.status).toBe(403);
    expect(inner).not.toHaveBeenCalled();
    const sameSite = await handler(request("POST", "http://localhost:3000"), { params: Promise.resolve({}) });
    expect(sameSite.status).toBe(200);
  });

  it("runAction returns serialisable results", async () => {
    await expect(runAction(async () => 42, "Saved")).resolves.toEqual({ success: true, data: 42, message: "Saved" });
    const failed = await runAction(async () => {
      throw new Error("ER_ACCESS_DENIED_ERROR for user root");
    });
    expect(failed).toMatchObject({ success: false, error: { code: "INTERNAL_ERROR" } });
    expect(JSON.stringify(failed)).not.toContain("root");
  });
});

describe("retryTransient", () => {
  it("retries transient failures a bounded number of times", async () => {
    const op = vi
      .fn()
      .mockRejectedValueOnce(prismaError("P2034"))
      .mockResolvedValueOnce("ok");
    await expect(retryTransient(op, { baseDelayMs: 1 })).resolves.toBe("ok");
    expect(op).toHaveBeenCalledTimes(2);
  });

  it("does not retry non-transient errors", async () => {
    const op = vi.fn().mockRejectedValue(prismaError("P2002"));
    await expect(retryTransient(op, { baseDelayMs: 1 })).rejects.toBeTruthy();
    expect(op).toHaveBeenCalledTimes(1);
    expect(isTransientDbError(prismaError("P2002"))).toBe(false);
  });

  it("gives up after the retry budget", async () => {
    const op = vi.fn().mockRejectedValue(prismaError("P2034"));
    await expect(retryTransient(op, { retries: 2, baseDelayMs: 1 })).rejects.toBeTruthy();
    expect(op).toHaveBeenCalledTimes(3);
  });
});

describe("log redaction", () => {
  it("redacts sensitive keys recursively", () => {
    const out = redact({
      userId: "u1",
      password: "hunter2",
      nested: { token: "abc", medicalNotes: "diabetic", allergies: "latex", ok: 1 },
    }) as Record<string, Record<string, unknown>>;
    expect(out.userId).toBe("u1");
    expect(out.password).toBe("[REDACTED]");
    expect(out.nested).toEqual({ token: "[REDACTED]", medicalNotes: "[REDACTED]", allergies: "[REDACTED]", ok: 1 });
  });
});
