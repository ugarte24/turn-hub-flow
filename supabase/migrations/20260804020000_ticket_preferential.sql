-- Atención preferente (tercera edad, discapacidad, etc.). Solo se marca desde Host.

ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS preferential BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS tickets_day_status_preferential_created_idx
  ON public.tickets (day, status, preferential DESC, created_at ASC);
