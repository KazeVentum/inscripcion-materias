-- Reserva atómica de cupo (CLAUDE.md, "Flujo de inscripción", paso 2).
-- Aborta SIN escribir nada al primer fallo y se ejecuta con un único EVALSHA.
--
-- KEYS[1] cupos:{periodo}:{nrc}            KEYS[2] ocupado:{estudianteId}
-- KEYS[3] reserva:{estudianteId}:{nrc}     KEYS[4] reservas:pendientes
-- ARGV[1] nrc                              ARGV[2] JSON {"materiaId", "bloques": [...]}
-- ARGV[3] vencimiento (ms epoch)           ARGV[4] TTL de la reserva (s)
-- ARGV[5] miembro "{est}|{nrc}"            ARGV[6] canal Pub/Sub cupos:{periodo}
-- ARGV[7] reservaId (uuid): es el valor de reserva:{est}:{nrc}; consolidar.lua lo compara
--
-- Devuelve {estado, extra}: {'ok', libres} | {'error', motivo} | {'ya_inscrita', nrc}
--                          | {'cruce', nrcConflicto} | {'sin_cupo', ''}

local function minutos(hora)
  local h, m = string.match(hora, '(%d+):(%d+)')
  return tonumber(h) * 60 + tonumber(m)
end

local cupos = redis.call('GET', KEYS[1])
if not cupos then
  return {'error', 'cupo_inexistente'}
end

local nuevo = cjson.decode(ARGV[2])
local actuales = redis.call('HGETALL', KEYS[2])

-- 1. Misma materia ya ocupada (reservada o confirmada)
for i = 1, #actuales, 2 do
  local otro = cjson.decode(actuales[i + 1])
  if otro.materiaId == nuevo.materiaId then
    return {'ya_inscrita', actuales[i]}
  end
end

-- 2. Cruce de bloques: mismo día y inicio_a < fin_b and inicio_b < fin_a
for i = 1, #actuales, 2 do
  local otro = cjson.decode(actuales[i + 1])
  for _, a in ipairs(nuevo.bloques) do
    for _, b in ipairs(otro.bloques) do
      if a.dia == b.dia and minutos(a.inicio) < minutos(b.fin) and minutos(b.inicio) < minutos(a.fin) then
        return {'cruce', actuales[i]}
      end
    end
  end
end

-- 3. Cupo
if tonumber(cupos) <= 0 then
  return {'sin_cupo', ''}
end

-- 4. Escritura (a partir de aquí no hay más retornos tempranos)
local libres = redis.call('DECR', KEYS[1])
redis.call('HSET', KEYS[2], ARGV[1], ARGV[2])
redis.call('SET', KEYS[3], ARGV[7], 'EX', tonumber(ARGV[4]))
redis.call('ZADD', KEYS[4], tonumber(ARGV[3]), ARGV[5])
redis.call('PUBLISH', ARGV[6], cjson.encode({nrc = ARGV[1], libres = libres}))
return {'ok', libres}
