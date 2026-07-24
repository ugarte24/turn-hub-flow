-- Turnos sin CI obligatorio: un activo por dispositivo (público) o libre en mostrador (sin device_id).

CREATE OR REPLACE FUNCTION public.generate_ticket(
  _ci TEXT DEFAULT NULL,
  _area_id UUID DEFAULT NULL,
  _procedure_id UUID DEFAULT NULL,
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

  INSERT INTO public.tickets(day, number, code, ci, area_id, procedure_id, device_id)
  VALUES (_day, _next, _area_code || '-' || _next::text, _ci_norm, _area_id, _procedure_id, _device_id)
  RETURNING * INTO _new;

  RETURN _new;
END;
$$;

-- Cancelar por ticket + dispositivo (o solo ticket si no tiene device_id / es staff)
DROP FUNCTION IF EXISTS public.cancel_ticket(TEXT, UUID);

CREATE OR REPLACE FUNCTION public.cancel_ticket(_ticket_id UUID, _device_id UUID DEFAULT NULL)
RETURNS public.tickets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _t public.tickets;
BEGIN
  SELECT * INTO _t FROM public.tickets WHERE id = _ticket_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket no encontrado';
  END IF;

  IF _t.device_id IS NOT NULL THEN
    IF _device_id IS NULL OR _t.device_id <> _device_id THEN
      RAISE EXCEPTION 'Ticket no encontrado';
    END IF;
  END IF;

  IF _t.status <> 'waiting' THEN
    RAISE EXCEPTION 'Solo se puede cancelar en estado En espera';
  END IF;

  UPDATE public.tickets
  SET status = 'cancelled', finished_at = now()
  WHERE id = _ticket_id
  RETURNING * INTO _t;

  RETURN _t;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_ticket(UUID, UUID) TO anon, authenticated;

-- Calificar sin CI (opcionalmente validando dispositivo)
DROP FUNCTION IF EXISTS public.submit_ticket_rating(TEXT, UUID, INT, TEXT);

CREATE OR REPLACE FUNCTION public.submit_ticket_rating(
  _ticket_id UUID,
  _score INT,
  _comment TEXT DEFAULT NULL,
  _device_id UUID DEFAULT NULL
)
RETURNS public.ticket_ratings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _t public.tickets;
  _r public.ticket_ratings;
BEGIN
  IF _score < 1 OR _score > 5 THEN
    RAISE EXCEPTION 'La calificación debe ser entre 1 y 5';
  END IF;

  SELECT * INTO _t FROM public.tickets WHERE id = _ticket_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket no encontrado';
  END IF;

  IF _t.device_id IS NOT NULL THEN
    IF _device_id IS NULL OR _t.device_id <> _device_id THEN
      RAISE EXCEPTION 'Ticket no encontrado';
    END IF;
  END IF;

  IF _t.status <> 'finished' THEN
    RAISE EXCEPTION 'Solo se puede calificar un turno finalizado';
  END IF;

  IF EXISTS (SELECT 1 FROM public.ticket_ratings WHERE ticket_id = _ticket_id) THEN
    RAISE EXCEPTION 'Este turno ya fue calificado';
  END IF;

  INSERT INTO public.ticket_ratings(ticket_id, score, comment)
  VALUES (
    _ticket_id,
    _score,
    NULLIF(trim(COALESCE(_comment, '')), '')
  )
  RETURNING * INTO _r;

  RETURN _r;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_ticket_rating(UUID, INT, TEXT, UUID) TO anon, authenticated;
