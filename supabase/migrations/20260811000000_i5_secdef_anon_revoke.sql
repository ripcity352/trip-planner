-- I5 — SECURITY DEFINER anon-revoke (defense-in-depth; #572 sibling sweep).
--
-- A SECURITY DEFINER function in `public` is PostgREST-callable by `anon`
-- unless EXECUTE is revoked — an anonymous RPC running with the function
-- owner's rights (project_security_definer_anon_oracle; #422). The established
-- good pattern (get_*_vote_counts, set_trip_celebrant, ride_group_trip_id, …)
-- pairs each such function with `revoke execute … from public, anon; grant
-- execute … to authenticated;`. Three legacy DEFINER functions predate that
-- pattern and were still anon-callable. This migration closes them.
--
-- Severity: LOW / defense-in-depth (validated by the I5 security review). All
-- three are non-exploitable by anon today:
--   * accept_invite / create_trip_with_organizer self-guard on
--     `auth.uid() is null -> raise 42501` (line 1 of each body) and are only
--     ever called via an authenticated server-action client. The revoke
--     removes that in-body check as the *sole* gate, and aligns them with the
--     revoked pattern.
--   * is_trip_celebrant is a non-leaking boolean helper. It is NOT referenced
--     in any RLS policy (only called *inside* can_see_content, a SECURITY
--     DEFINER dispatcher that invokes it as its owner — so anon EXECUTE is
--     unnecessary). Policy-referenced helpers (is_trip_member,
--     is_trip_member_by_member_id, is_trip_organizer, is_trip_founder,
--     can_see_content) MUST keep anon EXECUTE — PostgreSQL checks EXECUTE
--     against the querying role for a function spliced into a policy, so
--     revoking anon would error anon queries instead of returning empty. They
--     are intentionally left untouched.
--
-- invite_preview stays anon-callable by design (the anon invite-preview page,
-- #219/#367). Trigger functions are never PostgREST-exposed.
--
-- Enforced by tests/unit/security-definer-anon-revoke.test.ts (static
-- migration scan; RLS-helper exemption derived from CREATE POLICY references).

revoke execute on function public.accept_invite(uuid, uuid) from public, anon;
grant execute on function public.accept_invite(uuid, uuid) to authenticated;

revoke execute on function public.create_trip_with_organizer(text, text, text, text, date, date, text[]) from public, anon;
grant execute on function public.create_trip_with_organizer(text, text, text, text, date, date, text[]) to authenticated;

revoke execute on function public.is_trip_celebrant(uuid) from public, anon;
grant execute on function public.is_trip_celebrant(uuid) to authenticated;
