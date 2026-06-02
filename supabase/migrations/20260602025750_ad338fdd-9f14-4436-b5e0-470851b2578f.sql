-- Restrict realtime channel subscriptions: deny by default, allow only verified Super Admin
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deny_all_realtime_messages" ON realtime.messages;
DROP POLICY IF EXISTS "super_admin_realtime_messages" ON realtime.messages;

-- Deny all by default
CREATE POLICY "deny_all_realtime_messages"
ON realtime.messages
FOR SELECT
TO anon, authenticated
USING (false);

-- Allow only the locked Super Admin email to subscribe to any topic
CREATE POLICY "super_admin_realtime_messages"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  (auth.jwt() ->> 'email') = 'pureproducts61@gmail.com'
);