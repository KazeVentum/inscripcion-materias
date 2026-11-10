-- Devolución atómica de cupo (rechazo, cancelación o conciliación).
--
-- KEYS[1] cupos:{periodo}:{nrc}        KEYS[2] cupototal:{periodo}:{nrc}
-- KEYS[3] ocupado:{estudianteId}       KEYS[4] reserva:{estudianteId}:{nrc}
-- KEYS[5] reservas:pendientes
-- ARGV[1] nrc   ARGV[2] miembro "{est}|{nrc}"   ARGV[3] canal Pub/Sub
-- ARGV[4] (opcional) "conciliar": solo actúa si el miembro sigue en reservas:pendientes,
--         de modo que no devuelve un cupo que el worker consolidó entre la lectura y la devolución.
--
-- Si cupototal no existe devuelve {-1, -1} sin escribir nada (no se puede acotar el cupo).
-- Idempotente: el cupo solo se devuelve si el estudiante aún tenía el NRC en ocupado,
-- y nunca supera cupototal. Devuelve {devuelto (0|1), libres}; libres = -1 si no hubo cambio.

if not redis.call('GET', KEYS[2]) then
  return {-1, -1}
end

if ARGV[4] == 'conciliar' and not redis.call('ZSCORE', KEYS[5], ARGV[2]) then
  return {0, -1}
end

local tenia = redis.call('HEXISTS', KEYS[3], ARGV[1])
redis.call('DEL', KEYS[4])
redis.call('ZREM', KEYS[5], ARGV[2])
if tenia == 0 then
  return {0, -1}
end
redis.call('HDEL', KEYS[3], ARGV[1])

local total = tonumber(redis.call('GET', KEYS[2]))
local libres = tonumber(redis.call('GET', KEYS[1]) or '0')
if libres < total then
  libres = redis.call('INCR', KEYS[1])
end
redis.call('PUBLISH', ARGV[3], cjson.encode({nrc = ARGV[1], libres = libres}))
return {1, libres}
