// Хост-тест буфера: кольцо, ack, доотправка после обрыва, переполнение. g++ -std=c++17
#include <cassert>
#include <cstdio>
#include <cstring>
#include <string>
// NET_BUF_POINTS=64 задаётся флагом компилятора (и для netbuf.cpp)
#include "../../src/netbuf.h"
static NetPt pt(int64_t t, int i) { NetPt p{}; p.t = t; p.lat = 555716000 + i; p.lon = 381419000; p.v_cms = (uint16_t)(i * 10); p.hAcc_cm = 90; p.sAcc_cms = 12; p.numSV = 14; p.fix = 11; return p; }
static int rows(const char* s) { int n = 0; for (const char* c = strstr(s, "\"p\":[") + 5; *c; c++) if (*c == '[') n++; return n; }
int main() {
  static NetBuf b; char out[4096];
  char num[24]; fmtI64(num, 1791580599533LL); assert(std::string(num) == "1791580599533");
  fmtI64(num, -42); assert(std::string(num) == "-42");
  assert(b.nextBatch(out, sizeof out, 10) == 0);
  for (int i = 0; i < 10; i++) b.push(pt(1000000 + i * 40, i));
  assert(b.newest() == 9 && b.oldest() == 0 && b.unacked() == 10);
  size_t l = b.nextBatch(out, sizeof out, 4);
  assert(l > 0 && strncmp(out, "{\"b\":0,\"t0\":1000000,\"p\":[[0,555716000,381419000,0,90,12,14,11],[40,", 66) == 0);
  assert(rows(out) == 4 && b.cursor() == 4);
  l = b.nextBatch(out, sizeof out, 100);
  assert(strncmp(out, "{\"b\":4,\"t0\":1000160,", 20) == 0 && rows(out) == 6 && b.cursor() == 10);
  assert(b.nextBatch(out, sizeof out, 10) == 0);
  b.onAck(3);                       // сервер подтвердил 0..3, потом обрыв
  b.rewind();
  assert(b.cursor() == 4 && b.unacked() == 6);
  b.onHello(7);                     // после переподключения сервер говорит: у меня до 7
  assert(b.cursor() == 8 && b.acked() == 7);
  l = b.nextBatch(out, sizeof out, 100);
  assert(strncmp(out, "{\"b\":8,", 7) == 0 && rows(out) == 2);
  b.onAck(9); assert(b.unacked() == 0);
  b.onHello(-1);                    // сервер забыл (новый bid) — шлём всё, что ещё в кольце
  assert(b.cursor() == 0);
  b.onAck(9);
  // переполнение: 100 точек без связи в кольцо на 64 — 36 старых теряются (честный счётчик)
  for (int i = 10; i < 110; i++) b.push(pt(1000000 + i * 40, i));
  assert(b.count() == 64 && b.oldest() == 46 && b.newest() == 109 && b.dropped() == 36);
  assert(b.cursor() == 46);
  l = b.nextBatch(out, sizeof out, 80);
  assert(strncmp(out, "{\"b\":46,", 8) == 0 && rows(out) == 64);
  // дыра во времени > 60 с — пачка обрывается, остаток следующей
  b.onAck(109);
  b.push(pt(2000000, 1)); b.push(pt(2000040, 2)); b.push(pt(2100000, 3));
  l = b.nextBatch(out, sizeof out, 10); assert(rows(out) == 2);
  l = b.nextBatch(out, sizeof out, 10); assert(strncmp(out, "{\"b\":112,\"t0\":2100000", 21) == 0 && rows(out) == 1);
  // маленький буфер вывода — 0, курсор не двигается
  b.rewind(); int64_t c0 = b.cursor(); char tiny[20];
  assert(b.nextBatch(tiny, sizeof tiny, 10) == 0 && b.cursor() == c0);
  printf("netbuf: all passed\n");
  return 0;
}
