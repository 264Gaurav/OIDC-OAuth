import { test } from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword } from "./password.js";

test("argon2id hash verifies the original password and rejects another", async () => {
  const hash = await hashPassword("CorrectHorseBattery12!");
  assert.equal(await verifyPassword(hash, "CorrectHorseBattery12!"), true);
  assert.equal(await verifyPassword(hash, "WrongPassword9999!"), false);
});
