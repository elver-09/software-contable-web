CREATE TABLE ansorito._web_requests (
 owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
 scope_id uuid NOT NULL DEFAULT ansorito.current_scope(),
 id text NOT NULL, hash text NOT NULL, result text NOT NULL, PRIMARY KEY(scope_id,id)
);
ALTER TABLE ansorito._web_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE ansorito._web_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY isolated_scope ON ansorito._web_requests TO authenticated
 USING(owner_id=auth.uid() AND scope_id=ansorito.current_scope() AND EXISTS(SELECT 1 FROM ansorito.empresas e WHERE e.id=scope_id AND e.owner_id=auth.uid()))
 WITH CHECK(owner_id=auth.uid() AND scope_id=ansorito.current_scope() AND EXISTS(SELECT 1 FROM ansorito.empresas e WHERE e.id=scope_id AND e.owner_id=auth.uid()));
GRANT SELECT,INSERT,UPDATE,DELETE ON ansorito._web_requests TO authenticated;
