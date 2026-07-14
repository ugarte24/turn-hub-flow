-- Ratings after finished attention
CREATE TABLE public.ticket_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL UNIQUE REFERENCES public.tickets(id) ON DELETE CASCADE,
  score SMALLINT NOT NULL CHECK (score BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON public.ticket_ratings (created_at DESC);

GRANT SELECT ON public.ticket_ratings TO anon, authenticated;
GRANT ALL ON public.ticket_ratings TO service_role;
ALTER TABLE public.ticket_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ratings public read" ON public.ticket_ratings
  FOR SELECT TO anon, authenticated
  USING (true);

-- Public submit via SECURITY DEFINER RPC (validates CI + finished + once)
CREATE OR REPLACE FUNCTION public.submit_ticket_rating(
  _ci TEXT,
  _ticket_id UUID,
  _score INT,
  _comment TEXT DEFAULT NULL
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
  IF _t.ci <> trim(_ci) THEN
    RAISE EXCEPTION 'Ticket no encontrado';
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

GRANT EXECUTE ON FUNCTION public.submit_ticket_rating(TEXT, UUID, INT, TEXT) TO anon, authenticated;
