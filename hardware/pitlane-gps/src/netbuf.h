// PITLANE GPS — буфер точек для сети: кольцо в RAM, номера точек (seq), подтверждения сервера (ack),
// доотправка после обрыва. Чистый C++ (тестируется на хосте). Протокол — worker/src/gpslive.js.
#pragma once
#include <stdint.h>
#include <stddef.h>

#ifndef NET_BUF_POINTS
#define NET_BUF_POINTS 2048   // ≈ 82 с при 25 Гц, ≈ 3.4 мин при 10 Гц (20 байт на точку → 40 КБ RAM)
#endif

struct NetPt {
  int64_t t;          // UTC мс
  int32_t lat, lon;   // 1e-7 град
  uint16_t v_cms;     // скорость, см/с
  uint16_t hAcc_cm;   // точность, см
  uint16_t sAcc_cms;  // точность скорости, см/с
  uint8_t numSV;
  uint8_t fix;        // fixType | gnssFixOK<<3
};

class NetBuf {
 public:
  uint32_t push(const NetPt& p);              // → seq точки
  bool get(uint32_t seq, NetPt& out) const;
  uint32_t count() const { return n; }
  int64_t newest() const { return n ? (int64_t)next - 1 : -1; }   // последний seq или -1
  int64_t oldest() const { return n ? (int64_t)next - n : -1; }
  int64_t acked() const { return ack; }
  uint32_t dropped() const { return lost; }   // ушли из кольца, не дойдя до сервера
  void onAck(int64_t seq);                    // сервер подтвердил всё ≤ seq
  void onHello(int64_t serverAck);            // после (пере)подключения: сервер говорит, что у него есть
  int64_t cursor() const { return cur; }      // следующая к отправке
  uint32_t unacked() const;
  // JSON-пачка {"b":seq,"t0":ms,"p":[[dt,lat,lon,v,h,s,sv,fix],…]} с cursor; ≤ maxPts; двигает cursor.
  // Возвращает длину строки (0 — нечего слать или мало места).
  size_t nextBatch(char* buf, size_t cap, int maxPts);
  void rewind() { cur = ack + 1; clampCursor(); }   // обрыв: всё неподтверждённое — заново
  void clear() { n = 0; next = 0; ack = -1; cur = 0; lost = 0; }

 private:
  NetPt ring[NET_BUF_POINTS];
  uint32_t next = 0, n = 0, lost = 0;
  int64_t ack = -1, cur = 0;
  void clampCursor();
};

size_t fmtI64(char* out, int64_t v);  // без printf %lld (newlib-nano)
