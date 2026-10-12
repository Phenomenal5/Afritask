-- Visitors can write from the public Contact page: their ticket has no account, just a
-- name and email to answer.
ALTER TABLE "SupportTicket" ADD COLUMN     "contactEmail" TEXT,
ADD COLUMN     "contactName" TEXT,
ALTER COLUMN "requesterId" DROP NOT NULL;

-- Every ticket has someone to answer: an account, or a visitor's email.
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_has_requester"
    CHECK ("requesterId" IS NOT NULL OR "contactEmail" IS NOT NULL);
