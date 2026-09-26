// Минимальный UBX-драйвер для u-blox M9/M10 (CFG-VALSET, MON-VER, NAV-PVT)
#pragma once
#include <Arduino.h>

// Ключи конфигурации (u-blox M9/M10 Interface Description)
#define CFG_UART1_BAUDRATE            0x40520001UL  // U4
#define CFG_UART1INPROT_UBX           0x10730001UL  // L
#define CFG_UART1OUTPROT_UBX          0x10740001UL  // L
#define CFG_UART1OUTPROT_NMEA         0x10740002UL  // L
#define CFG_MSGOUT_UBX_NAV_PVT_UART1  0x20910007UL  // U1
#define CFG_RATE_MEAS                 0x30210001UL  // U2, мс
#define CFG_RATE_NAV                  0x30210002UL  // U2
#define CFG_NAVSPG_DYNMODEL           0x20110021UL  // E1, 4 = automotive
#define CFG_SIGNAL_GPS_ENA            0x1031001fUL
#define CFG_SIGNAL_SBAS_ENA           0x10310020UL
#define CFG_SIGNAL_GAL_ENA            0x10310021UL
#define CFG_SIGNAL_BDS_ENA            0x10310022UL
#define CFG_SIGNAL_QZSS_ENA           0x10310024UL
#define CFG_SIGNAL_GLO_ENA            0x10310025UL

#define VALSET_LAYER_RAM 0x01
#define VALSET_LAYER_BBR 0x02

struct NavPvt {
  uint32_t iTOW;
  uint8_t  fixType;
  bool     gnssFixOK;
  uint8_t  numSV;
  int32_t  lat, lon;      // 1e-7 град
  int32_t  hMSL;          // мм
  uint32_t hAcc;          // мм
  int32_t  gSpeed;        // мм/с
  int32_t  headMot;       // 1e-5 град
  uint32_t sAcc;          // мм/с
};

class UbxGps {
public:
  explicit UbxGps(HardwareSerial& s) : ser(s) {}

  // Находит текущую скорость порта, переводит модуль на 115200, выключает NMEA,
  // включает NAV-PVT, automotive, заданную частоту. true — если модуль отвечает ACK.
  bool begin(int rxPin, int txPin, uint8_t rateHz);
  bool setRate(uint8_t hz);          // 25 Гц — только одно созвездие (GPS) и только M9
  void poll();                       // вызывать в loop(): читает UART, разбирает кадры
  bool takePvt(NavPvt& out);         // true, если пришла новая эпоха
  bool isM10() const { return m10; }
  bool configured() const { return cfgOk; }
  uint8_t rate() const { return curRate; }
  const char* model() const { return modelStr; }

private:
  HardwareSerial& ser;
  int rx = -1, tx = -1;
  bool m10 = false, cfgOk = false, havePvt = false;
  uint8_t curRate = 10;
  char modelStr[32] = "?";
  NavPvt pvt{};

  // парсер
  uint8_t st = 0, cls = 0, id = 0, ckA = 0, ckB = 0;
  uint16_t len = 0, idx = 0;
  uint8_t buf[512];
  // ожидание ответа
  volatile uint8_t ackCls = 0, ackId = 0; volatile int ackState = 0; // 1 ack, -1 nak
  bool gotVer = false;

  void send(uint8_t c, uint8_t i, const uint8_t* p, uint16_t n);
  void onFrame();
  bool waitAck(uint8_t c, uint8_t i, uint32_t ms);
  bool probeBaud(uint32_t baud);
  bool valset(const uint32_t* keys, const uint32_t* vals, const uint8_t* sizes, int n, uint8_t layers, bool wantAck = true);
};
