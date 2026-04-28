#!/usr/bin/env node

// Kullanım:
//   node ws-throughput-test.js <token>
//   node ws-throughput-test.js <token> 10   ← 10 saniye test

const WebSocket = require("ws");

const token = process.argv[2];
const durationSec = parseInt(process.argv[3] || "5", 10);

if (!token) {
  console.error("Kullanım: node ws-throughput-test.js <token> [süre_saniye]");
  process.exit(1);
}

const WS_URL = `ws://localhost:8082/ws/live?token=${token}`;

const counts = {
  "city:traffic_lights": 0,
  "city:density": 0,
  "city:speed_violations": 0,
  total: 0,
};

const snapshots = []; // her saniyenin anlık sayıları

console.log(`\n🔌 Bağlanıyor: ${WS_URL}`);
console.log(`⏱  Test süresi: ${durationSec} saniye\n`);

const ws = new WebSocket(WS_URL);

ws.on("open", () => {
  console.log("✅ Bağlantı kuruldu, mesajlar sayılıyor...\n");

  // Her saniye anlık snapshot al
  const interval = setInterval(() => {
    const snap = {
      traffic_lights: counts["city:traffic_lights"],
      density: counts["city:density"],
      speed_violations: counts["city:speed_violations"],
      total: counts.total,
    };
    snapshots.push(snap);

    const sec = snapshots.length;
    const prev =
      snapshots.length > 1
        ? snapshots[snapshots.length - 2]
        : { traffic_lights: 0, density: 0, speed_violations: 0, total: 0 };

    const tl = snap.traffic_lights - prev.traffic_lights;
    const den = snap.density - prev.density;
    const spd = snap.speed_violations - prev.speed_violations;
    const tot = snap.total - prev.total;

    const bar = (n) => "█".repeat(Math.min(Math.floor(n / 10), 50));

    console.log(`--- Saniye ${sec} ---`);
    console.log(
      `  traffic_lights   : ${String(tl).padStart(4)} msg/s  ${bar(tl)}`,
    );
    console.log(
      `  density          : ${String(den).padStart(4)} msg/s  ${bar(den)}`,
    );
    console.log(
      `  speed_violations : ${String(spd).padStart(4)} msg/s  ${bar(spd)}`,
    );
    console.log(`  TOPLAM           : ${String(tot).padStart(4)} msg/s\n`);
  }, 1000);

  // Test bitince özet
  setTimeout(() => {
    clearInterval(interval);
    ws.close();

    if (snapshots.length < 2) {
      console.log("⚠️  Yeterli veri yok.");
      process.exit(1);
    }

    // İlk saniyeyi atla (bağlantı gecikmesi olabilir)
    const relevant = snapshots.slice(1);
    const deltas = relevant.map((s, i) => {
      const prev = snapshots[i]; // snapshots[i] = relevant[i-1] offset
      return {
        tl: s.traffic_lights - prev.traffic_lights,
        den: s.density - prev.density,
        spd: s.speed_violations - prev.speed_violations,
        tot: s.total - prev.total,
      };
    });

    const avg = (arr, key) =>
      Math.round(arr.reduce((a, b) => a + b[key], 0) / arr.length);
    const min = (arr, key) => Math.min(...arr.map((b) => b[key]));
    const max = (arr, key) => Math.max(...arr.map((b) => b[key]));

    console.log("═══════════════════════════════════════");
    console.log("  ÖZET (ilk saniye hariç)");
    console.log("═══════════════════════════════════════");
    console.log(`  Kanal                  Ort    Min    Max`);
    console.log(
      `  traffic_lights    ${String(avg(deltas, "tl")).padStart(6)} ${String(min(deltas, "tl")).padStart(6)} ${String(max(deltas, "tl")).padStart(6)} msg/s`,
    );
    console.log(
      `  density           ${String(avg(deltas, "den")).padStart(6)} ${String(min(deltas, "den")).padStart(6)} ${String(max(deltas, "den")).padStart(6)} msg/s`,
    );
    console.log(
      `  speed_violations  ${String(avg(deltas, "spd")).padStart(6)} ${String(min(deltas, "spd")).padStart(6)} ${String(max(deltas, "spd")).padStart(6)} msg/s`,
    );
    console.log(`  ─────────────────────────────────────`);
    console.log(
      `  TOPLAM            ${String(avg(deltas, "tot")).padStart(6)} ${String(min(deltas, "tot")).padStart(6)} ${String(max(deltas, "tot")).padStart(6)} msg/s`,
    );
    console.log("═══════════════════════════════════════");

    const hedef = 300;
    const kanallar = [
      { ad: "traffic_lights", ort: avg(deltas, "tl") },
      { ad: "density", ort: avg(deltas, "den") },
      { ad: "speed_violations", ort: avg(deltas, "spd") },
    ];

    console.log("\n  Hedef kontrol (≥300 msg/s):");
    let basarili = true;
    for (const k of kanallar) {
      const ok = k.ort >= hedef;
      if (!ok) basarili = false;
      console.log(`  ${ok ? "✅" : "❌"} ${k.ad.padEnd(20)} ${k.ort} msg/s`);
    }
    console.log(
      basarili
        ? "\n✅ Tüm kanallar hedefe ulaştı.\n"
        : "\n❌ Bazı kanallar hedefe ulaşamadı.\n",
    );

    process.exit(basarili ? 0 : 1);
  }, durationSec * 1000);
});

ws.on("message", (data) => {
  try {
    const msg = JSON.parse(data);
    if (msg.channel && counts[msg.channel] !== undefined) {
      counts[msg.channel]++;
    }
    counts.total++;
  } catch {
    // malformed — geç
  }
});

ws.on("error", (err) => {
  console.error("❌ WebSocket hatası:", err.message);
  process.exit(1);
});

ws.on("close", () => {
  // setTimeout zaten handle etti
});
