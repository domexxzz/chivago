#!/usr/bin/env python3
"""Exercise the Blue Robotics Navigator LEDs and temperature sensor."""

import bluerobotics_navigator as navigator


def main() -> None:
    navigator.init()

    # Turn on the first user LED.
    navigator.set_led(navigator.UserLed.Led1, True)

    # Read the Navigator's onboard temperature sensor.
    print(f"Temperature: {navigator.read_temp():.2f} °C")

    # Set a single connected RGB LED to blue.
    navigator.set_neopixel([[0, 0, 255]])


if __name__ == "__main__":
    main()
