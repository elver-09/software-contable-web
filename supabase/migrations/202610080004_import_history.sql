CREATE TABLE ansorito._desktop_imports (
 owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
 scope_id uuid NOT NULL DEFAULT ansorito.current_scope(),
 source_key text NOT NULL, sha256 text NOT NULL, imported_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(scope_id,source_key)
);
ALTER TABLE ansorito._desktop_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE ansorito._desktop_imports FORCE ROW LEVEL SECURITY;
CREATE POLICY owner_global ON ansorito._desktop_imports TO authenticated
 USING(owner_id=auth.uid() AND scope_id=auth.uid())
 WITH CHECK(owner_id=auth.uid() AND scope_id=auth.uid());
GRANT SELECT,INSERT ON ansorito._desktop_imports TO authenticated;
