import { loginSchema, registerSchema } from "../src/modules/auth/auth.schemas";

describe("auth schemas", () => {
  it("accepts a valid register payload", () => {
    const result = registerSchema.safeParse({
      body: {
        fullName: "Ana Silva",
        email: "ana@empresa.pt",
        password: "StrongPass123",
        organizationName: "Ana Studio"
      }
    });
    expect(result.success).toBe(true);
  });

  it("rejects weak password", () => {
    const result = registerSchema.safeParse({
      body: {
        fullName: "Ana Silva",
        email: "ana@empresa.pt",
        password: "123",
        organizationName: "Ana Studio"
      }
    });
    expect(result.success).toBe(false);
  });

  it("accepts a valid login payload", () => {
    const result = loginSchema.safeParse({
      body: {
        email: "ana@empresa.pt",
        password: "StrongPass123"
      }
    });
    expect(result.success).toBe(true);
  });
});
