# Local RAG Assistant

Local RAG Assistant, kişisel veya kurumsal belgeleriniz (PDF, Markdown) üzerinden tamamen çevrimdışı (offline) soru-cevap yapmanızı sağlayan yerel bir RAG (Retrieval-Augmented Generation) uygulamasıdır. 

Verileriniz hiçbir dış sunucuya gönderilmez; tüm metin parçalama, indeksleme ve vektör arama işlemleri yerel bilgisayarınızda gerçekleşir.

---

## Mimari ve Teknolojiler

- **Backend:** Node.js, Express.js
- **Veritabanı / İndeksleme:** SQLite (`better-sqlite3`) — Türkçe kök ve ek duyarlı metin arama algoritması
- **LLM Entegrasyonu:** Ollama API (`mistral`, `llama3` vb.) & Foundry Local SDK desteği
- **İletişim Protokolü:** SSE (Server-Sent Events) ile canlı akışlı (streaming) yanıt üretimi
- **Frontend:** Vanilla JavaScript, HTML5, CSS3

---

## Ön Gereksinimler

Sistemi çalıştırmadan önce bilgisayarınızda aşağıdaki yazılımların kurulu olması gerekir:

1. **[Node.js](https://nodejs.org/)** (v16.0.0 veya üstü)
2. **[Ollama](https://ollama.ai/)**
   - Ollama'yı kurduktan sonra kullanmak istediğiniz dili/modeli indirin:
     ```bash
     ollama pull mistral
     ```

---

## Kurulum

1. Depoyu klonlayın veya indirin:
   ```bash
   git clone https://github.com/mert-carli/LocalRagProject.git
   cd LocalRagProject
   ```

2. Proje bağımlılıklarını yükleyin:
   ```bash
   npm install
   ```

---

## Çalıştırma

### Yöntem 1: Otomatik Başlatıcı (Windows)
Klasör içerisinde yer alan **`Baslat.bat`** dosyasına çift tıklayın. 
Script arka planda Ollama servisini kontrol edecek, web sunucusunu başlatacak ve sistem tam hazır olduğunda varsayılan tarayıcınızı otomatik olarak açacaktır.

### Yöntem 2: Terminal Üzerinden
Terminal veya Komut İstemi'nde aşağıdaki komutu çalıştırın:
```bash
npm start
```
Sunucu başlatıldıktan sonra tarayıcınızdan **`http://localhost:3000`** adresine gidin.

---

## Kullanım

1. **Belge Yükleme:** Sol panelden PDF veya Markdown formatındaki belgenizi yükleyin. Sistem belgeyi otomatik olarak küçük parçalara (chunks) bölüp yerel veritabanına indeksler.
2. **Soru Sorma:** Yüklediğiniz belgelerin içeriğiyle ilgili sorularınızı yazın.
3. **Kaynak Doğrulama:** Cevapların altında gösterilen *Kullanılan Kaynak Bağlamı* alanından yanıtın belgenin hangi bölümünden çıkarıldığını doğrulayabilirsiniz.

---

## Proje Yapısı

```text
LocalRagProject/
├── database/            # SQLite veritabanı dosyası (rag.db)
├── docs/                # İndekslenecek belgeler (PDF/MD)
├── public/              # Web arayüzü dosyaları (HTML, CSS, JS)
├── src/
│   ├── server.js        # Express web sunucusu ve SSE yayın hattı
│   ├── vectorStore.js   # Metin parçalama ve SQLite arama motoru
│   ├── rag.js           # RAG bağlam üretici
│   └── prompts.js       # Sistem istemi (System prompt)
├── Baslat.bat           # Windows tek tıkla başlatıcı
├── package.json
└── README.md
```

---

## Lisans

ISC
