# Ad SDK Documentation
## Cài đặt

### Import Sdk

```html
<script src="https://cdn.jsdelivr.net/gh/KVA24/banner-ad-sdk@1.1.0/dist/ad-sdk.min.js"></script>
```

## Khởi tạo SDK

```javascript
// Banner Display
const sdk = new AdSDK({
  env: AdSDK.ENV.SANDBOX,
  type: AdSDK.TYPE.DISPLAY,
  debug: true,
  tenantId: {tenantId},
  streamId: {streamId},
  channelId: {channelId},
  title: "Tên nội dung",
  transId: "transaction-id",
  category: "1, 2, 3",
  keyword: "keyword1, keyword2",
  age: "25",
  gender: AdSDK.GENDER.MALE,
  platform: AdSDK.PLATFORM.WEB,
});

// Welcome
const welcomeSdk = new AdSDK({
  env: AdSDK.ENV.PRODUCTION,
  type: AdSDK.TYPE.WELCOME,
  debug: true,
  tenantId: {tenantId},
  streamId: {streamId},
  channelId: {channelId},
  title: "Tên nội dung",
  transId: "transaction-id",
  category: "1, 2, 3",
  keyword: "keyword1, keyword2",
  age: "25",
  gender: AdSDK.GENDER.MALE,
  platform: AdSDK.PLATFORM.WEB,
});
```

## Bảng tham số khởi tạo

| Tham số | Kiểu | Bắt buộc | Mặc định | Mô tả                                                                        |
|---------|------|----------|----------|------------------------------------------------------------------------------|
| `env` | String | Có | `"SANDBOX"` | Môi trường: `AdSDK.ENV.SANDBOX` hoặc `AdSDK.ENV.PRODUCTION`                  |
| `type` | String | Có | `"DISPLAY"` | Loại ads: `AdSDK.TYPE.DISPLAY`, `AdSDK.TYPE.OUTSTREAM`, `AdSDK.TYPE.WELCOME` |
| `tenantId` | String | Có | `"14"` | ID của tenant                                                                |
| `streamId` | String | Có | `""` | ID của stream/content                                                        |
| `channelId` | String | Có | `""` | ID của kênh                                                                  |
| `platform` | String | Có | `"WEB"` | Nền tảng: `TV`, `WEB`, `ANDROID`, `IOS`                                      |
| `debug` | Boolean | Không | `false` | Bật chế độ debug log                                                         |
| `title` | String | Không | `""` | Tiêu đề nội dung                                                             |
| `transId` | String | Không | `""` | Transaction ID                                                               |
| `category` | String | Không | `""` | Category list                                                                |
| `keyword` | String | Không | `""` | Keyword                                                                       |
| `age` | String | Không | `"0"` | Tuổi người dùng                                                              |
| `gender` | String | Không | `"NONE"` | Giới tính: `MALE`, `FEMALE`, `OTHER`, `NONE`                                 |
| `segments` | String | Không | `""` | Segment list                                                                 |
| `width` | String/Number | Không | `""` | Chiều rộng container (px)                                                    |
| `height` | String/Number | Không | `""` | Chiều cao container (px)                                                     |

## Các phương thức chính

### 1. start()

Bắt đầu hiển thị quảng cáo trong element được chỉ định.

```javascript
sdk.start(domId, bannerType, adSize, positionId)
```

**Tham số:**

| Tham số | Kiểu | Bắt buộc | Mô tả |
|---------|------|----------|-------|
| `domId` | String/Element | Có* | ID của element hoặc DOM element (*không bắt buộc với Welcome ads) |
| `bannerType` | String | Có | Loại banner: `"DISPLAY"` hoặc `"OVERLAY"` |
| `adSize` | String | Có | Kích thước: `"MINI_BANNER"`, `"MEDIUM_BANNER"`, `"LARGE_BANNER"`, `"PAUSE_BANNER"` |
| `positionId` | String | Có | ID vị trí quảng cáo |

**Ví dụ:**

```javascript
// Banner thông thường
sdk.start("ad-slot", "DISPLAY", "LARGE_BANNER", "homepage1");

// Overlay banner
sdk.start("overlay-slot", "OVERLAY", "MEDIUM_BANNER", "video-overlay");

// Welcome ads (không cần domId)
welcomeSdk.start();
```

### 2. dismiss()

Xóa quảng cáo khỏi element được chỉ định.

```javascript
sdk.dismiss(domId)
```

**Tham số:**

| Tham số | Kiểu | Bắt buộc | Mô tả |
|---------|------|----------|-------|
| `domId` | String | Không | ID của element. Nếu không truyền, xóa tất cả ads |

**Ví dụ:**

```javascript
sdk.dismiss("ad-slot");
```

### 3. destroy()

Hủy hoàn toàn SDK và xóa tất cả listeners, timers.

```javascript
sdk.destroy()
```

### 4. on()

Đăng ký lắng nghe event từ SDK.

```javascript
sdk.on(eventName, callback)
```

**Tham số:**

| Tham số | Kiểu | Bắt buộc | Mô tả |
|---------|------|----------|-------|
| `eventName` | String | Có | Tên event |
| `callback` | Function | Có | Hàm xử lý khi event xảy ra |

**Ví dụ:**

```javascript
sdk.on('loaded', (data) => {
  console.log('Ad loaded:', data);
});

sdk.on('error', (data) => {
  console.error('Ad error:', data);
});
```

## Danh sách Events

