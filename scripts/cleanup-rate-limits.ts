import { prisma } from "../lib/prisma";

async function main() {
  const now = new Date();

  const expiredCount = await prisma.rateLimitBucket.count({
    where: {
      expiresAt: {
        lte: now,
      },
    },
  });

  if (process.argv.includes("--dry-run")) {
    console.log(
      `Dry run: ${expiredCount} expired rate-limit records would be deleted.`,
    );
    return;
  }

  const result = await prisma.rateLimitBucket.deleteMany({
    where: {
      expiresAt: {
        lte: now,
      },
    },
  });

  console.log(
    `Rate-limit cleanup complete: ${result.count} expired records deleted.`,
  );
}

main()
  .catch((error) => {
    console.error("Rate-limit cleanup failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
