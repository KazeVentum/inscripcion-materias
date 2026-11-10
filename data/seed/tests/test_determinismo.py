"""La misma semilla y periodo producen exactamente los mismos datos y archivos."""

from __future__ import annotations

import hashlib
import os
import subprocess
import sys
from pathlib import Path

from seed.generate import DEFAULT_PERIODO, DEFAULT_SEED, build, escribir
from seed.rules import SEED_DIR

ARCHIVOS_GOLDEN = ("nrc.json", "estudiantes.json")


def test_dos_generaciones_son_iguales(datos):
    assert build(DEFAULT_SEED, DEFAULT_PERIODO) == datos


def test_archivos_identicos_byte_a_byte(datos, tmp_path):
    dir_a, dir_b = tmp_path / "a", tmp_path / "b"
    escribir(datos, dir_a)
    escribir(build(DEFAULT_SEED, DEFAULT_PERIODO), dir_b)
    archivos = sorted(p.name for p in dir_a.iterdir())
    assert archivos == sorted(p.name for p in dir_b.iterdir())
    for nombre in archivos:
        assert (dir_a / nombre).read_bytes() == (dir_b / nombre).read_bytes(), nombre


def test_otra_semilla_cambia_los_datos(datos):
    otros = build(DEFAULT_SEED + 1, DEFAULT_PERIODO)
    assert otros["estudiantes"] != datos["estudiantes"]


def _sha256(ruta: Path) -> str:
    return hashlib.sha256(ruta.read_bytes()).hexdigest()


def test_golden_en_subproceso_con_pythonhashseed_distinto(datos, tmp_path):
    """Los JSON de nrc y estudiantes no dependen del orden de hash de Python."""
    dir_actual = tmp_path / "actual"
    escribir(datos, dir_actual)
    hash_seed = "4243" if os.environ.get("PYTHONHASHSEED") == "4242" else "4242"
    dir_subproceso = tmp_path / "subproceso"
    codigo = (
        "import sys; from pathlib import Path; "
        "from seed.generate import build, escribir; escribir(build(), Path(sys.argv[1]))"
    )
    subprocess.run(
        [sys.executable, "-c", codigo, str(dir_subproceso)],
        cwd=SEED_DIR,
        env={**os.environ, "PYTHONHASHSEED": hash_seed},
        check=True,
    )
    for nombre in ARCHIVOS_GOLDEN:
        assert _sha256(dir_subproceso / nombre) == _sha256(dir_actual / nombre), nombre
