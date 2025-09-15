#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_MCP23X17.h>

constexpr uint8_t NUM_CHIPS = 3;
constexpr uint8_t NUM_PINS = 6;
const uint8_t ADDRESSES[NUM_CHIPS] = {0x20, 0x21, 0x22};
Adafruit_MCP23X17 mcp[NUM_CHIPS];

struct ButtonData {
  uint8_t ledPin;
  uint8_t btnPin;
  bool ledState;
  bool buttonState;
  bool lastReading;
  unsigned long lastDebounceTime;
};

ButtonData buttons[NUM_CHIPS][NUM_PINS];
const unsigned long DEBOUNCE_DELAY = 50; // milliseconds

void setup() {
  Wire.begin(D2, D1); // SDA, SCL

  for (uint8_t chip = 0; chip < NUM_CHIPS; ++chip) {
    mcp[chip].begin_I2C(ADDRESSES[chip]);
    for (uint8_t pin = 0; pin < NUM_PINS; ++pin) {
      ButtonData &b = buttons[chip][pin];
      b.ledPin = pin;           // GPA0-GPA5
      b.btnPin = 8 + pin;       // GPB0-GPB5
      b.ledState = false;
      b.buttonState = HIGH;     // pull-up -> unpressed
      b.lastReading = HIGH;
      b.lastDebounceTime = 0;

      mcp[chip].pinMode(b.ledPin, OUTPUT);
      mcp[chip].digitalWrite(b.ledPin, LOW);
      mcp[chip].pinMode(b.btnPin, INPUT_PULLUP);
    }
  }
}

void loop() {
  for (uint8_t chip = 0; chip < NUM_CHIPS; ++chip) {
    for (uint8_t pin = 0; pin < NUM_PINS; ++pin) {
      ButtonData &b = buttons[chip][pin];
      bool reading = mcp[chip].digitalRead(b.btnPin);

      if (reading != b.lastReading) {
        b.lastDebounceTime = millis();
      }

      if ((millis() - b.lastDebounceTime) > DEBOUNCE_DELAY) {
        if (reading != b.buttonState) {
          b.buttonState = reading;
          if (b.buttonState == LOW) {
            b.ledState = !b.ledState;
            mcp[chip].digitalWrite(b.ledPin, b.ledState ? HIGH : LOW);
          }
        }
      }

      b.lastReading = reading;
    }
  }
}
