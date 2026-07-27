-- Actividades Económicas: "Otros tramites" al final
UPDATE public.procedures p
SET sort_order = v.sort_order
FROM (VALUES
  ('3dff4811-8512-484e-b073-27ec76122d39'::uuid, 1), -- Consultar deuda
  ('115c3f81-acc6-4a7e-84eb-1e4abd70823e'::uuid, 2), -- Iniciar padrón
  ('e92b428d-e186-4127-bc4a-b7a396c037ab'::uuid, 3), -- Recoger padrón
  ('827a4236-038a-49b4-a24e-e27dce3a9500'::uuid, 4), -- Renovar padron
  ('8646e1db-b6c3-4dd4-b52c-17f6570146a8'::uuid, 5)  -- Otros tramites
) AS v(id, sort_order)
WHERE p.id = v.id;
