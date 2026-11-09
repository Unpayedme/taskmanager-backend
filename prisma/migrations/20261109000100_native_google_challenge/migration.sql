CREATE TABLE "NativeGoogleChallenge" (
    "id" UUID NOT NULL,
    "nonceHash" CHAR(64) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "NativeGoogleChallenge_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "NativeGoogleChallenge_expiresAt_idx" ON "NativeGoogleChallenge"("expiresAt");
