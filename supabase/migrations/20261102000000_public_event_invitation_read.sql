grant usage on schema public to anon;
grant select on table public.invite_campaigns to anon;
drop policy if exists "Public can view active event invitations" on public.invite_campaigns;
create policy "Public can view active event invitations"
on public.invite_campaigns for select to anon
using (is_active = true);
