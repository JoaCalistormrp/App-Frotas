
alter function public.tg_set_updated_at() set search_path = public;

revoke execute on function public.has_role(uuid, public.app_role) from public, anon;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

drop policy if exists "checklist photos public read" on storage.objects;
create policy "checklist photos auth read" on storage.objects for select to authenticated using (bucket_id = 'checklist-photos');
