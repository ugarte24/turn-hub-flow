-- Caja: puesto tipo cashier + derivación transfer_to=cashier + área/trámite para turno directo.

ALTER TABLE public.service_points
  DROP CONSTRAINT IF EXISTS service_points_kind_check;

ALTER TABLE public.service_points
  ADD CONSTRAINT service_points_kind_check
  CHECK (kind IN ('standard', 'ruat', 'counter', 'cashier'));

UPDATE public.service_points
SET kind = 'cashier'
WHERE kind = 'standard' AND name ILIKE '%caja%';

ALTER TABLE public.tickets
  DROP CONSTRAINT IF EXISTS tickets_transfer_to_check;

ALTER TABLE public.tickets
  ADD CONSTRAINT tickets_transfer_to_check
  CHECK (transfer_to IS NULL OR transfer_to IN ('counter', 'origin', 'ruat', 'cashier'));

-- Área Caja + trámite Pago (turno directo)
INSERT INTO public.areas(code, name, sort_order)
SELECT 'C', 'Caja', 5
WHERE NOT EXISTS (SELECT 1 FROM public.areas WHERE code = 'C');

INSERT INTO public.procedures(area_id, name, sort_order)
SELECT a.id, 'Pago', 1
FROM public.areas a
WHERE a.code = 'C'
  AND NOT EXISTS (
    SELECT 1 FROM public.procedures p
    WHERE p.area_id = a.id AND p.name = 'Pago'
  );
