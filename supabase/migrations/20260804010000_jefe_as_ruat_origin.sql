-- Jefe de Recaudaciones: mismo flujo de origen que RUAT
-- (deriva a ventanilla/caja y recibe de vuelta al mismo puesto)

UPDATE public.service_points
SET kind = 'ruat'
WHERE name ILIKE '%jefe%'
  AND kind = 'standard';
