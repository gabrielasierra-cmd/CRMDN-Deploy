import { comparePassword, hashPassword } from "../src/utils/password";

describe("password utils", () => {
  it("hashes and verifies a password", async () => {
    const password = "StrongPass123";
    const hash = await hashPassword(password);

    expect(hash).not.toBe(password);
    await expect(comparePassword(password, hash)).resolves.toBe(true);
    await expect(comparePassword("WrongPass1", hash)).resolves.toBe(false);
  });
});
