/****************************************************
 * SERIAL COMMANDS
 *
 * Themes: t1, t2, t3, t4
 * Battlemaps: m1, m2, m3, m4
 *
 * Select theme: N   (1–4)
 * Select map: N     (1–4)
 *
 * Switch Media
 * Switch Bluetooth
 * Switch Data,<IP>,<USBStatus>
 *
 ****************************************************/

#define DISABLE_GxEPD2_DIAGNOSTIC_OUTPUT
#define ENABLE_GxEPD2_GFX 0

#include <GxEPD2_3C.h>
#include <Fonts/FreeMonoBold9pt7b.h>
#include <Fonts/FreeSansBold9pt7b.h>
#include <Fonts/FreeSans9pt7b.h>
#include <Fonts/FreeMono9pt7b.h>

// ---------------- Display ----------------
#define EPD_SS   10
#define EPD_DC   7
#define EPD_RST  9
#define EPD_BUSY 8

#define MAX_DISPLAY_BUFFER_SIZE 400
#define MAX_HEIGHT(EPD) \
  (EPD::HEIGHT <= (MAX_DISPLAY_BUFFER_SIZE / 2) / (EPD::WIDTH / 8) ? \
   EPD::HEIGHT : (MAX_DISPLAY_BUFFER_SIZE / 2) / (EPD::WIDTH / 8))

GxEPD2_3C<GxEPD2_290_C90c, MAX_HEIGHT(GxEPD2_290_C90c)>
display(GxEPD2_290_C90c(EPD_SS, EPD_DC, EPD_RST, EPD_BUSY));

// ---------------- Menu State ----------------
enum MenuState {
  STATE_MEDIA,
  STATE_BT,
  STATE_DATA
};

MenuState currentState = STATE_MEDIA;

// ---------------- Media ----------------
String themes[4]     = {"Forest", "Mine", "Saltmarsh", "Ocean"};
String battlemaps[4] = {"Map 1", "Map 2", "Map 3", "Map 4"};

int selectedTheme = -1;
int selectedMap   = -1;

// ---------------- Bluetooth ----------------
String btDevices[10];
int btCount = 0;

// ---------------- Data ----------------
String dataIP = "";
String dataUSBStatus = "";

// ---------------- Layout ----------------
const int topBarY = 14;
const int tableStartY = 36;
const int rowH = 18;

// ---------------- Joystick ----------------
int JoyStick_X = A0;
int JoyStick_Y = A1;
int JoyStick_Button = 6;
int Potentiometer = A2;

unsigned long lastJoyReport = 0;

// =================================================
// ================ DRAWING ========================
// =================================================
void drawCurrentMenu()
{
  display.setFullWindow();
  display.firstPage();
  do {
    display.fillScreen(GxEPD_WHITE);

    // --- Top bar (smaller font) ---
    display.setFont(&FreeSansBold9pt7b);
    display.setTextColor(GxEPD_BLACK);

    display.setCursor(10, topBarY);
    display.print(currentState == STATE_MEDIA ? "[Media]" : " Media ");

    display.setCursor(100, topBarY);
    display.print(currentState == STATE_BT ? "[Bluetooth]" : " Bluetooth ");

    display.setCursor(230, topBarY);
    display.print(currentState == STATE_DATA ? "[Data]" : " Data ");

    // --- Media table ---
    if (currentState == STATE_MEDIA)
    {
      display.setFont(&FreeSansBold9pt7b);

      for (int i = 0; i < 4; i++)
      {
        int y = tableStartY + i * rowH;

        // Theme column
        display.setTextColor(i == selectedTheme ? GxEPD_RED : GxEPD_BLACK);
        display.setCursor(10, y);
        display.print(String(i + 1) + ". " + themes[i]);

        // Battlemap column
        display.setTextColor(i == selectedMap ? GxEPD_RED : GxEPD_BLACK);
        display.setCursor(170, y);
        display.print(battlemaps[i]);
      }
    }

    // --- Bluetooth ---
    else if (currentState == STATE_BT)
    {
      display.setFont(&FreeSansBold9pt7b);
      for (int i = 0; i < btCount; i++)
      {
        display.setCursor(10, tableStartY + i * rowH);
        display.print(btDevices[i]);
      }
    }

    // --- Data ---
    else if (currentState == STATE_DATA)
    {
      display.setFont(&FreeSansBold9pt7b);
      display.setCursor(10, tableStartY);
      display.print("IP: " + dataIP);

      display.setCursor(10, tableStartY + rowH);
      display.print("USB: " + dataUSBStatus);
    }

  } while (display.nextPage());
}

