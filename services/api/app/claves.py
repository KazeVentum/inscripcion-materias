"""Claves de Redis (CLAUDE.md, sección Redis)."""

RESERVAS_PENDIENTES = "reservas:pendientes"


def cupos(periodo: str, nrc: str) -> str:
    return f"cupos:{periodo}:{nrc}"


def cupototal(periodo: str, nrc: str) -> str:
    return f"cupototal:{periodo}:{nrc}"


def ocupado(estudiante_id: str) -> str:
    return f"ocupado:{estudiante_id}"


def reserva(estudiante_id: str, nrc: str) -> str:
    return f"reserva:{estudiante_id}:{nrc}"


def canal_cupos(periodo: str) -> str:
    return f"cupos:{periodo}"


def miembro(estudiante_id: str, nrc: str) -> str:
    return f"{estudiante_id}|{nrc}"
