import argon2 from "argon2";

export async function hashPasswordOrPin(value: string) {
  return argon2.hash(value);
}

export async function verifyPasswordOrPin(hash: string | null | undefined, value: string) {
  if (!hash || !value) {
    return false;
  }

  try {
    return await argon2.verify(hash, value);
  } catch {
    return false;
  }
}
