
import "dotenv/config";
import { createInterface } from "node:readline";
import argon2 from "argon2";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";

function ask(question: string): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function askHidden(question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;

    if (!stdin.isTTY || !stdin.setRawMode) {
      reject(new Error("Please run this script directly in a terminal."));
      return;
    }

    let answer = "";

    process.stdout.write(question);
    stdin.setRawMode(true);
    stdin.setEncoding("utf8");
    stdin.resume();

    function cleanup() {
      stdin.removeListener("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
      process.stdout.write("\n");
    }

    function onData(chunk: string) {
      for (const char of chunk) {
        if (char === "\u0003") {
          cleanup();
          reject(new Error("Password entry cancelled."));
          return;
        }

        if (char === "\r" || char === "\n") {
          cleanup();
          resolve(answer);
          return;
        }

        if (char === "\u007f" || char === "\b") {
          answer = answer.slice(0, -1);
          continue;
        }

        if (char >= " ") {
          answer += char;
        }
      }
    }

    stdin.on("data", onData);
  });
}

async function main() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured in .env.");
  }

  const fullName = await ask("Librarian's full name: ");
  const roomNumber = await ask("Room number: ");
  const email = (await ask("Email address: ")).toLowerCase();

  if (!fullName || !roomNumber || !email) {
    throw new Error("Name, room number and email are required.");
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Please enter a valid email address.");
  }

  const password = await askHidden("Choose a password (minimum 12 characters): ");
  const confirmation = await askHidden("Confirm password: ");

  if (password.length < 12) {
    throw new Error("The password must contain at least 12 characters.");
  }

  if (password !== confirmation) {
    throw new Error("The passwords do not match.");
  }

  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });

  try {
    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existingUser) {
      throw new Error(
        "An account with this email already exists. No account was created."
      );
    }

    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });

    const now = new Date();

    const librarian = await prisma.user.create({
      data: {
        fullName,
        roomNumber,
        email,
        passwordHash,
        role: "LIBRARIAN",
        status: "ACTIVE",
        emailVerifiedAt: now,
        activatedAt: now,
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        status: true,
      },
    });

    console.log("\nLibrarian account created successfully.");
    console.log(`Name: ${librarian.fullName}`);
    console.log(`Email: ${librarian.email}`);
    console.log(`Role: ${librarian.role}`);
    console.log(`Status: ${librarian.status}`);
    console.log("\nKeep your password private.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(
    "\nCould not create librarian account:",
    error instanceof Error ? error.message : error
  );
  process.exitCode = 1;
});
