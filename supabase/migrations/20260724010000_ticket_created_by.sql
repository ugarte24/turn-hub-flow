-- Quién generó el turno (mostrador / host)
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS tickets_created_by_day_idx
  ON public.tickets (created_by, day);

CREATE OR REPLACE FUNCTION public.generate_ticket(
  _ci TEXT DEFAULT NULL,
  _area_id UUID DEFAULT NULL,
  _procedure_id UUID DEFAULT NULL,
  _device_id UUID DEFAULT NULL,
  _created_by UUID DEFAULT NULL
)
RETURNS public.tickets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _day DATE := (now() AT TIME ZONE 'America/La_Paz')::date;
  _area_code TEXT;
  _next INT;
  _existing public.tickets;
  _new public.tickets;
  _ci_norm TEXT := COALESCE(NULLIF(trim(_ci), ''), '');
BEGIN
  IF _area_id IS NULL OR _procedure_id IS NULL THEN
    RAISE EXCEPTION 'Área y trámite son obligatorios';
  END IF;

  PERFORM public.expire_stale_tickets();

  -- Público: un turno activo por dispositivo hoy
  IF _device_id IS NOT NULL THEN
    SELECT * INTO _existing FROM public.tickets
     WHERE device_id = _device_id
       AND day = _day
       AND status IN ('waiting', 'calling', 'in_service')
     ORDER BY created_at DESC
     LIMIT 1;
    IF FOUND THEN
      RETURN _existing;
    END IF;
  END IF;

  -- Si aún envían CI (compatibilidad), un activo por CI hoy
  IF length(_ci_norm) >= 4 THEN
    SELECT * INTO _existing FROM public.tickets
     WHERE ci = _ci_norm
       AND day = _day
       AND status IN ('waiting', 'calling', 'in_service')
     ORDER BY created_at DESC
     LIMIT 1;
    IF FOUND THEN
      RETURN _existing;
    END IF;
  END IF;

  SELECT code INTO _area_code FROM public.areas WHERE id = _area_id;
  IF _area_code IS NULL THEN RAISE EXCEPTION 'Área no encontrada'; END IF;

  INSERT INTO public.daily_counters(day, area_id, last_number)
  VALUES (_day, _area_id, 1)
  ON CONFLICT (day, area_id) DO UPDATE SET last_number = daily_counters.last_number + 1
  RETURNING last_number INTO _next;

  INSERT INTO public.tickets(day, number, code, ci, area_id, procedure_id, device_id, created_by)
  VALUES (_day, _next, _area_code || '-' || _next::text, _ci_norm, _area_id, _procedure_id, _device_id, _created_by)
  RETURNING * INTO _new;

  RETURN _new;
END;
$$;
