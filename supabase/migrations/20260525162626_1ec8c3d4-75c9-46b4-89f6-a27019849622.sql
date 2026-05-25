
-- VIEWER (consulta): read-only across admin tables
CREATE POLICY "viewer read profiles" ON public.profiles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'viewer'));
CREATE POLICY "viewer read vehicles" ON public.vehicles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'viewer'));
CREATE POLICY "viewer read checklists" ON public.checklists FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'viewer'));
CREATE POLICY "viewer read responses" ON public.checklist_responses FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'viewer'));
CREATE POLICY "viewer read maintenance" ON public.maintenance_orders FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'viewer'));
CREATE POLICY "viewer read roles" ON public.user_roles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'viewer'));

-- MECHANIC: read what they need + update maintenance orders
CREATE POLICY "mechanic read vehicles" ON public.vehicles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'mechanic'));
CREATE POLICY "mechanic read profiles" ON public.profiles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'mechanic'));
CREATE POLICY "mechanic read checklists" ON public.checklists FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'mechanic'));
CREATE POLICY "mechanic read responses" ON public.checklist_responses FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'mechanic'));
CREATE POLICY "mechanic read maintenance" ON public.maintenance_orders FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'mechanic'));
CREATE POLICY "mechanic update maintenance" ON public.maintenance_orders FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'mechanic')) WITH CHECK (public.has_role(auth.uid(), 'mechanic'));
