# UrbanStream - Akıllı Şehir ve Kentsel Veri Analitiği Platformu

Bu doküman, UrbanStream projesinin mikroservis mimarisini, veri akışını, kullanılan teknolojileri ve klasör yapısını detaylı bir şekilde açıklamak amacıyla hazırlanmıştır.

---

## 1. Sistemin Genel Amacı ve Mimarisi
UrbanStream; şehirdeki araç yoğunluğu, yaya hareketliliği, trafik ışığı arızaları ve hız ihlalleri gibi kentsel verileri **gerçek zamanlı (real-time)** olarak toplayan, analiz eden ve yapay zeka ile geleceğe yönelik projeksiyonlar sunan bir **Akıllı Şehir** platformudur.

Sistem baştan uca **Mikroservis** mimarisiyle tasarlanmıştır. Yüksek hacimli IoT (Nesnelerin İnterneti) verilerini kaldırabilmesi için modern ve asenkron bir veri işleme boru hattı (pipeline) kullanır.

---

## 2. Veri Akışı (Data Pipeline)
Veri, sahadaki cihazlardan (kameralar/sensörler) başlayıp kullanıcının ekranına ulaşana kadar aşağıdaki yolu izler:

1. **Veri Üretimi (Edge/Sensör):** Sahadaki cihazlar (projemizde `fake-data-service` tarafından simüle edilir) anlık trafik verilerini **MQTT Broker'a** (örneğin EMQX veya Mosquitto) gönderir.
2. **Mesaj Kuyruğuna Geçiş:** `mqtt-bridge` servisi MQTT'yi dinler. Gelen verileri alır ve daha dayanıklı/ölçeklenebilir olan **Apache Kafka**'ya aktarmak üzere yollar.
3. **Güvenlik ve Doğrulama:** Kafka'ya giden veriler önce `kafka-gatekeeper` üzerinden geçer. Burada veri formatı doğrulanır ve rate-limit (hız sınırı) uygulanır.
4. **Veritabanına Yazım:** `analytics-consumer` servisi Kafka topic'lerini sürekli dinler. Gelen binlerce veriyi alır ve Büyük Veri (Big Data) analizleri için optimize edilmiş **ClickHouse** veritabanına kaydeder.
5. **Yapay Zeka Analizi:** `ai-service` (Python), belirli aralıklarla ClickHouse'daki geçmiş verileri okur, makine öğrenmesi modelleriyle gelecekteki trafik yoğunluğunu tahmin eder ve sonuçları tekrar ClickHouse'a yazar.
6. **Kullanıcıya Sunum:** 
   - `api-service`, ClickHouse'daki analizleri ve raporları **REST API** ile Frontend'e sunar. Ayrıca canlı akış için WebSocket üzerinden anlık verileri frontend'e fırlatır.
   - `auth-service`, kullanıcı girişlerini ve yetkilendirmeleri (PostgreSQL kullanarak) denetler.
   - `frontend` (React), tüm bu verileri haritalar ve grafikler eşliğinde kullanıcıya görselleştirir.

---

## 3. Klasör ve Servis Yapısı (`/services/`)

Projenin `/services` dizini altında 8 adet bağımsız servis bulunmaktadır. Her biri kendi işinden sorumlu, izole edilmiş yapılardır.

### 🌐 1. `frontend` (Kullanıcı Arayüzü)
- **Teknoloji:** React, TypeScript, Vite, Tailwind CSS, Recharts (Grafikler), Mapbox/Leaflet (Haritalar).
- **Görev:** Kullanıcının etkileşime girdiği görsel panelleri oluşturur.
- **Detaylar:** 
  - `src/pages/LivePage.tsx`: WebSocket üzerinden saniyede onlarca kez gelen verileri "Kayan Pencere" (Sliding Window) mantığıyla tarayıcıyı dondurmadan çizer.
  - `src/pages/MapPage.tsx`: Verileri harita üzerinde canlı markörler (işaretçiler) ile gösterir. Context Leak olmaması için *mount-once* mimarisi kullanır.
  - `src/pages/UsersPage.tsx`: Adminlerin kullanıcı eklediği, "Rol Şablonları" ve "Kullanıcıya Özel İzinler" (Granular Permissions) atadığı kapsamlı yönetim sayfası.