| Event | Mô tả | Dữ liệu trả về |
|-------|-------|----------------|
| `start` | SDK bắt đầu khởi tạo quảng cáo | `{ domId }` |
| `request` | Bắt đầu gọi API lấy quảng cáo | `{ domId }` |
| `loaded` | Dữ liệu quảng cáo đã được tải về | `{ domId, data }` |
| `rendered` | Quảng cáo đã render xong | `{ domId, ad }` |
| `impression` | Quảng cáo được hiển thị (tracking) | `{ domId }` |
| `click` | Người dùng click vào quảng cáo | `{ domId, ad }` |
| `skip` | Người dùng bỏ qua quảng cáo | `{ domId, ad }` |
| `dismiss` | Quảng cáo đã bị xóa | `{ domId }` |
| `destroy` | SDK đã bị hủy hoàn toàn | `{}` |
| `error` | Có lỗi xảy ra | `{ domId, err }` |
| `inDelay` | OVERLAY banner đang trong thời gian delay | `{ domId, remainingSeconds, delayOffSet }` |

## Constants (Hằng số)

### Environment
```javascript
AdSDK.ENV = {
  SANDBOX: "SANDBOX",
  PRODUCTION: "PRODUCTION"
}
```

### Type
```javascript
AdSDK.TYPE = {
  DISPLAY: "DISPLAY",
  WELCOME: "WELCOME"
}
```

### Platform
```javascript
AdSDK.PLATFORM = {
  TV: "TV",
  WEB: "WEB",
  ANDROID: "ANDROID",
  IOS: "IOS"
}
```

### Gender
```javascript
AdSDK.GENDER = {
  MALE: "MALE",
  FEMALE: "FEMALE",
  OTHER: "OTHER",
  NONE: "NONE"
}
```

### Ad Size
```javascript
AdSDK.AD_SIZE = {
  MINI_BANNER: "MINI_BANNER",
  MEDIUM_BANNER: "MEDIUM_BANNER",
  LARGE_BANNER: "LARGE_BANNER",
  PAUSE_BANNER: "PAUSE_BANNER"
}
```

### Banner Type
```javascript
AdSDK.BANNER_TYPE = {
  DISPLAY: "DISPLAY",
  OVERLAY: "OVERLAY"
}
```

## Ví dụ sử dụng

### 1. Banner cơ bản

```html
<div id="ad-container" style="width: 728px; height: 90px;"></div>

<script>
const sdk = new AdSDK({
  env: AdSDK.ENV.PRODUCTION,
  type: AdSDK.TYPE.DISPLAY,
  tenantId: "14",
  streamId: "123456",
  channelId: "789012"
});

// Lắng nghe events
sdk.on('rendered', (data) => {
  console.log('Ad rendered successfully');
});

sdk.on('error', (data) => {
  console.error('Ad error:', data.err);
});

// Hiển thị quảng cáo
sdk.start("ad-container", "DISPLAY", "LARGE_BANNER", "homepage");
</script>
```

### 2. Overlay banner khi video pause

```javascript
const video = document.getElementById('my-video');
const sdk = new AdSDK({
  env: AdSDK.ENV.PRODUCTION,
  type: AdSDK.TYPE.DISPLAY,
  tenantId: "14"
});

video.addEventListener('pause', () => {
  sdk.start("video-overlay", "OVERLAY", "PAUSE_BANNER", "video-pause");
});

video.addEventListener('play', () => {
  sdk.dismiss("video-overlay");
});

// Xử lý khi người dùng bỏ qua
sdk.on('skip', () => {
  sdk.dismiss("video-overlay");
});
```

### 3. Welcome ads (popup toàn màn hình)

```javascript
const welcomeSdk = new AdSDK({
  env: AdSDK.ENV.PRODUCTION,
  type: AdSDK.TYPE.WELCOME,
  tenantId: "14",
  streamId: "123456",
  channelId: "789012"
});

// Hiển thị welcome ad khi trang load
window.addEventListener('load', () => {
  welcomeSdk.start();
});

// Lắng nghe khi người dùng đóng
welcomeSdk.on('skip', () => {
  console.log('User closed welcome ad');
});
```

### 4. Xử lý nhiều banner slots

```javascript
const sdk = new AdSDK({
  env: AdSDK.ENV.PRODUCTION,
  type: AdSDK.TYPE.DISPLAY,
  tenantId: "14"
});

// Hiển thị banner ở nhiều vị trí
sdk.start("header-banner", "DISPLAY", "LARGE_BANNER", "header");
sdk.start("sidebar-banner", "DISPLAY", "MEDIUM_BANNER", "sidebar");
sdk.start("footer-banner", "DISPLAY", "LARGE_BANNER", "footer");

// Xóa một banner cụ thể
setTimeout(() => {
  sdk.dismiss("sidebar-banner");
}, 5000);
```

## Lưu ý

1. **Element DOM**: Element chứa quảng cáo phải tồn tại trước khi gọi `start()`
2. **OVERLAY Delay**: Banner OVERLAY có cơ chế delay để tránh hiển thị quá thường xuyên
3. **Welcome Ads**: Không cần truyền `domId` khi gọi `start()` cho Welcome ads
4. **Cleanup**: Luôn gọi `dismiss()` hoặc `destroy()` khi không còn cần thiết
5. **Events**: Đăng ký event handlers trước khi gọi `start()` để không bỏ lỡ events
6. **Debug**: Bật `debug: true` khi phát triển để xem chi tiết logs

