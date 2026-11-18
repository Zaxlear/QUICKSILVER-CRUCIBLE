#!/usr/bin/env python3
import os, pathlib, sys
target = pathlib.Path(__file__).resolve().parents[4] / "tools" / "asset-factory" / "generate_sprite.py"
os.execv(sys.executable, [sys.executable, str(target), *sys.argv[1:]])
