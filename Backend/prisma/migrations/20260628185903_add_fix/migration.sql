-- CreateTable
CREATE TABLE "Fix" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "installationId" TEXT NOT NULL,
    "repoGithubId" TEXT NOT NULL,
    "repoFullName" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "package" TEXT NOT NULL,
    "fromVersion" TEXT NOT NULL,
    "toVersion" TEXT NOT NULL,
    "advisory" TEXT NOT NULL,
    "prUrl" TEXT NOT NULL,
    "prNumber" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "Fix_installationId_repoGithubId_idx" ON "Fix"("installationId", "repoGithubId");
