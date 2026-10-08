import { expect, test } from "vitest";
import { authCallbackUrl, authLinkError } from "../src/lib/auth-links";

test("email callback follows the deployed origin", () => {
  expect(authCallbackUrl("https://finora.example")).toBe("https://finora.example/auth/callback");
});

test("expired links are explained from the query or fragment", () => {
  expect(authLinkError("?error_code=otp_expired", "")).toContain("expirou");
  expect(authLinkError("", "#error=access_denied&error_code=otp_expired")).toContain("expirou");
  expect(authLinkError("?auth_error=otp_expired", "")).toContain("expirou");
});

test("does not display arbitrary provider error descriptions", () => {
  const message = authLinkError("?error=access_denied&error_description=unsafe-provider-text", "");
  expect(message).toContain("Não foi possível validar");
  expect(message).not.toContain("unsafe-provider-text");
  expect(authLinkError("", "")).toBe("");
});
