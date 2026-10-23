-- Evita tickets duplicados cuando el cliente reintenta (internet lento / timeout).
-- 1) Clave de idempotencia por clic
-- 2) Un turno activo por dispositivo
-- 3) Un turno calling/in_service por puesto

CREATE TABLE IF NOT EXISTS public.ticket_generate_keys (
  id UUID PRIMARY KEY,
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ticket_generate_keys ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.ticket_generate_keys TO service_role;

-- Duplicados activos por dispositivo: conservar el más viejo
UPDATE public.tickets t
SET status = 'cancelled',
    finished_at = COALESCE(t.finished_at, now())
FROM (
  SELECT id,
         row_number() OVER (PARTITION BY device_id, day ORDER BY created_at ASC) AS rn
  FROM public.tickets
  WHERE device_id IS NOT NULL
    AND status IN ('waiting', 'calling', 'in_service')
) d
WHERE t.id = d.id AND d.rn > 1;

-- Dos turnos en el mismo puesto: devolver los extras a espera
UPDATE public.tickets t
SET status = 'waiting',
    service_point_id = NULL,
    operator_id = NULL,
    called_at = NULL,
    started_at = NULL
FROM (
  SELECT id,
         row_number() OVER (
           PARTITION BY service_point_id, day
           ORDER BY called_at DESC NULLS LAST, created_at DESC
         ) AS rn
  FROM public.tickets
  WHERE service_point_id IS NOT NULL
    AND status IN ('calling', 'in_service')
) d
WHERE t.id = d.id AND d.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS tickets_one_active_per_device
  ON public.tickets (device_id, day)
  WHERE device_id IS NOT NULL
    AND status IN ('waiting', 'calling', 'in_service');

CREATE UNIQUE INDEX IF NOT EXISTS tickets_one_active_per_desk
  ON public.tickets (service_point_id, day)
  WHERE service_point_id IS NOT NULL
    AND status IN ('calling', 'in_service');

DROP FUNCTION IF EXISTS public.generate_ticket(TEXT, UUID, UUID, UUID, UUID);
DROP FUNCTION IF EXISTS public.generate_ticket(TEXT, UUID, UUID, UUID, UUID, UUID);

CREATE OR REPLACE FUNCTION public.generate_ticket(
  _ci TEXT DEFAULT NULL,
  _area_id UUID DEFAULT NULL,
  _procedure_id UUID DEFAULT NULL,
  _device_id UUID DEFAULT NULL,
  _created_by UUID DEFAULT NULL,
  _idempotency_key UUID DEFAULT NULL
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

  IF _idempotency_key IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('sigat.gen.key:' || _idempotency_key::text));
    SELECT t.* INTO _existing
      FROM public.ticket_generate_keys k
      JOIN public.tickets t ON t.id = k.ticket_id
     WHERE k.id = _idempotency_key;
    IF FOUND THEN
      RETURN _existing;
    END IF;
  END IF;

  PERFORM public.expire_stale_tickets();

  IF _device_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('sigat.gen.device:' || _device_id::text || ':' || _day::text));
    SELECT * INTO _existing FROM public.tickets
     WHERE device_id = _device_id
       AND day = _day
       AND status IN ('waiting', 'calling', 'in_service')
     ORDER BY created_at ASC
     LIMIT 1;
    IF FOUND THEN
      IF _idempotency_key IS NOT NULL THEN
        INSERT INTO public.ticket_generate_keys(id, ticket_id)
        VALUES (_idempotency_key, _existing.id)
        ON CONFLICT (id) DO NOTHING;
      END IF;
      RETURN _existing;
    END IF;
  END IF;

  IF length(_ci_norm) >= 4 THEN
    SELECT * INTO _existing FROM public.tickets
     WHERE ci = _ci_norm
       AND day = _day
       AND status IN ('waiting', 'calling', 'in_service')
     ORDER BY created_at DESC
     LIMIT 1;
    IF FOUND THEN
      IF _idempotency_key IS NOT NULL THEN
        INSERT INTO public.ticket_generate_keys(id, ticket_id)
        VALUES (_idempotency_key, _existing.id)
        ON CONFLICT (id) DO NOTHING;
      END IF;
      RETURN _existing;
    END IF;
  END IF;

  SELECT code INTO _area_code FROM public.areas WHERE id = _area_id;
  IF _area_code IS NULL THEN RAISE EXCEPTION 'Área no encontrada'; END IF;

  INSERT INTO public.daily_counters(day, area_id, last_number)
  VALUES (_day, _area_id, 1)
  ON CONFLICT (day, area_id) DO UPDATE SET last_number = daily_counters.last_number + 1
  RETURNING last_number INTO _next;

  BEGIN
    INSERT INTO public.tickets(day, number, code, ci, area_id, procedure_id, device_id, created_by)
    VALUES (_day, _next, _area_code || '-' || _next::text, _ci_norm, _area_id, _procedure_id, _device_id, _created_by)
    RETURNING * INTO _new;
  EXCEPTION WHEN unique_violation THEN
    IF _device_id IS NOT NULL THEN
      SELECT * INTO _existing FROM public.tickets
       WHERE device_id = _device_id
         AND day = _day
         AND status IN ('waiting', 'calling', 'in_service')
       ORDER BY created_at ASC
       LIMIT 1;
      IF FOUND THEN
        IF _idempotency_key IS NOT NULL THEN
          INSERT INTO public.ticket_generate_keys(id, ticket_id)
          VALUES (_idempotency_key, _existing.id)
          ON CONFLICT (id) DO NOTHING;
        END IF;
        RETURN _existing;
      END IF;
    END IF;
    RAISE;
  END;

  IF _idempotency_key IS NOT NULL THEN
    INSERT INTO public.ticket_generate_keys(id, ticket_id)
    VALUES (_idempotency_key, _new.id)
    ON CONFLICT (id) DO NOTHING;
  END IF;

  RETURN _new;
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_ticket(TEXT, UUID, UUID, UUID, UUID, UUID) TO anon, authenticated, service_role;
