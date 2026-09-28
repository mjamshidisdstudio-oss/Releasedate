import { DomainError } from "@/server/errors";
import { handle, readJson } from "@/server/http";
import { login } from "@/server/auth/session";
import { clearFailures, isThrottled, recordFailure } from "@/server/auth/throttle";
import { loginSchema } from "@/server/validation";

export const POST = handle(async (req) => {
  const { username, password } = await readJson(req, loginSchema);
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const key = `${ip}:${username.toLowerCase()}`;
  if (isThrottled(key)) {
    throw new DomainError(429, "too_many_attempts", "Too many failed attempts. Try again in 15 minutes.");
  }
  const admin = await login(username, password);
  if (!admin) {
    recordFailure(key);
    throw new DomainError(401, "invalid_credentials", "Wrong username or password");
  }
  clearFailures(key);
  return { username: admin.username };
});
