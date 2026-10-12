-- Ticket references start at #1001. Setting START (not only the current value) keeps it
-- true after a sequence restart too (e.g. TRUNCATE ... RESTART IDENTITY in test resets).
ALTER SEQUENCE "SupportTicket_number_seq" START WITH 1001;
-- Never move backwards past tickets that already exist.
SELECT setval('"SupportTicket_number_seq"', GREATEST(1001, (SELECT COALESCE(MAX("number"), 0) + 1 FROM "SupportTicket")), false);
