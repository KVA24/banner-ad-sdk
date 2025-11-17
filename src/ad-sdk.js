// src/ad-sdk.fixed.js
// Ad SDK — fixed: robust start/destroy, race-condition protection, refresh
import md5 from "crypto-js/md5";

// ---- Utils ----
const now = () => Date.now();
const log = (debug, msg, level = 'log') => {
  if (!debug) return;
  const style = {
    log: 'color:#4CAF50;font-weight:bold',
    warn: 'color:#FF9800;font-weight:bold',
    error: 'color:#F44336;font-weight:bold'
  };
  console[level] && console[level](`%c[AdSDK]`, style[level] || '', msg);
};
const extend = (dest, ...sources) => Object.assign(dest, ...sources);

// ---- Main SDK ----
export default class AdSDK {
  constructor(cfg = {}) {
    // Environment presets
    const baseFetch = {
      responseType: "json",
      fetchTimeout: 8000,
      fetchRetries: 2,
      fetchBackoff: 300,
    };
    const ENV = {
      SANDBOX: extend({}, baseFetch, {fetchUrl: "https://dev-pubads.wiinvent.tv/v1/adserving/banner/campaign"}),
      PRODUCTION: extend({}, baseFetch, {fetchUrl: "https://dev-pubads.wiinvent.tv/v1/adserving/banner/campaign"}),
    };
    
    const baseCfg = extend(
      {
        tenantId: cfg.tenantId || "14",
        adId: cfg.adId || '',
        streamId: cfg.streamId || '',
        channelId: cfg.channelId || '',
        positionId: cfg.positionId || '',
        platform: cfg.platform || "WEB",
        deviceType: cfg.deviceType || "DESKTOP",
        transId: cfg.transId || '',
        category: cfg.category || '',
        keyword: cfg.keyword || '',
        age: cfg.age || "0",
        gender: cfg.gender || "NONE",
        token: cfg.token || '',
        segments: cfg.segments || '',
        
        env: (cfg.env || "SANDBOX").toUpperCase(),
        type: (cfg.type || "INSTREAM").toUpperCase(),
        position: cfg.position,
        adSize: cfg.adSize,
        bannerType: cfg.bannerType,
        debug: !!cfg.debug,
        width: cfg.width || '',
        height: cfg.height || '',
        postMessage: true,
        postMessageChannel: "ad-sdk",
        targetOrigin: "*",
      },
      ENV[(cfg.env || "SANDBOX").toUpperCase()] || ENV.SANDBOX
    );
    
    const {sign, salt, deviceId} = this._sign(baseCfg.positionId, baseCfg.tenantId);
    
    const fetchUrl =
      `${baseCfg.fetchUrl}?t=${baseCfg.tenantId}`
      + `&sid=${baseCfg.streamId}`
      + `&pid=${baseCfg.positionId}`
      + `&cid=${baseCfg.channelId}`
      + `&p=${baseCfg.platform}`
      + `&dt=${baseCfg.deviceType}`
      + `&d=${deviceId}`
      + `&si=${sign}`
      + `&ai=${baseCfg.adId || ""}`
      + `&ct=${baseCfg.contentType || ""}`
      + `&tt=${baseCfg.title || ""}`
      + `&ti=${baseCfg.transId || ""}`
      + `&ctg=${baseCfg.category || ""}`
      + `&kw=${baseCfg.keyword || ""}`
      + `&a=${baseCfg.age || "0"}`
      + `&gd=${baseCfg.gender || "NONE"}`
      + `&sm=${baseCfg.segments || ""}`;
    
    this.cfg = {...baseCfg, fetchUrl};
    
    // Internal state
    this._handlers = {};
    this._started = false; // indicates SDK has been started at least once
    this._adData = null;
    this._messageListener = null;
    this.domEl = null;
    this.container = null;
    
    // token helps avoid race conditions between concurrent starts/renders
    this._startToken = 0;
    
    // Optional postMessage API
    if (this.cfg.postMessage) this._initPostMessage();
    
    log(this.cfg.debug, "SDK initialized (no DOM attached yet).");
  }
  
