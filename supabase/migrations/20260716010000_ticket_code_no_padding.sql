-- Ticket codes without leading zeros: V-2 instead of V-002
CREATE OR REPLACE FUNCTION public.generate_ticket(_ci TEXT, _area_id UUID, _procedure_id UUID)
RETURNS public.tickets LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _day DATE := (now() AT TIME ZONE 'America/La_Paz')::date;
  _area_code TEXT;
  _next INT;
  _existing public.tickets;
  _new public.tickets;
BEGIN
  IF _ci IS NULL OR length(trim(_ci)) < 4 THEN
    RAISE EXCEPTION 'CI inválido';
  END IF;

  SELECT * INTO _existing FROM public.tickets
   WHERE ci = _ci AND status IN ('waiting','calling','in_service')
   ORDER BY created_at DESC LIMIT 1;
  IF FOUND THEN
    RETURN _existing;
  END IF;

  SELECT code INTO _area_code FROM public.areas WHERE id = _area_id;
  IF _area_code IS NULL THEN RAISE EXCEPTION 'Área no encontrada'; END IF;

  INSERT INTO public.daily_counters(day, area_id, last_number)
  VALUES (_day, _area_id, 1)
  ON CONFLICT (day, area_id) DO UPDATE SET last_number = daily_counters.last_number + 1
  RETURNING last_number INTO _next;

  INSERT INTO public.tickets(day, number, code, ci, area_id, procedure_id)
  VALUES (_day, _next, _area_code || '-' || _next::text, _ci, _area_id, _procedure_id)
  RETURNING * INTO _new;

  RETURN _new;
END $$;
