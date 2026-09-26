#!/usr/bin/env bash
# Собирает прошивку и склеивает один .bin на плату для прошивки через браузер (ESP Web Tools).
set -euo pipefail
cd "$(dirname "$0")"
pio run
PIO_PY="${PIO_PY:-$(dirname "$(command -v pio)")/python}"; [ -x "$PIO_PY" ] || PIO_PY=python3
ESPTOOL="$HOME/.platformio/packages/tool-esptoolpy/esptool.py"
BOOTAPP="$HOME/.platformio/packages/framework-arduinoespressif32/tools/partitions/boot_app0.bin"
mkdir -p web-flash
for env in esp32c3 esp32s3; do
  chip=${env/esp32/esp32-}; chip=${chip/esp32-c3/esp32c3}; chip=${chip/esp32-s3/esp32s3}
  b=.pio/build/$env
  "${PIO_PY:-python3}" "$ESPTOOL" --chip "$chip" merge_bin -o "web-flash/pitlane-gps-$env.bin" \
    --flash_mode dio --flash_size keep \
    0x0 "$b/bootloader.bin" 0x8000 "$b/partitions.bin" 0xe000 "$BOOTAPP" 0x10000 "$b/firmware.bin"
done
ls -la web-flash
