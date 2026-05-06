
grant execute on function public.has_role(uuid, public.app_role) to authenticated;
update storage.buckets set public = false where id = 'checklist-photos';
