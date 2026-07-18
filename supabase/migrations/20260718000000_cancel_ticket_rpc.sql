-- Cancel ticket via SECURITY DEFINER RPC (anon client cannot UPDATE tickets due to RLS)
CREATE OR REPLACE FUNCTION public.cancel_ticket(_ci TEXT, _ticket_id UUID)
RETURNS public.tickets LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _t public.tickets;
BEGIN
  SELECT * INTO _t FROM public.tickets WHERE id = _ticket_id;
  IF NOT FOUND OR _t.ci <> _ci THEN
    RAISE EXCEPTION 'Ticket no encontrado';
  END IF;
  IF _t.status <> 'waiting' THEN
    RAISE EXCEPTION 'Solo se puede cancelar en estado En espera';
  END IF;

  UPDATE public.tickets SET status = 'cancelled' WHERE id = _ticket_id
  RETURNING * INTO _t;

  RETURN _t;
END $$;

GRANT EXECUTE ON FUNCTION public.cancel_ticket(TEXT, UUID) TO anon, authenticated;
