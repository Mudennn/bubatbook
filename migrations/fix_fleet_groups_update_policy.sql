-- Add missing UPDATE policy for fleet groups
-- Allows Super Admins to update any group (for approval/suspension)
-- Allows Fleet Admins to update their own group (for settings)

-- Drop if exists to be safe
DROP POLICY IF EXISTS "Super admins and Fleet admins can update groups" ON bubatrent_booking_fleet_groups;

CREATE POLICY "Super admins and Fleet admins can update groups" ON bubatrent_booking_fleet_groups
  FOR UPDATE TO authenticated USING (
    -- Super Admin check
    EXISTS (
      SELECT 1 FROM bubatrent_booking_profiles
      WHERE id = auth.uid() AND role = 'super_admin'
    )
    OR
    -- Fleet Admin check for the specific group being updated
    EXISTS (
      SELECT 1 FROM bubatrent_booking_fleet_memberships
      WHERE fleet_group_id = bubatrent_booking_fleet_groups.id
        AND user_id = auth.uid()
        AND role = 'fleet_admin'
    )
  );
