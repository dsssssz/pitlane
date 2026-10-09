#!/usr/bin/env bash
# Хост-тесты прошивки (без железа): буфер сети + сверка отметок C++ ↔ JS ↔ gps-core.js
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p build
g++ -std=c++17 -O1 -Wall -Wextra -DNET_BUF_POINTS=64 -o build/test_netbuf test_netbuf.cpp ../../src/netbuf.cpp
./build/test_netbuf
g++ -std=c++17 -O1 -Wall -Wextra -o build/marks_cli marks_cli.cpp ../../src/marks.cpp
node marks.test.mjs
