-- Al cambiar el día (America/La_Paz), los turnos activos de días anteriores
-- dejan de bloquear al contribuyente y no permanecen en cola.

CREATE OR REPLACE FUNCTION public.expire_stale_tickets()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _today DATE := (now() AT TIME ZONE 'America/La_Paz')::date;
  _n INTEGER;
BEGIN
  UPDATE public.tickets
  SET
    status = 'cancelled',
    finished_at = COALESCE(finished_at, now()),
    transfer_to = NULL,
    origin_service_point_id = NULL,
    origin_operator_id = NULL
  WHERE day < _today
    AND status IN ('waiting', 'calling', 'in_service');

  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END;
$$;

GRANT EXECUTE ON FUNCTION public.expire_stale_tickets() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.generate_ticket(
  _ci TEXT,
  _area_id UUID,
  _procedure_id UUID,
  _device_id UUID DEFAULT NULL
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
  _other public.tickets;
  _new public.tickets;
BEGIN
  -- Expira turnos activos de días anteriores antes de validar "un ticket a la vez"
  PERFORM public.expire_stale_tickets();

  IF _ci IS NULL OR length(trim(_ci)) < 4 THEN
    RAISE EXCEPTION 'CI inválido';
  END IF;

  -- Mismo CI con turno activo HOY: devolver el mismo ticket
  SELECT * INTO _existing FROM public.tickets
   WHERE ci = _ci
     AND day = _day
     AND status IN ('waiting', 'calling', 'in_service')
   ORDER BY created_at DESC
   LIMIT 1;
  IF FOUND THEN
    RETURN _existing;
  END IF;

  -- Un turno activo por dispositivo (solo del día actual)
  IF _device_id IS NOT NULL THEN
    SELECT * INTO _other FROM public.tickets
     WHERE device_id = _device_id
       AND ci <> _ci
       AND day = _day
       AND status IN ('waiting', 'calling', 'in_service')
     ORDER BY created_at DESC
     LIMIT 1;
    IF FOUND THEN
      IF _other.status = 'waiting' THEN
        UPDATE public.tickets SET status = 'cancelled', finished_at = now()
         WHERE id = _other.id;
      ELSE
        RAISE EXCEPTION 'Este dispositivo ya tiene un turno en atención';
      END IF;
    END IF;
  END IF;

  SELECT code INTO _area_code FROM public.areas WHERE id = _area_id;
  IF _area_code IS NULL THEN RAISE EXCEPTION 'Área no encontrada'; END IF;

  INSERT INTO public.daily_counters(day, area_id, last_number)
  VALUES (_day, _area_id, 1)
  ON CONFLICT (day, area_id) DO UPDATE SET last_number = daily_counters.last_number + 1
  RETURNING last_number INTO _next;

  INSERT INTO public.tickets(day, number, code, ci, area_id, procedure_id, device_id)
  VALUES (_day, _next, _area_code || '-' || _next::text, _ci, _area_id, _procedure_id, _device_id)
  RETURNING * INTO _new;

  RETURN _new;
END;
$$;
