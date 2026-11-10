-- Consolidación atómica de una reserva (worker de confirmación).
-- Si la reserva existe y es la que el evento espera: la borra y quita su miembro de
-- reservas:pendientes. El cupo y ocupado no se tocan: la inscripción queda confirmada.
--
-- KEYS[1] reserva:{estudianteId}:{nrc}   KEYS[2] reservas:pendientes
-- ARGV[1] miembro "{est}|{nrc}"          ARGV[2] reservaId esperado ("" = no comparar)
-- Devuelve 1 si consolidó, 0 si la reserva ya no existía (venció y se concilió),
-- 2 si existe pero es otra reserva (el evento es de una reserva anterior del mismo NRC).

local actual = redis.call('GET', KEYS[1])
if not actual then
  return 0
end
if ARGV[2] ~= '' and actual ~= ARGV[2] then
  return 2
end
redis.call('DEL', KEYS[1])
redis.call('ZREM', KEYS[2], ARGV[1])
return 1