  // ---- Event system ----
  on(ev, fn) {
    if (!this._handlers[ev]) this._handlers[ev] = [];
    this._handlers[ev].push(fn);
  }
  
  off(ev, fn) {
    if (!this._handlers[ev]) return;
    this._handlers[ev] = this._handlers[ev].filter((f) => f !== fn);
  }
  
  emit(ev, data) {
    (this._handlers[ev] || []).forEach((fn) => {
      try {
        fn(data);
      } catch {
      }
    });
  }
  
  _sign(positionId, tenantId) {
    if (!md5) throw new Error("MD5 module not found. Import crypto-js/md5 first.");
    
    const salt = Array.from({length: 20}, () =>
      "abcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(Math.random() * 36)]
    ).join("");
    
    const key = "wiinvent-viewer-id";
    let deviceId = localStorage.getItem(key);
    if (!deviceId) {
      let dt = Date.now();
      deviceId = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (dt + Math.random() * 16) % 16 | 0;
        dt = Math.floor(dt / 16);
        return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
      });
      localStorage.setItem(key, deviceId);
    }
    
    const raw = `${positionId}${deviceId}${tenantId}${salt}`;
    const hash = md5(raw).toString();
    const sign = salt + hash;
    
    if (this.cfg?.debug) {
      console.groupCollapsed("[AdSDK] Sign Generation");
      console.log("positionId:", positionId);
      console.log("tenantId:", tenantId);
      console.log("deviceId:", deviceId);
      console.log("salt:", salt);
      console.log("sign:", sign);
      console.groupEnd();
    }
    
    return {sign, salt, deviceId};
  }
  
  async _fetchAd(token, bannerType, adSize) {
    const {fetchUrl, position, fetchTimeout, fetchRetries, fetchBackoff, debug} = this.cfg;
    const url = `${fetchUrl}&bt=${bannerType || ""}&as=${adSize || ""}`; // note: fetchUrl already contains query params
    let attempt = 0;
    
    const doFetch = async () => {
      attempt++;
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), fetchTimeout);
        const res = await fetch(url, {signal: controller.signal});
        clearTimeout(timeoutId);
        
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        // if startToken changed meanwhile, ignore the fetched result
        if (token !== this._startToken) {
          log(debug, `Fetch result ignored (stale token)`, 'warn');
          throw new Error('stale_fetch');
        }
        return json;
      } catch (err) {
        if (err.message === 'stale_fetch') throw err; // bubble up so start() knows not to show error
        if (attempt <= fetchRetries) {
          log(debug, `Retrying fetch (${attempt}) after ${fetchBackoff}ms due to ${err.message}`);
          await new Promise((r) => setTimeout(r, fetchBackoff));
          return doFetch();
        } else {
          throw new Error(`Fetch failed after retries: ${err.message}`);
        }
      }
    };
    
    return doFetch();
  }
  
  // Start — idempotent: duplicate calls ignored
  async start(domId, bannerType, adSize) {
    // Always allow start: re-render fresh view
    if (!domId && this.cfg.type !== AdSDK.TYPE.WELCOME) throw new Error("AdSDK.start(domId) requires a DOM ID");
    
    // Prepare DOM (reuse domEl if exists)
    if (this.cfg.type === AdSDK.TYPE.WELCOME) {
      if (!this._welcomeDom) this.domEl = this._createWelcomeDom();
    } else {
      this.domEl = document.getElementById(domId);
      if (!this.domEl) throw new Error(`AdSDK: element #${domId} not found`);
      if (bannerType === "DISPLAY") {
        this.domEl.innerHTML = "";
      }
    }
    
    // Fresh container every start
    const container = document.createElement("div");
    container.className = "ad-sdk-wrapper";
    if (this.cfg.width) {
      container.style.width = `${this.cfg.width}px`
    } else container.style.width = "100%";
    if (this.cfg.height) {
      container.style.height = `${this.cfg.height}px`
    } else container.style.height = "100%";
    
    this.container = container;
    this.domEl.appendChild(this.container);
    
    // Mark SDK as initialized only once
    this._started = true;
    
    // New token for each start (replace old pending async work)
    const token = ++this._startToken;
    this.emit("start", {domId});
    log(this.cfg.debug, `SDK start (force new render) token:${token}`);
    
    try {
      this.emit("request", {domId});
      const data = await this._fetchAd(token, bannerType, adSize);
      // If token changed, fetched result was ignored by _fetchAd when stale and an error thrown
      this._adData = data;
      this._renderAd(data, token, domId);
      this._track("impression", data.trackingEvents.impression);
      this.emit("loaded", {domId, data});
    } catch (err) {
      if (err.message === 'stale_fetch') {
        // expected when a newer start/refresh happened — do nothing
        log(this.cfg.debug, "Stale fetch ignored.");
        return;
      }
      log(this.cfg.debug, `Ad fetch error: ${err.message}`);
      this._renderFallback(domId);
      this.emit("error", {domId, err});
    }
  }
  
  // Refresh ad without resetting SDK: safe way to fetch+render new ad
  async refresh() {
    if (!this._started) {
      log(this.cfg.debug, "Cannot refresh before start.");
      return;
    }
    const token = ++this._startToken;
    const oldContainer = this.container; // preserve existing container until new render ready
    try {
      const data = await this._fetchAd(token);
      this._adData = data;
      // create a new temporary container to avoid flicker
      const newContainer = document.createElement('div');
      newContainer.className = 'ad-sdk-wrapper';
      if (this.cfg.width) newContainer.style.width = `${this.cfg.width}px`;
      if (this.cfg.height) newContainer.style.height = `${this.cfg.height}px`;
      
      // attach newContainer but keep old until replace
      this.domEl.appendChild(newContainer);
      // set active container to new one
      this.container = newContainer;
      
      this._renderAd(data, token);
      // remove old container when new one rendered (or immediately if not present)
      if (oldContainer?.parentNode) oldContainer.parentNode.removeChild(oldContainer);
      this._track('impression', data.trackingEvents.impression);
      this.emit('loaded', data);
    } catch (err) {
      if (err.message === 'stale_fetch') {
        log(this.cfg.debug, 'Stale refresh ignored.');
        return;
      }
      log(this.cfg.debug, `Refresh fetch error: ${err.message}`);
      this._renderFallback();
      this.emit('error', err);
    }
  }
  
  // Destroy — view-only: do NOT reset SDK internals like domEl or _started
  destroy(domId) {
    if (this._iframeCleanup) {
      this._iframeCleanup();
      this._iframeCleanup = null;
    }
    // Nếu truyền domId, chỉ xóa container trong DOM đó
    if (domId) {
      const el = document.getElementById(domId);
      if (el) {
        const container = el.querySelector('.ad-sdk-wrapper');
        if (container) el.removeChild(container);
      }
    } else {
      // không truyền domId → default behavior
      if (!this._started) return;
      if (this.container?.parentNode) this.container.parentNode.removeChild(this.container);
      if (this._welcomeDom?.parentNode) this._welcomeDom.parentNode.removeChild(this._welcomeDom);
    }
    
    // reset current container ref nếu match
    if (!domId || (this.domEl && this.domEl.id === domId)) {
      this.container = null;
    }
    
    this.emit("destroy", {domId});
    log(this.cfg.debug, `SDK destroyed${domId ? ` for #${domId}` : ''} - view only (SDK state kept).`);
  }
  
  
  // Hard destroy: full reset (for debugging or full teardown)
  destroyHard() {
    // remove view
    if (this.container?.parentNode) this.container.parentNode.removeChild(this.container);
    this.container = null;
    if (this._welcomeDom?.parentNode) this._welcomeDom.parentNode.removeChild(this._welcomeDom);
    this._welcomeDom = null;
    
    // remove postMessage listener
    if (this._messageListener) {
      window.removeEventListener('message', this._messageListener);
      this._messageListener = null;
    }
    
    // reset internal state
    this._started = false;
    this.domEl = null;
    this._adData = null;
    this._handlers = {};
    this._startToken = 0;
    
    this.emit('destroyFull');
    log(this.cfg.debug, 'SDK fully reset (destroyHard).');
  }
  
  fitBannerIframe(slotId, iframe, originalW, originalH) {
    const wrapper = (typeof slotId === "string")
      ? document.getElementById(slotId)
      : slotId;
    
    if (!wrapper || !iframe) return;
    
    const applyScale = () => {
      const wrapW = wrapper.clientWidth;
      const wrapH = wrapper.clientHeight;
      
      if (!wrapW || !wrapH) return;
      
      const scale = Math.min(wrapW / originalW, wrapH / originalH);
      
      iframe.style.width = originalW + "px";
      iframe.style.height = originalH + "px";
      
      iframe.style.transform = `scale(${scale})`;
      iframe.style.transformOrigin = "top left";
      
      iframe.style.position = "absolute";
      iframe.style.left = (wrapW - originalW * scale) / 2 + "px";
      iframe.style.top = (wrapH - originalH * scale) / 2 + "px";
      
      wrapper.style.position = "relative";
      wrapper.style.overflow = "hidden";
    };
    
    // Scale ngay
    applyScale();
    
    // Auto update khi resize
    const resizeHandler = () => applyScale();
    window.addEventListener("resize", resizeHandler);
    
    // Cleanup khi destroy
    return () => {
      window.removeEventListener("resize", resizeHandler);
    };
  }
  
  
  _renderAd(ad, token, domId) {
    if (!ad || !ad.bannerSource) return this._renderFallback(domId);
    // If token outdated, skip render
    if (token !== this._startToken) {
      log(this.cfg.debug, `Render ignored (stale token:${token})`, 'warn');
      return;
    }
    // ensure container still exists
    if (!this.container) {
      log(this.cfg.debug, 'Render aborted: container missing', 'warn');
      return this._renderFallback(domId);
    }
    
    this.container.innerHTML = "";
    
    switch (ad.bannerSource) {
      case "IMG": {
        const img = new Image();
        img.style.width = "100%";
        img.style.height = "100%";
        img.style.aspectRatio = ad.ratioWidth / ad.ratioHeight;
        img.src = ad.content;
        img.onload = () => {
          // token & container check inside callback
          if (token !== this._startToken) return;
          if (!this.container) return;
          this.container.appendChild(img);
          this.emit("rendered", {domId, ad});
        };
        img.onerror = () => {
          console.error("[AdSDK] Image load error:", img.src);
          if (token !== this._startToken) return;
          this._track("error", ad.trackingEvents.error);
          this.emit(
            "error",
            new Error(`Image load error: ${img.src}`)
          )
          this._renderFallback(domId);
        };
        if (ad.clickThrough) {
          img.style.cursor = "pointer";
          img.addEventListener("click", () => {
            if (token !== this._startToken) return;
            window.open(ad.clickThrough, "_blank");
            this._track("click", ad.clickTracking);
            this.emit("click", {domId, ad});
          });
        }
        break;
      }
      
      case "URL":
      case "HTML":
      case "SDK": {
        if (token !== this._startToken) return;
        
        const iframe = document.createElement("iframe");
        iframe.src = ad.content;
        iframe.width = ad.ratioWidth || this.cfg.width;
        iframe.height = ad.ratioHeight || this.cfg.height;
        iframe.style.border = "none";
        iframe.sandbox = "allow-scripts allow-same-origin allow-popups allow-top-navigation-by-user-activation";
        
        try {
          const url = new URL(ad.content);
          iframe.src = url.href;
        } catch (err) {
          iframe.srcdoc = ad.content;
        }
        
        this.container.appendChild(iframe);
        
        // Fit banner vào slot
        const cleanupFit = this.fitBannerIframe(
          this.container,
          iframe,
          iframe.width,
          iframe.height
        );
        
        // Lưu cleanup để destroy()
        this._iframeCleanup = cleanupFit;
        
        iframe.onload = () => {
          try {
            const onIframeMessage = (e) => {
              if (e.data?.imageLoaded) {
                this.emit("rendered", {domId, ad});
                window.removeEventListener("message", onIframeMessage);
              }
            };
            
            window.addEventListener("message", onIframeMessage);
          } catch (err) {
            this.emit("rendered", {domId, ad});
          }
        };
        
        const onIframeMessage = (e) => {
          if (e.data?.type === "SDK_CLICK") {
            window.open(ad.clickThrough, "_blank");
            this._track("click", ad.clickTracking);
            this.emit("click", {domId, ad});
          }
        };
        window.addEventListener("message", onIframeMessage);
        
        break;
      }
      
      case "VAST": {
        // VAST rendering is async
        this._renderVast(ad.url, token)
          .then(() => {
            if (token !== this._startToken) return;
            this.emit("rendered", ad);
          })
          .catch((err) => {
            console.error("[AdSDK] VAST render error:", err);
            if (token !== this._startToken) return;
            this._renderFallback(domId);
            this.emit("error", err);
          });
        break;
      }
      
      default:
        this._renderFallback(domId);
    }
  }
  
  async _renderVast(vastUrl, token) {
    const response = await fetch(vastUrl);
    if (!response.ok) throw new Error(`VAST fetch error: ${response.status}`);
    const xmlText = await response.text();
    
    // If token changed while fetching VAST, abort
    if (token !== this._startToken) {
      log(this.cfg.debug, 'VAST fetch ignored (stale token)', 'warn');
      return;
    }
    
    const parser = new DOMParser();
    const xml = parser.parseFromString(xmlText, "text/xml");
    
    const linear = xml.querySelector("Linear");
    const skipOffsetAttr = linear?.getAttribute("skipoffset");
    const skipOffsetSec = skipOffsetAttr
      ? this._vastTimeToSeconds(skipOffsetAttr)
      : null;
    const skippable = skipOffsetAttr !== null;
    
    const mediaFile = xml.querySelector("MediaFile[type='video/mp4'], MediaFile")
      ?.textContent?.trim();
    if (!mediaFile) throw new Error("No MediaFile found in VAST");
    
    const video = document.createElement("video");
    video.src = mediaFile;
    video.autoplay = true;
    video.controls = false;
    video.playsInline = true;
    video.muted = true;
    video.style.width = "100%";
    video.style.height = "100%";
    video.style.background = "#000";
    
    const clickThrough = xml.querySelector("ClickThrough")?.textContent?.trim();
    if (clickThrough) {
      video.style.cursor = "pointer";
      video.addEventListener("click", () => {
        if (token !== this._startToken) return;
        window.open(clickThrough, "_blank");
        this._track("click");
      });
    }
    
    const wrapper = document.createElement("div");
    Object.assign(wrapper.style, {
      position: "relative",
      width: "100%",
      height: "100%",
      overflow: "hidden",
    });
    wrapper.appendChild(video);
    
    if (!this.container) {
      throw new Error('Container missing for VAST render');
    }
    
    this.container.innerHTML = "";
    this.container.appendChild(wrapper);
    
    const skipBtn = document.createElement("div");
    Object.assign(skipBtn.style, {
      position: "absolute",
      bottom: "20px",
      right: "20px",
      background: "rgba(0,0,0,0.7)",
      color: "#fff",
      fontSize: "14px",
      padding: "8px 16px",
      borderRadius: "4px",
      cursor: "default",
      opacity: "0",
      transition: "opacity 0.3s",
    });
    wrapper.appendChild(skipBtn);
    
    const muteBtn = document.createElement("div");
    Object.assign(muteBtn.style, {
      position: "absolute",
      bottom: "20px",
      left: "20px",
      background: "rgba(0,0,0,0.6)",
      color: "#fff",
      fontSize: "16px",
      padding: "6px 10px",
      borderRadius: "50%",
      cursor: "pointer",
      opacity: "0.8",
      userSelect: "none",
    });
    muteBtn.textContent = "🔇";
    wrapper.appendChild(muteBtn);
    
    const onMuteToggle = () => {
      if (token !== this._startToken) return;
      video.muted = !video.muted;
      muteBtn.textContent = video.muted ? "🔇" : "🔊";
    };
    muteBtn.addEventListener("click", onMuteToggle);
    
    if (skippable) {
      const allowSkipAfter = skipOffsetSec ?? 5;
      let remaining = allowSkipAfter;
      skipBtn.textContent = `Skip in ${remaining}s`;
      skipBtn.style.opacity = "1";
      
      const interval = setInterval(() => {
        if (token !== this._startToken) {
          clearInterval(interval);
          return;
        }
        remaining -= 1;
        if (remaining > 0) {
          skipBtn.textContent = `Skip in ${remaining}s`;
        } else {
          clearInterval(interval);
          skipBtn.textContent = "Skip Ad ▶";
          skipBtn.style.cursor = "pointer";
          this.emit("vast_skip_available");
          skipBtn.addEventListener("click", () => {
            if (token !== this._startToken) return;
            this.emit("vast_skipped");
            this._track("video_skip");
            this._fadeOut(wrapper, () => this.destroy());
          });
        }
      }, 1000);
      
      this.emit("vast_skip_timer_start", {allowSkipAfter});
    } else {
      skipBtn.textContent = "Ad playing...";
      skipBtn.style.opacity = "0.8";
    }
    
    const onPlay = () => {
      if (token === this._startToken) this._track("video_start");
    };
    const onEnded = () => {
      if (token !== this._startToken) return;
      this._track("video_complete");
      this._fadeOut(wrapper, () => {
        if (this.cfg.type === "WELCOME") this.destroy();
      });
    };
    
    video.addEventListener("play", onPlay);
    video.addEventListener("ended", onEnded);
  }
  
  _vastTimeToSeconds(timeStr) {
    if (!timeStr) return 0;
    const parts = timeStr.split(":").map(Number);
    if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    } else if (timeStr.endsWith("%")) {
      return parseFloat(timeStr) / 100;
    }
    return parseInt(timeStr, 10) || 0;
  }
  
  _fadeOut(el, callback) {
    el.style.transition = "opacity 0.8s ease";
    el.style.opacity = "1";
    requestAnimationFrame(() => {
      el.style.opacity = "0";
      setTimeout(() => {
        if (el.parentNode) el.parentNode.removeChild(el);
        if (callback) callback();
      }, 800);
    });
  }
  
  _renderFallback(domId) {
    if (!this.container) return;
    this.container.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;background:#eee;width:100%;height:100%;color:#999;">
        Ad unavailable
      </div>`;
    this.emit("rendered", {domId, type: "fallback"});
  }
  
  _track(eventType, fetchUrl) {
    try {
      const {debug} = this.cfg;
      
      fetch(fetchUrl, {method: "GET", mode: "no-cors"})
        .then(() => log(debug, `Tracking ${eventType}: ${fetchUrl}`))
        .catch((err) => log(debug, `Tracking error: ${err.message}`));
      
    } catch (e) {
      log(this.cfg.debug, `Track error: ${e.message}`);
    }
  }
  
  _createWelcomeDom() {
    const id = `ad-welcome-${Math.random().toString(36).slice(2, 7)}`;
    const el = document.createElement("div");
    Object.assign(el.style, {
      position: "fixed",
      inset: "0",
      zIndex: "999999",
      background: "rgba(0,0,0,0.85)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: "100vw",
      height: "100vh",
    });
    el.id = id;
    el.style.opacity = "0";
    el.style.transition = "opacity 0.4s ease";
    requestAnimationFrame(() => {
      el.style.opacity = "1";
    });
    
    document.body.appendChild(el);
    
    const closeBtn = document.createElement("button");
    closeBtn.innerHTML = "✕";
    Object.assign(closeBtn.style, {
      position: "absolute",
      top: "20px",
      right: "20px",
      width: "36px",
      height: "36px",
      border: "none",
      borderRadius: "50%",
      background: "rgba(255,255,255,0.15)",
      color: "#fff",
      fontSize: "20px",
      cursor: "pointer",
      transition: "background 0.2s, transform 0.2s",
    });
    
    closeBtn.addEventListener("mouseenter", () => {
      closeBtn.style.background = "rgba(255,255,255,0.3)";
      closeBtn.style.transform = "scale(1.1)";
    });
    closeBtn.addEventListener("mouseleave", () => {
      closeBtn.style.background = "rgba(255,255,255,0.15)";
      closeBtn.style.transform = "scale(1)";
    });
    
    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.emit("close");
      this.destroy();
    });
    
    el.appendChild(closeBtn);
    this._welcomeDom = el;
    return el;
  }
  
  _initPostMessage() {
    this._messageListener = (event) => {
      const data = event.data;
      if (!data || data.channel !== this.cfg.postMessageChannel) return;
      
      switch (data.type) {
        case "start":
          this.start(data.domId || this.cfg.domId, data.bannerType, data.adSize).then();
          break;
        case "render":
          this._renderAd(data.payload, this._startToken);
          break;
        case "destroy":
          this.destroy();
          break;
        case "refresh":
          this.refresh().then();
          break;
      }
    };
    window.addEventListener("message", this._messageListener);
    log(this.cfg.debug, "PostMessage channel initialized.");
  }
  
  // ---- Constants ----
  static ENV = {
    SANDBOX: "SANDBOX",
    PRODUCTION: "PRODUCTION",
  };
  
  static TYPE = {
    INSTREAM: "INSTREAM",
    OUTSTREAM: "OUTSTREAM",
    WELCOME: "WELCOME",
  };
  
  static EVENT_TYPE = {
    REQUEST: 'REQUEST',
    START: 'START',
    IMPRESSION: 'IMPRESSION',
    CLICK: "CLICK",
    COMPLETE: 'COMPLETE',
    SKIPPED: "SKIPPED",
    USER_AD_BLOCK: "USER_AD_BLOCK",
    VOLUME_MUTED: "VOLUME_MUTED",
    VOLUME_ON: "VOLUME_ON",
    ERROR: 'ERROR'
  };
  
  static PLATFORM = {
    TV: "TV",
    WEB: "WEB",
    ANDROID: "ANDROID",
    IOS: "IOS"
  };
  static CONTENT_TYPE = {
    VOD: "VOD",
    LIVE: "LIVE",
    FILM: "FILM",
    VIDEO: "VIDEO",
  };
  static GENDER = {
    MALE: "MALE",
    FEMALE: "FEMALE",
    OTHER: "OTHER",
    NONE: "NONE"
  };
  static AD_SIZE = {
    MINI_BANNER: "MINI_BANNER",
    MEDIUM_BANNER: "MEDIUM_BANNER",
    LARGE_BANNER: "LARGE_BANNER",
    PAUSE_BANNER: "PAUSE_BANNER",
  };
  static BANNER_TYPE = {
    DISPLAY: "DISPLAY",
    OVERLAY: "OVERLAY",
  };
}

// ---- Auto-init ----
window.SDK_INIT = undefined;
if (typeof window !== "undefined" && window.SDK_INIT && typeof window.SDK_INIT === "object") {
  window.sdk = new AdSDK(window.SDK_INIT);
  if (window.SDK_INIT.domId) window.sdk.start(window.SDK_INIT.domId);
}
