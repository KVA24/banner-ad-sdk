## 🚀 Installation

### Import
```html
<script src="dist/ad-sdk.min.js"></script>
```

Init sdk
```js
const sdk = new AdSDK({option});
```

---

## 🧠 Quick Start

```js
const sdk = new AdSDK({
  environment: AdSDK.env.SANDBOX,
  type: AdSDK.type.DISPLAY,
  position: "banner_top",
  debug: true,
});

sdk.start("ad-slot");
```

HTML:
```html
<div id="ad-slot" style="width:300px;height:250px;"></div>
```

---

## ⚙️ Configuration

| Option | Type | Default | Mô tả |
|--------|------|----------|--------|
| `environment` | `AdSDK.env.SANDBOX | AdSDK.env.PRODUCTION` | SANDBOX | Môi trường API fetch quảng cáo |
| `type` | `AdSDK.type.DISPLAY | OUTSTREAM | WELCOME | VAST` | DISPLAY | Loại quảng cáo |
| `position` | `string` | `undefined` | Vị trí quảng cáo |
| `width` / `height` | `number` | `null` | Kích thước cụ thể |
| `debug` | `boolean` | `false` | Bật log console |
| `postMessage` | `boolean` | `true` | Dùng message channel |
| `postMessageChannel` | `string` | `"ad-sdk"` | Tên kênh message |
| `targetOrigin` | `string` | `"*"` | Origin nhận message |

---

## 🧩 Public API

### `start(domId?: string)`
Khởi tạo quảng cáo.

- Với `DISPLAY`, `OUTSTREAM`: truyền `domId` của phần tử.
- Với `WELCOME` hoặc `VAST`: không cần `domId`, SDK sẽ tự tạo overlay.

```js
sdk.start("banner-container");
```

### `destroy()`
Huỷ quảng cáo và dọn DOM.
```js
sdk.destroy();
```

### `on(event, handler)`
Đăng ký sự kiện lifecycle hoặc tracking.
```js
sdk.on("loaded", (data) => console.log("Ad loaded:", data));
sdk.on("click", () => console.log("Clicked!"));
```

---

## 🎬 Supported Ad Formats

### 🖼️ Image
```json
{
  "format": "image",
  "url": "https://cdn.example.com/ad.jpg",
  "clickUrl": "https://landingpage.com"
}
```

### 🧱 HTML
```json
{ "format": "html", "html": "<div>Ad Content</div>" }
```

### 🪟 Iframe
```json
{ "format": "iframe", "url": "https://adnetwork.com/embed" }
```

### 📜 Script
```json
{ "format": "script", "url": "https://cdn.adnetwork.com/script.js" }
```

### 🎥 VAST Video
```json
{ "format": "VAST", "url": "https://adserver.com/vast.xml" }
```

#### Features
- Parse XML VAST 3.0+
- Hỗ trợ `skipoffset` trong `<Linear>`
- Countdown “Skip in 5…4…”
- Nút **Skip Ad ▶**, **Mute/Unmute 🔇/🔊**
- Tự fade-out khi kết thúc hoặc skip
- Tracking: `video_start`, `video_skip`, `video_complete`, `click`

#### Events
| Event | Khi nào |
|--------|----------|
| `vast_skip_timer_start` | Bắt đầu đếm skip |
| `vast_skip_available` | Có thể skip |
| `vast_skipped` | Người dùng skip |
| `video_start` | Video bắt đầu |
| `video_complete` | Video kết thúc |

---

## 🖥️ Welcome Overlay

```js
const sdk = new AdSDK({
  type: AdSDK.type.WELCOME,
  environment: AdSDK.env.SANDBOX,
});
sdk.start();
```

### Features
- Overlay full-screen
- Nút **✕ Close**
- Có thể chứa Image, HTML hoặc Video
- `sdk.destroy()` khi nhấn ✕ hoặc kết thúc video

---

## 🔄 Event Reference

| Event | Mô tả |
|--------|--------|
| `start` | Khi bắt đầu render |
| `loaded` | Khi fetch xong |
| `rendered` | Khi hiển thị xong |
| `click` | Khi click quảng cáo |
| `error` | Khi lỗi |
| `destroy` | Khi bị xoá |
| `close` | Khi user đóng overlay |
| `vast_*` | Các sự kiện video |

---

## 📡 PostMessage Integration

Gửi lệnh điều khiển từ iframe cha.

```js
window.postMessage({
  channel: "ad-sdk",
  type: "start",
  domId: "ad-slot"
});
```

| Type | Hành động |
|------|------------|
| `start` | Bắt đầu ad |
| `render` | Render thủ công |
| `destroy` | Huỷ ad |

---

## 🧱 Constants

```js
AdSDK.env = {
  SANDBOX: "SANDBOX",
  PRODUCTION: "PRODUCTION",
};

AdSDK.type = {
  DISPLAY: "DISPLAY",
  OUTSTREAM: "OUTSTREAM",
  WELCOME: "WELCOME",
  VAST: "VAST",
};
```

---

## 🧩 Example: VAST Welcome Overlay

```js
const sdk = new AdSDK({
  environment: AdSDK.env.PRODUCTION,
  type: AdSDK.type.WELCOME,
  debug: true,
});

sdk.on("vast_skipped", () => console.log("User skipped"));
sdk.on("close", () => console.log("Welcome closed"));
sdk.start();
```

---

## 🧰 Technical Info

| Key | Value |
|------|--------|
| SDK Format | ES6 → ES5 UMD |
| Output | `ad-sdk.min.js` |
| Minified & Obfuscated | ✔ |
| Browser | IE11+, Chrome, Safari, Edge |
| Build tools | Babel, Webpack, Terser, Obfuscator |

---

## 🪄 Integration Auto-Init

Bạn có thể tự động khởi tạo SDK bằng biến `window.SDK_INIT`:

```html
<script>
window.SDK_INIT = {
  environment: "SANDBOX",
  type: "WELCOME",
  position: "homepage",
  debug: true
};
</script>
<script src="dist/ad-sdk.min.js"></script>
```

👉 SDK sẽ tự chạy `new AdSDK(window.SDK_INIT)` và `start()`.
