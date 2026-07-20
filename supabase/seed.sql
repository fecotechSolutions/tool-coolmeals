-- Optional seed for demo data after running the schema migration.
-- Paste in Supabase SQL Editor.

insert into public.distributors (id, name, province, zones, contact_name, whatsapp, email, active, covered_provinces, postal_codes)
values
  ('11111111-1111-1111-1111-111111111111', 'Distribuidora Norte SA', 'Córdoba', array['Capital','Interior norte'], 'Laura Méndez', '+54 351 555-0101', 'laura@norte.com.ar', true, array['Córdoba','Tucumán'], array['5000','5001']),
  ('22222222-2222-2222-2222-222222222222', 'Cool Logística Cuyo', 'Mendoza', array['Gran Mendoza'], 'Martín Ríos', '+54 261 555-0202', 'martin@cuyo.cool', true, array['Mendoza','Neuquén'], array['5500','5515']),
  ('33333333-3333-3333-3333-333333333333', 'Litoral Fresh', 'Santa Fe', array['Rosario'], 'Ana Belucci', '+54 341 555-0303', 'ana@litoralfresh.com', true, array['Santa Fe','Entre Ríos'], array['2000','3000'])
on conflict (id) do nothing;

insert into public.leads (full_name, company, phone, email, province, city, postal_code, business_type, client_type, distributor_id, origin, status, is_customer)
values
  ('Carolina Suárez', 'Almacén El Sol', '+54 351 411-2200', 'carolina@elsol.com', 'Córdoba', 'Córdoba', '5000', 'Almacén', 'minorista', '11111111-1111-1111-1111-111111111111', 'whatsapp', 'en_curso', false),
  ('Logística Sur SA', 'Logística Sur SA', '+54 291 455-9090', 'comercial@logisticasur.com', 'Buenos Aires', 'Bahía Blanca', '8000', 'Distribución', 'distribuidor', null, 'llamada', 'en_curso', false),
  ('Marca Andina Foods', 'Marca Andina Foods', '+54 261 500-1212', 'ops@andinafoods.com', 'Mendoza', 'Mendoza', '5500', 'Marca propia', 'fason', null, 'web', 'nuevo', false);

insert into public.conversations (name, phone, origin, status, client_type, province, distributor_id, ai_summary, last_message, notes, tags, is_customer, messages)
values
  ('Carolina Suárez', '+54 351 411-2200', 'whatsapp', 'ia_atendiendo', 'minorista', 'Córdoba', '11111111-1111-1111-1111-111111111111', 'Consulta precios', '¿Lista actualizada?', '', '{}', false, '[]'::jsonb),
  ('Lucía Fernández', '+54 341 455-6677', 'instagram', 'derivado_distribuidor', 'retail', 'Santa Fe', '33333333-3333-3333-3333-333333333333', 'Derivada a Litoral Fresh', 'El dist. se contacta hoy', '', array['#derivado_Litoral_Fresh'], false, '[]'::jsonb),
  ('Logística Sur SA', '+54 291 455-9090', 'llamada', 'quiere_ser_distribuidor', 'distribuidor', 'Buenos Aires', null, 'Quiere ser distribuidor', '¿Requisitos?', '', '{}', false, '[]'::jsonb);
