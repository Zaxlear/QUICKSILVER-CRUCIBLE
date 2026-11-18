#!/usr/bin/env python3
import os, pathlib, sys
target = pathlib.Path(__file__).resolve().parents[4] / "tools" / "audio-pipeline" / "zero_cross_loop.py"
os.execv(sys.executable, [sys.executable, str(target), *sys.argv[1:]])
