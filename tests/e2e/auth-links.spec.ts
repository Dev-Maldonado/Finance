import { test, expect } from "@playwright/test";

test("expired links and new email requests use the application origin", async ({ page }) => {
  await page.goto("/?error=access_denied&error_code=otp_expired");
  await expect(page.getByRole("status")).toContainText("expirou ou já foi utilizado");
  // Intercept requests so this test sends no emails and creates no accounts.
  await page.route("**/auth/v1/**", async route => {
    if (route.request().method() === "POST")
      await route.fulfill({ status: 400, json: { msg: "Request intercepted by test" } });
    else await route.continue();
  });
  const scenarios = [
    { link: "Criar conta", submit: "Criar minha conta", endpoint: "/signup", password: true },
    { link: "Esqueci minha senha", submit: "Enviar instruções", endpoint: "/recover", password: false },
    { link: "Reenviar confirmação", submit: "Enviar nova confirmação", endpoint: "/resend", password: false },
  ];
  for (const scenario of scenarios) {
    await page.getByRole("button", { name: scenario.link, exact: true }).click();
    await page.getByLabel("E-mail").fill("link-check@example.invalid");
    if (scenario.password) await page.getByLabel("Senha", { exact: true }).fill("Test-password-123!");
    const pending = page.waitForRequest(req => req.method() === "POST" && new URL(req.url()).pathname.endsWith(scenario.endpoint));
    await page.getByRole("button", { name: scenario.submit, exact: true }).click();
    const request = await pending;
    expect(new URL(request.url()).searchParams.get("redirect_to")).toBe("http://localhost:3000/auth/callback");
    await expect(page.getByRole("status")).toContainText("Request intercepted");
  }
  await page.goto("/auth/callback?error_code=otp_expired");
  await expect(page).toHaveURL(/auth_error=otp_expired/);
  await expect(page.getByRole("status")).toContainText("expirou");
});
