#!/usr/bin/env python3
import os, pathlib, sys
target = pathlib.Path(__file__).resolve().parents[4] / "tools" / "asset-factory" / "normal_map_sobel.py"
os.execv(sys.executable, [sys.executable, str(target), *sys.argv[1:]])
