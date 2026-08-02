-- Ventanilla puede derivar un turno a cualquier RUAT libre (sin origen previo).

ALTER TABLE public.tickets
  DROP CONSTRAINT IF EXISTS tickets_transfer_to_check;

ALTER TABLE public.tickets
  ADD CONSTRAINT tickets_transfer_to_check
  CHECK (transfer_to IS NULL OR transfer_to IN ('counter', 'origin', 'ruat'));
