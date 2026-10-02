-- Columna Pipeline "En espera": avance con el cliente sin decisión final.
-- La card permanece visible hasta que el operador la mueva; no es handoff.

alter type public.conversation_status add value if not exists 'en_espera';