void parseList(String list, String *target, int maxItems)
{
  for (int i = 0; i < maxItems; i++) target[i] = "";

  int i = 0;
  while (list.length() && i < maxItems)
  {
    int sep = list.indexOf(',');
    if (sep < 0)
    {
      target[i++] = list;
      break;
    }
    target[i++] = list.substring(0, sep);
    list = list.substring(sep + 1);
    list.trim();
  }
}


// =================================================
// ================ SERIAL =========================
// =================================================
void handleSerial()
{
  while (Serial1.available())
  {
    String cmd = Serial1.readStringUntil('\n');
    cmd.trim();

    // --- Select theme ---
    if (cmd.startsWith("Select theme:"))
    {
      int idx = cmd.substring(13).toInt() - 1;
      if (idx >= 0 && idx < 4)
      {
        selectedTheme = idx;
        drawCurrentMenu();
      }
    }

    // --- Select battlemap ---
    else if (cmd.startsWith("Select map:"))
    {
      int idx = cmd.substring(11).toInt() - 1;
      if (idx >= 0 && idx < 4)
      {
        selectedMap = idx;
        drawCurrentMenu();
      }
    }

    // --- Switch to Media ---
    else if (cmd.startsWith("Switch Media"))
    {
      currentState = STATE_MEDIA;

      // Reset selections
      selectedTheme = -1;
      selectedMap   = -1;

      // Parse Themes
      int tPos = cmd.indexOf("Themes:");
      int bPos = cmd.indexOf("Battlemaps:");

      if (tPos > 0 && bPos > tPos)
      {
        String themeList = cmd.substring(tPos + 7, bPos);
        themeList.trim();
        parseList(themeList, themes, 4);
      }

      // Parse Battlemaps
      if (bPos > 0)
      {
        String mapList = cmd.substring(bPos + 11);
        mapList.trim();
        parseList(mapList, battlemaps, 4);
      }

      drawCurrentMenu();
    }


    // --- Switch to Bluetooth + parse devices ---
    else if (cmd.startsWith("Switch Bluetooth"))
    {
      currentState = STATE_BT;
      btCount = 0;

      int p = cmd.indexOf("Devices:");
      if (p > 0)
      {
        String list = cmd.substring(p + 8);
        list.trim();

        while (list.length() && btCount < 10)
        {
          int sep = list.indexOf('|');
          if (sep < 0)
          {
            btDevices[btCount++] = list;
            break;
          }
          btDevices[btCount++] = list.substring(0, sep);
          list = list.substring(sep + 1);
          list.trim();
        }
      }

      drawCurrentMenu();
    }

    // --- Switch to Data ---
    else if (cmd.startsWith("Switch Data"))
    {
      int c1 = cmd.indexOf(',');
      int c2 = cmd.indexOf(',', c1 + 1);
      if (c1 > 0 && c2 > c1)
      {
        dataIP = cmd.substring(c1 + 1, c2);
        dataUSBStatus = cmd.substring(c2 + 1);
      }
      currentState = STATE_DATA;
      drawCurrentMenu();
    }
  }
}

// =================================================
// ================ SETUP / LOOP ===================
// =================================================
void setup()
{
  Serial1.begin(115200);

  pinMode(JoyStick_X, INPUT);
  pinMode(JoyStick_Y, INPUT);
  pinMode(JoyStick_Button, INPUT_PULLUP);
  pinMode(Potentiometer, INPUT);

  display.init(115200);
  display.setRotation(1);

  drawCurrentMenu();
}

void loop()
{
  handleSerial();

  unsigned long now = millis();
  if (now - lastJoyReport > 100)
  {
    lastJoyReport = now;

    float x = analogRead(JoyStick_X);
    float y = analogRead(JoyStick_Y);
    float pot = analogRead(Potentiometer);
    int buttonState = digitalRead(JoyStick_Button);

    Serial1.print("JOY X:");
    Serial1.print(x, 3);
    Serial1.print(" Y:");
    Serial1.print(y, 3);
    Serial1.print(" POT:");
    Serial1.print(pot, 3);
    Serial1.print(" Button:");
    Serial1.println(buttonState == LOW ? 1 : 0);
  }
}