### 🔐 2. `auth-service` (Kimlik Doğrulama ve Yetkilendirme)
- **Teknoloji:** Go (Golang), PostgreSQL, JWT.
- **Görev:** Kullanıcıların sisteme güvenli giriş yapmasını ve sayfalara erişim yetkilerini yönetir.
- **Detaylar:** Sadece "Admin", "Operatör" gibi sabit rollerle yetinmez; her kullanıcıya özel (Örn: Sadece harita görebilir ama kullanıcı silemez) izin atamasına olanak tanıyan özel bir `user_permissions` tablosu barındırır.

### 📊 3. `api-service` (Analitik ve Canlı Yayın API'si)
- **Teknoloji:** Go, ClickHouse, WebSocket (Hub yapısı).
- **Görev:** Frontend'in ihtiyaç duyduğu tüm istatistik, rapor ve tahmin verilerini ClickHouse'dan çeker.
- **Detaylar:** `GetHourlyDensity` gibi metodlarla saatlik/günlük gruplamalar yapar. Aynı zamanda bir WebSocket Hub'ı çalıştırarak Kafka'dan (veya MQTT'den) gelen verileri anlık olarak Dashboard'a iter.

### 🧠 4. `ai-service` (Yapay Zeka ve Tahmin)
- **Teknoloji:** Python, Makine Öğrenmesi Kütüphaneleri (Prophet, Scikit-Learn vb.).
- **Görev:** Zaman serisi analizleri yapar. "Yarın saat 14:00'te X bölgesindeki trafik yoğunluğu ne olacak?" sorusunun cevabını hesaplar ve sisteme kaydeder.

### 📥 5. `analytics-consumer` (Büyük Veri Tüketicisi)
- **Teknoloji:** Go, Kafka Consumer, ClickHouse.
- **Görev:** Saniyede binlerce veri gelebileceği için bu verilerin kaybolmadan veritabanına yazılmasını sağlar. Kafka'dan okur, batch (toplu) haline getirir ve ClickHouse'a tek seferde basarak performansı maksimize eder.

### 🌉 6. `mqtt-bridge` (MQTT - Kafka Köprüsü)
- **Teknoloji:** Go, MQTT Client, Kafka Producer.
- **Görev:** IoT cihazları düşük güç tükettiği için MQTT protokolüyle konuşur. Ancak MQTT geçmiş verileri tutmaz. Bu servis MQTT'ye gelen anlık veriyi anında kapıp Kafka'ya atar.

### 🛡️ 7. `kafka-gatekeeper` (Kafka Güvenlik Duvarı)
- **Teknoloji:** Go.
- **Görev:** Dışarıdan Kafka'ya doğrudan veri yazılmasını engeller. Hatalı veri formatlarını veya siber saldırı (DDoS) niteliğindeki aşırı veri trafiğini (Rate Limiting) filtreler.

### 🤖 8. `fake-data-service` (Simülasyon Motoru)
- **Teknoloji:** Go.
- **Görev:** Projenin gerçek kameralara bağlı olmadığı test ve geliştirme süreçlerinde, şehrin farklı bölgelerinden geliyormuş gibi sahte (mock) "araç geçti", "yaya geçti", "kırmızı ışık arızalandı" verileri üretir.

---

## 4. Kullanılan Modern Tasarım Desenleri (Patterns)

*   **Granular Authorization (Tanecikli Yetkilendirme):** Roller dışında `user_permissions` ile kişiye özel izin eklenebilmesi.
*   **Sliding Window Buffer:** Frontend'de RAM şişmesini engellemek için anlık verilerin sadece son 60 kaydının tutulması.
*   **Event-Driven Architecture:** Mikroservislerin birbirini beklemeden Kafka üzerinden haberleşmesi. Yüksek erişilebilirlik (High Availability) sağlar.
*   **OLAP Veritabanı Kullanımı:** Geleneksel SQL (Postgres) yerine, büyük veriyi saniyeler içinde analiz etmek için Sütun-Tabanlı (Columnar) ClickHouse kullanılması.

Bu doküman, projeye yeni dahil olan bir geliştiricinin sistemin tam olarak nasıl çalıştığını anlaması için temel rehber niteliğindedir.
