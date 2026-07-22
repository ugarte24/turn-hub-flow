-- Puesto: tipo para flujo RUAT <-> ventanilla
ALTER TABLE public.service_points
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'standard';

ALTER TABLE public.service_points
  DROP CONSTRAINT IF EXISTS service_points_kind_check;

ALTER TABLE public.service_points
  ADD CONSTRAINT service_points_kind_check
  CHECK (kind IN ('standard', 'ruat', 'counter'));

UPDATE public.service_points
SET kind = 'counter'
WHERE kind = 'standard' AND name ILIKE '%ventanilla%';

UPDATE public.service_points
SET kind = 'ruat'
WHERE kind = 'standard' AND name ILIKE '%ruat%';

-- Ticket: origen y destino de derivación
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS origin_service_point_id UUID REFERENCES public.service_points(id),
  ADD COLUMN IF NOT EXISTS origin_operator_id UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS transfer_to TEXT;

ALTER TABLE public.tickets
  DROP CONSTRAINT IF EXISTS tickets_transfer_to_check;

ALTER TABLE public.tickets
  ADD CONSTRAINT tickets_transfer_to_check
  CHECK (transfer_to IS NULL OR transfer_to IN ('counter', 'origin'));

CREATE INDEX IF NOT EXISTS tickets_transfer_to_idx ON public.tickets (day, status, transfer_to);
CREATE INDEX IF NOT EXISTS tickets_origin_sp_idx ON public.tickets (origin_service_point_id, status);
