import sys
from pathlib import Path

CODE = Path(__file__).resolve().parents[2] / 'installer/runtime/build/api/code'
if str(CODE) not in sys.path:
    sys.path.insert(0, str(CODE))
