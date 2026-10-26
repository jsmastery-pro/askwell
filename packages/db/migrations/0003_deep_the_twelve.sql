ALTER TABLE "accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "conversations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "knowledge_chunks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "knowledge_sources" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "projects" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "widget_configs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- RLS doesn't apply to TRUNCATE, and Supabase grants it to its API roles. Revoke it where those
-- roles exist (they don't on a local Postgres or pglite).
DO $$
DECLARE api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format(
        'REVOKE TRUNCATE ON TABLE "accounts", "conversations", "knowledge_chunks", "knowledge_sources", "messages", "projects", "widget_configs" FROM %I',
        api_role
      );
    END IF;
  END LOOP;
END $$;
