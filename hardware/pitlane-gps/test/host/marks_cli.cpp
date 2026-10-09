// Хост-утилита для сверки: читает «t v fix» построчно, печатает события JSON-строками.
#include <cstdio>
#include <cstdlib>
#include "../../src/marks.h"
int main() {
  marks::Tracker tr; marks::Event ev[4];
  long long t; double v; int fix;
  while (scanf("%lld %lf %d", &t, &v, &fix) == 3) {
    int n = tr.feed((int64_t)t, (float)v, fix != 0, ev, 4);
    for (int i = 0; i < n; i++) {
      const marks::Event& e = ev[i];
      if (e.kind == marks::EV_LAUNCH) printf("{\"e\":\"launch\",\"at\":%lld}\n", (long long)e.at);
      else if (e.kind == marks::EV_MARK) printf("{\"e\":\"mark\",\"k\":\"%s\",\"ms\":%d,\"at\":%lld}\n", e.key, (int)e.ms, (long long)e.at);
      else if (e.kind == marks::EV_ABORT) printf("{\"e\":\"abort\",\"at\":%lld}\n", (long long)e.at);
      else if (e.kind == marks::EV_END) printf("{\"e\":\"end\",\"at\":%lld,\"vmax\":%.3f,\"m\":[%d,%d,%d]}\n", (long long)e.at, e.vmax, (int)e.m[0], (int)e.m[1], (int)e.m[2]);
    }
  }
  return 0;
}
