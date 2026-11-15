# Blue Robotics Navigator

This optional hardware module runs on the Raspberry Pi connected to a Blue
Robotics Navigator board. It is deliberately separate from the ChivarGo API
and mobile dependencies because the Navigator library only supports `armv7`
and `aarch64` Linux targets.

## Install on BlueOS or Raspberry Pi

Configure the board interfaces first by following the official Navigator
hardware setup instructions. Then, from the ChivarGo repository:

```sh
python3 -m venv .venv-navigator
. .venv-navigator/bin/activate
python3 -m pip install -r hardware/navigator/requirements.txt
python3 hardware/navigator/led_temperature.py
```

The demo initializes the Navigator, turns on user LED 1, prints the onboard
temperature, and sets one attached NeoPixel to blue.

Do not run this library while ArduPilot is controlling the same Navigator
hardware. Blue Robotics recommends switching the board to SITL first when
using Navigator directly under BlueOS.
