-- Rol Orientador: personal que saca turnos para contribuyentes sin celular o en grupo
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'host';
