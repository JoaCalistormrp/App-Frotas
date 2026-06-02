
-- Allow mechanics to insert maintenance orders
CREATE POLICY "mechanic insert maintenance"
ON public.maintenance_orders
FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'mechanic'::app_role));

-- Allow mechanics to use the order counter
CREATE POLICY "moc mechanic"
ON public.maintenance_order_counters
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'mechanic'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'mechanic'::app_role));

-- Update next_order_number to allow mechanics
CREATE OR REPLACE FUNCTION public.next_order_number(_base text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  n INTEGER;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role)
       OR public.has_role(auth.uid(), 'mechanic'::app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  INSERT INTO public.maintenance_order_counters(base_code, last_number)
  VALUES (_base, 1)
  ON CONFLICT (base_code) DO UPDATE SET last_number = public.maintenance_order_counters.last_number + 1
  RETURNING last_number INTO n;
  RETURN 'OS' || LPAD(n::text, 2, '0') || '_' || _base;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.next_order_number(text) TO authenticated;

-- Allow mechanics to create and manage checklists (as themselves)
CREATE POLICY "mechanic insert checklists"
ON public.checklists
FOR INSERT TO authenticated
WITH CHECK (driver_id = auth.uid() AND public.has_role(auth.uid(), 'mechanic'::app_role));

CREATE POLICY "mechanic update checklists"
ON public.checklists
FOR UPDATE TO authenticated
USING (driver_id = auth.uid() AND public.has_role(auth.uid(), 'mechanic'::app_role))
WITH CHECK (driver_id = auth.uid() AND public.has_role(auth.uid(), 'mechanic'::app_role));

-- Allow mechanics to insert/update responses for their own checklists
CREATE POLICY "mechanic insert responses"
ON public.checklist_responses
FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'mechanic'::app_role)
  AND EXISTS (SELECT 1 FROM public.checklists c WHERE c.id = checklist_responses.checklist_id AND c.driver_id = auth.uid())
);

CREATE POLICY "mechanic update responses"
ON public.checklist_responses
FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'mechanic'::app_role)
  AND EXISTS (SELECT 1 FROM public.checklists c WHERE c.id = checklist_responses.checklist_id AND c.driver_id = auth.uid())
)
WITH CHECK (
  public.has_role(auth.uid(), 'mechanic'::app_role)
  AND EXISTS (SELECT 1 FROM public.checklists c WHERE c.id = checklist_responses.checklist_id AND c.driver_id = auth.uid())
);
