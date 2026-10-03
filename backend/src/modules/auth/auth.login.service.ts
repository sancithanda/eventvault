import argon2 from "argon2";
import jwt from "jsonwebtoken";
import { prisma } from "../../config/prisma";
import { env } from "../../config/env";
import type { LoginInput } from "./auth.login.validation";

export async function loginUser(input: LoginInput) {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    select: {
      id: true,
      name: true,
      email: true,
      passwordHash: true,
      status: true,
    },
  });

  // Use the same public error for an unknown email or incorrect password.
  if (!user) {
    throw new Error("INVALID_CREDENTIALS");
  }

  const passwordMatches = await argon2.verify(
    user.passwordHash,
    input.password,
  );

  if (!passwordMatches) {
    throw new Error("INVALID_CREDENTIALS");
  }

  if (user.status !== "ACTIVE") {
    throw new Error("ACCOUNT_NOT_ACTIVE");
  }

  const token = jwt.sign(
    { sub: user.id },
    env.JWT_SECRET,
    {
      expiresIn: "15m",
      issuer: "eventvault-api",
      audience: "eventvault-client",
    },
  );

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      status: user.status,
    },
    accessToken: token,
    tokenType: "Bearer",
    expiresIn: 900,
  };
}