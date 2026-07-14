
-- Enums
CREATE TYPE public.app_role AS ENUM ('admin', 'operator');
CREATE TYPE public.ticket_status AS ENUM ('waiting','calling','in_service','finished','absent','cancelled');

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- User roles
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- Areas
CREATE TABLE public.areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,      -- V, I, A, T (letra para prefijo del ticket)
  name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.areas TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.areas TO authenticated;
GRANT ALL ON public.areas TO service_role;
ALTER TABLE public.areas ENABLE ROW LEVEL SECURITY;

-- Procedures
CREATE TABLE public.procedures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  area_id UUID NOT NULL REFERENCES public.areas(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.procedures TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.procedures TO authenticated;
GRANT ALL ON public.procedures TO service_role;
ALTER TABLE public.procedures ENABLE ROW LEVEL SECURITY;

-- Service points
CREATE TABLE public.service_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  operator_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.service_points TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.service_points TO authenticated;
GRANT ALL ON public.service_points TO service_role;
ALTER TABLE public.service_points ENABLE ROW LEVEL SECURITY;

-- Point <-> procedures
CREATE TABLE public.service_point_procedures (
  service_point_id UUID NOT NULL REFERENCES public.service_points(id) ON DELETE CASCADE,
  procedure_id UUID NOT NULL REFERENCES public.procedures(id) ON DELETE CASCADE,
  PRIMARY KEY (service_point_id, procedure_id)
);
GRANT SELECT ON public.service_point_procedures TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.service_point_procedures TO authenticated;
GRANT ALL ON public.service_point_procedures TO service_role;
ALTER TABLE public.service_point_procedures ENABLE ROW LEVEL SECURITY;

-- Daily counters (for ticket numbering)
CREATE TABLE public.daily_counters (
  day DATE NOT NULL,
  area_id UUID NOT NULL REFERENCES public.areas(id) ON DELETE CASCADE,
  last_number INT NOT NULL DEFAULT 0,
  PRIMARY KEY (day, area_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_counters TO authenticated;
GRANT ALL ON public.daily_counters TO service_role;
ALTER TABLE public.daily_counters ENABLE ROW LEVEL SECURITY;

-- Tickets
CREATE TABLE public.tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  day DATE NOT NULL DEFAULT (now() AT TIME ZONE 'America/La_Paz')::date,
  number INT NOT NULL,
  code TEXT NOT NULL,          -- e.g. V-023
  ci TEXT NOT NULL,
  area_id UUID NOT NULL REFERENCES public.areas(id),
  procedure_id UUID NOT NULL REFERENCES public.procedures(id),
  status ticket_status NOT NULL DEFAULT 'waiting',
  service_point_id UUID REFERENCES public.service_points(id),
  operator_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  called_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ
);
CREATE INDEX ON public.tickets (day, status);
CREATE INDEX ON public.tickets (ci, status);
CREATE INDEX ON public.tickets (service_point_id, status);

GRANT SELECT ON public.tickets TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.tickets TO authenticated;
GRANT ALL ON public.tickets TO service_role;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

-- Settings
CREATE TABLE public.settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.settings TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.settings TO authenticated;
GRANT ALL ON public.settings TO service_role;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

-- POLICIES
-- profiles: everyone auth reads, self updates, admin writes
CREATE POLICY "profiles readable by authenticated" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles self update" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid());
CREATE POLICY "profiles admin manage" ON public.profiles FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- user_roles: users read own, admin manage
CREATE POLICY "user_roles self read" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "user_roles admin manage" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- areas: public read, admin manage
CREATE POLICY "areas public read" ON public.areas FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "areas admin manage" ON public.areas FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- procedures
CREATE POLICY "procedures public read" ON public.procedures FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "procedures admin manage" ON public.procedures FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- service_points
CREATE POLICY "sp public read" ON public.service_points FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "sp admin manage" ON public.service_points FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- sp procedures
CREATE POLICY "spp public read" ON public.service_point_procedures FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "spp admin manage" ON public.service_point_procedures FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- daily_counters: only via server functions
CREATE POLICY "dc auth manage" ON public.daily_counters FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- tickets: public read (for TV + verification), server functions handle writes as user
CREATE POLICY "tickets public read" ON public.tickets FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "tickets auth insert" ON public.tickets FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "tickets auth update" ON public.tickets FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- settings
CREATE POLICY "settings public read" ON public.settings FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "settings admin manage" ON public.settings FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Trigger: create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles(id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name',''))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- RPC: generate ticket atomically
CREATE OR REPLACE FUNCTION public.generate_ticket(_ci TEXT, _area_id UUID, _procedure_id UUID)
RETURNS public.tickets LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _day DATE := (now() AT TIME ZONE 'America/La_Paz')::date;
  _area_code TEXT;
  _next INT;
  _existing public.tickets;
  _new public.tickets;
BEGIN
  IF _ci IS NULL OR length(trim(_ci)) < 4 THEN
    RAISE EXCEPTION 'CI inválido';
  END IF;

  -- check active ticket
  SELECT * INTO _existing FROM public.tickets
   WHERE ci = _ci AND status IN ('waiting','calling','in_service')
   ORDER BY created_at DESC LIMIT 1;
  IF FOUND THEN
    RETURN _existing;
  END IF;

  SELECT code INTO _area_code FROM public.areas WHERE id = _area_id;
  IF _area_code IS NULL THEN RAISE EXCEPTION 'Área no encontrada'; END IF;

  INSERT INTO public.daily_counters(day, area_id, last_number)
  VALUES (_day, _area_id, 1)
  ON CONFLICT (day, area_id) DO UPDATE SET last_number = daily_counters.last_number + 1
  RETURNING last_number INTO _next;

  INSERT INTO public.tickets(day, number, code, ci, area_id, procedure_id)
  VALUES (_day, _next, _area_code || '-' || lpad(_next::text,3,'0'), _ci, _area_id, _procedure_id)
  RETURNING * INTO _new;

  RETURN _new;
END $$;
GRANT EXECUTE ON FUNCTION public.generate_ticket(TEXT, UUID, UUID) TO anon, authenticated;

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.tickets;

-- Seed areas & procedures
INSERT INTO public.areas(code, name, sort_order) VALUES
  ('I','Inmueble',1),('V','Vehículo',2),('A','Actividades Económicas',3),('T','Tasas',4);

INSERT INTO public.procedures(area_id, name, sort_order)
SELECT id, p.name, p.sort_order FROM public.areas a,
  (VALUES ('Consultar deuda',1),('Transferencia',2),('Otros trámites',3)) AS p(name, sort_order)
WHERE a.code='I';

INSERT INTO public.procedures(area_id, name, sort_order)
SELECT id, p.name, p.sort_order FROM public.areas a,
  (VALUES ('Consultar deuda',1),('Tramitar placa',2),('Transferencia',3),('Otros trámites',4)) AS p(name, sort_order)
WHERE a.code='V';

INSERT INTO public.procedures(area_id, name, sort_order)
SELECT id, p.name, p.sort_order FROM public.areas a,
  (VALUES ('Consultar deuda',1),('Iniciar padrón',2),('Recoger padrón',3),('Otros trámites',4)) AS p(name, sort_order)
WHERE a.code='A';

INSERT INTO public.procedures(area_id, name, sort_order)
SELECT id, p.name, p.sort_order FROM public.areas a,
  (VALUES ('Plano',1),('Carpeta de transferencia',2),('Cementerio',3),('Certificación',4),('Remesura',5),('Otros trámites',6)) AS p(name, sort_order)
WHERE a.code='T';

INSERT INTO public.settings(key, value) VALUES
  ('working_hours','{"start":"08:30","end":"16:30"}'::jsonb),
  ('tv_display','{"institution":"Jefatura de Recaudaciones","subtitle":"Sistema Integral de Gestión de Atención por Turnos"}'::jsonb),
  ('sound','{"enabled":true,"voice":true}'::jsonb);
