#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_MCP23X17.h>
#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <ArduinoJson.h>

constexpr uint8_t NUM_CHIPS = 3;
constexpr uint8_t NUM_PINS = 6;
const uint8_t ADDRESSES[NUM_CHIPS] = {0x20, 0x21, 0x22};
Adafruit_MCP23X17 mcp[NUM_CHIPS];

const char *ssid = "IA Hokies";
const char *password = "1872!ChicagoMaroon";
const char *serverBase = "http://192.168.1.40:5000";

WiFiClient client;

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

void connectWiFi() {
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
  }
}

void updateServer(uint8_t chip, uint8_t pin, bool state) {
  if (WiFi.status() != WL_CONNECTED)
    return;
  HTTPClient http;
  String url = String(serverBase) + "/state";
  http.begin(client, url);
  http.addHeader("Content-Type", "application/json");
  StaticJsonDocument<200> doc;
  doc["chip"] = chip;
  doc["pin"] = pin;
  doc["state"] = state;
  String body;
  serializeJson(doc, body);
  http.POST(body);
  http.end();
}

void fetchInitialStates() {
  if (WiFi.status() != WL_CONNECTED)
    return;
  HTTPClient http;
  String url = String(serverBase) + "/states";
  http.begin(client, url);
  int code = http.GET();
  if (code == HTTP_CODE_OK) {
    StaticJsonDocument<512> doc;
    DeserializationError err = deserializeJson(doc, http.getString());
    if (!err) {
      JsonArray arr = doc["states"].as<JsonArray>();
      for (uint8_t chip = 0; chip < NUM_CHIPS && chip < arr.size(); ++chip) {
        JsonArray row = arr[chip].as<JsonArray>();
        for (uint8_t pin = 0; pin < NUM_PINS && pin < row.size(); ++pin) {
          bool state = row[pin];
          ButtonData &b = buttons[chip][pin];
          b.ledState = state;
          mcp[chip].digitalWrite(b.ledPin, state ? HIGH : LOW);
        }
      }
    }
  }
  http.end();
}

void setup() {
  Wire.begin(D2, D1); // SDA, SCL
  connectWiFi();

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

  fetchInitialStates();
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
            updateServer(chip, pin, b.ledState);
          }
        }
      }

      b.lastReading = reading;
    }
  }
}
