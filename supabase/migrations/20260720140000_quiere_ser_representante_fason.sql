-- Columnas Pipeline: interés representante / fasón (handoff comercial)
alter type public.conversation_status add value if not exists 'quiere_ser_representante';
alter type public.conversation_status add value if not exists 'quiere_ser_fason';
