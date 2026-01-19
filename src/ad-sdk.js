// src/ad-sdk.fixed.js
// Ad SDK – patched: support multi-slot, per-slot tokens, per-slot cleanup, single proper listener handling, no double-src
// UPDATED: Added callback support for start() method
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
    
    const ENV = cfg.type === AdSDK.TYPE.WELCOME ? {
      SANDBOX: extend({}, baseFetch, {fetchUrl: "https://dev-pubads.wiinvent.tv/v1/adserving/welcome/campaign"}),
      PRODUCTION: extend({}, baseFetch, {fetchUrl: "https://pubads-wiinvent.tv360.vn/v1/adserving/welcome/campaign?"}),
    } : {
      SANDBOX: extend({}, baseFetch, {fetchUrl: "https://dev-pubads.wiinvent.tv/v1/adserving/banner/campaign"}),
      PRODUCTION: extend({}, baseFetch, {fetchUrl: "https://pubads-wiinvent.tv360.vn/v1/adserving/banner/campaign"}),
    };
    
    const baseCfg = extend(
      {
        tenantId: cfg.tenantId || "14",
        adId: cfg.adId || '',
        streamId: cfg.streamId || '',
        channelId: cfg.channelId || '',
        positionId: cfg.positionId || '',
        platform: cfg.platform || "WEB",
        deviceType: cfg.deviceType || "",
        transId: cfg.transId || '',
        category: cfg.category || '',
        keyword: cfg.keyword || '',
        age: cfg.age || "0",
        gender: cfg.gender || "NONE",
        token: cfg.token || '',
        segments: cfg.segments || '',
        
        env: (cfg.env || "SANDBOX").toUpperCase(),
        type: (cfg.type || "").toUpperCase(),
        position: cfg.position,
        adSize: cfg.adSize,
        bannerType: cfg.bannerType,
        debug: !!cfg.debug,
        width: cfg.width || '',
        height: cfg.height || '',
        postMessage: true,
        postMessageChannel: "ad-sdk",
        targetOrigin: "*",
        isUsePartnerSkipButton: cfg.isUsePartnerSkipButton,
      },
      ENV[(cfg.env || "SANDBOX").toUpperCase()] || ENV.SANDBOX
    );
    
    const {sign, salt, deviceId} = this._sign(baseCfg.positionId, baseCfg.tenantId);
    
    const fetchUrl =
      `${baseCfg.fetchUrl}?t=${baseCfg.tenantId}`
      + `&sid=${baseCfg.streamId}`
      + `&cid=${baseCfg.channelId}`
      + `&p=${baseCfg.platform}`
      + `&dt=${baseCfg.deviceType}`
      + `&d=${deviceId}`
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
    this._started = false;
    this._adData = {};
    this._messageListener = null;
    
    // Support multiple DOM slots
    this._containers = {};
    this._domEls = {};
    this._startTokens = {};
    this._iframeListeners = {};
    this._iframeCleanups = {};
    this._imgCleanups = {};
    this._skipTimers = {};
    this._renderTimeouts = {};
    this._overlayDelayInfo = {};
    
    // NEW: Store callbacks per domId
    this._callbacks = {};
    
    // Optional postMessage API
    if (this.cfg.postMessage) this._initPostMessage();
    
    log(this.cfg.debug, "SDK initialized (multi-slot ready).");
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
    
    const raw = `${positionId || ""}${deviceId}${tenantId}${salt}`;
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
  
  async _fetchAd(domId, token, bannerType, adSize, positionId) {
    const {sign, salt, deviceId} = this._sign(positionId, this.cfg.tenantId);
    const {fetchUrl, position, fetchTimeout, fetchRetries, fetchBackoff, debug} = this.cfg;
    const url = `${fetchUrl}&si=${sign}&bt=${bannerType || ""}&as=${adSize || ""}&pid=${positionId || ""}`;
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
        
        if (token !== this._startTokens[domId]) {
          log(debug, `Fetch result ignored for #${domId} (stale token)`, 'warn');
          throw new Error('stale_fetch');
        }
        
        if (bannerType === "OVERLAY" && json?.delayOffSet !== undefined) {
          this._overlayDelayInfo[domId] = {
            lastRequestTime: now(),
            delayOffSet: json.delayOffSet * 1000
          };
          log(debug, `OVERLAY delay tracked for #${domId}: ${json.delayOffSet}s`);
        }
        return json;
      } catch (err) {
        if (err.message === 'stale_fetch') throw err;
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
  
  _checkOverlayDelay(domId, bannerType) {
    if (bannerType !== "OVERLAY") return true;
    
    const delayInfo = this._overlayDelayInfo[domId];
    if (!delayInfo) return true;
    
    const timeSinceLastRequest = now() - delayInfo.lastRequestTime;
    const remainingDelay = delayInfo.delayOffSet - timeSinceLastRequest;
    
    if (remainingDelay > 0) {
      log(this.cfg.debug, `OVERLAY #${domId} still in delay: ${Math.ceil(remainingDelay / 1000)}s remaining`);
      return false;
    }
    
    return true;
  }
  
  // NEW: Execute callback with result
  _executeCallback(domId, status, data = null, error = null) {
    const callback = this._callbacks[domId];
    if (callback && typeof callback === 'function') {
      try {
        callback({
          status,
          domId,
          data,
          error,
          timestamp: now()
        });
      } catch (err) {
        log(this.cfg.debug, `Callback error for #${domId}: ${err.message}`, 'error');
      }
      // Clear callback after execution
      delete this._callbacks[domId];
    }
  }
  
  _syncCloseButtonToImage(domId, img, scale, offset = 16) {
    const container = this._containers[domId];
    if (!container) return;
    
    const btn = container.querySelector('.banner-close-btn');
    if (!btn) return;
    
    const imgLeft = parseFloat(img.style.left || 0);
    const imgTop = parseFloat(img.style.top || 0);
    
    const scaledWidth = img.width * scale;
    
    btn.style.top = (imgTop - offset) + "px";
    btn.style.left = (imgLeft + scaledWidth - btn.offsetWidth + offset) + "px";
  }
  
  // UPDATED: start() now accepts callback as last parameter
  async start(domId, bannerType, adSize, positionIdOrCallback, callback) {
    // Handle parameter overloading
    let positionId;
    let cb;
    
    if (typeof positionIdOrCallback === 'function') {
      // start(domId, bannerType, adSize, callback)
      cb = positionIdOrCallback;
      positionId = undefined;
    } else {
      // start(domId, bannerType, adSize, positionId, callback)
      positionId = positionIdOrCallback;
      cb = callback;
    }
    
    if (!this._checkOverlayDelay(domId, bannerType)) {
      const delayInfo = this._overlayDelayInfo[domId];
      const remainingDelay = Math.ceil((delayInfo.delayOffSet - (now() - delayInfo.lastRequestTime)) / 1000);
      
      this.emit("inDelay", {
        domId,
        remainingSeconds: remainingDelay,
        delayOffSet: delayInfo.delayOffSet / 1000
      });
      
      // Execute callback with delay status
      this._executeCallback(domId, 'delay', {
        remainingSeconds: remainingDelay,
        delayOffSet: delayInfo.delayOffSet / 1000,
        message: 'Ad is in delay period'
      });
      
      log(this.cfg.debug, `Start blocked for #${domId}: in delay period (${remainingDelay}s remaining)`);
      return;
    }
    
    if (!domId && this.cfg.type !== AdSDK.TYPE.WELCOME) {
      const error = new Error("AdSDK.start(domId) requires a DOM ID");
      this._executeCallback(domId, 'error', null, error);
      throw error;
    }
    
    // Prepare DOM
    if (this.cfg.type === AdSDK.TYPE.WELCOME) {
      if (!this._welcomeDom) {
        this._welcomeDom = this._createWelcomeDom();
        domId = this._welcomeSlotId;
        
        if (!domId) {
          const error = new Error("Welcome slot was not initialized correctly");
          this._executeCallback(domId, 'error', null, error);
          console.error(error.message);
          return;
        }
      }
    }
    
    // Store callback for this domId
    if (cb) {
      this._callbacks[domId] = cb;
    }
    
    const wrapper = (typeof domId === "string") ? document.getElementById(domId) : domId;
    if (!wrapper) {
      const error = new Error(`AdSDK: element #${domId} not found`);
      this._executeCallback(domId, 'error', null, error);
      throw error;
    }
    
    this._domEls[domId] = wrapper;
    if (bannerType === "DISPLAY") {
      this._domEls[domId].innerHTML = "";
      const existing = wrapper.querySelector('.ad-sdk-wrapper');
      if (existing) existing.remove();
    }
    
    const container = document.createElement("div");
    container.className = "ad-sdk-wrapper";
    if (this.cfg.width) {
      container.style.width = `${this.cfg.width}px`
    } else container.style.width = "100%";
    if (this.cfg.height) {
      container.style.height = `${this.cfg.height}px`
    } else container.style.height = "100%";
    
    this._containers[domId] = container;
    this._domEls[domId].appendChild(container);
    
    this._started = true;
    
    const token = (this._startTokens[domId] || 0) + 1;
    this._startTokens[domId] = token;
    
    this.emit("start", {domId});
    log(this.cfg.debug, `SDK start for #${domId} (token:${token})`);
    
    try {
      this.emit("request", {domId});
      const data = await this._fetchAd(domId, token, bannerType, adSize, positionId);
      
      this._adData[domId] = data;
      this._renderAd(data, token, domId, bannerType);
      this.emit("loaded", {domId, data});
      
      // Callback will be executed when ad is rendered (in _renderImageAd or _renderIframeAd)
      
    } catch (err) {
      if (err.message === 'stale_fetch') {
        log(this.cfg.debug, `Stale fetch ignored for #${domId}.`);
        return;
      }
      
      log(this.cfg.debug, `Ad fetch error for #${domId}: ${err.message}`);
      this._renderFallback(domId, 1);
      this.emit("error", {domId, err});
      
      // Execute callback with error
      this._executeCallback(domId, 'error', null, err);
    }
  }
  
  dismiss(domId) {
    const wrapper = document.getElementById(domId);
    const layer = wrapper?.querySelector(".ad-click-layer-" + domId);
    if (layer) layer.remove();
    
    if (domId) {
      if (domId === this._welcomeSlotId) {
        if (this._welcomeDom) {
          this._welcomeDom.remove();
        }
        this._welcomeDom = null;
        this._welcomeSlotId = null;
      }
      
      if (this._renderTimeouts && this._renderTimeouts[domId]) {
        clearTimeout(this._renderTimeouts[domId]);
        delete this._renderTimeouts[domId];
      }
      
      if (this._iframeListeners?.[domId]) {
        window.removeEventListener("message", this._iframeListeners[domId]);
        delete this._iframeListeners[domId];
      }
      
      if (this._iframeCleanups?.[domId]) {
        try {
          this._iframeCleanups[domId]();
        } catch (e) {
        }
        delete this._iframeCleanups[domId];
      }
      
      if (this._imgCleanups?.[domId]) {
        try {
          this._imgCleanups[domId]();
        } catch (e) {
        }
        delete this._imgCleanups[domId];
      }
      
      if (this._skipTimers?.[domId]) {
        clearTimeout(this._skipTimers[domId]);
        delete this._skipTimers[domId];
      }
      
      // Clear callback
      delete this._callbacks[domId];
      
      const el = this._domEls[domId] || document.getElementById(domId);
      if (el) {
        const container = el.querySelector('.ad-sdk-wrapper');
        if (container) el.removeChild(container);
      }
      
      delete this._containers[domId];
      delete this._domEls[domId];
      delete this._adData[domId];
      delete this._startTokens[domId];
      
      this.emit("dismiss", {domId});
      log(this.cfg.debug, `SDK destroyed view for #${domId} - cleaned up listeners & timers.`);
      return;
    }
    
    Object.keys(this._containers).forEach((id) => this.dismiss(id));
  }
  
  destroy() {
    Object.keys(this._containers).forEach((domId) => {
      try {
        const el = this._domEls[domId] || document.getElementById(domId);
        if (el) {
          const container = el.querySelector('.ad-sdk-wrapper');
          if (container) el.removeChild(container);
        }
      } catch (e) {
      }
    });
    
    Object.keys(this._iframeListeners).forEach((k) => {
      window.removeEventListener("message", this._iframeListeners[k]);
    });
    Object.keys(this._renderTimeouts || {}).forEach((k) => {
      clearTimeout(this._renderTimeouts[k]);
    });
    this._renderTimeouts = {};
    Object.keys(this._iframeCleanups).forEach((k) => {
      try {
        this._iframeCleanups[k]();
      } catch (e) {
      }
    });
    Object.keys(this._imgCleanups).forEach((k) => {
      try {
        this._imgCleanups[k]();
      } catch (e) {
      }
    });
    Object.keys(this._skipTimers).forEach((k) => {
      clearTimeout(this._skipTimers[k]);
    });
    
    this._containers = {};
    this._domEls = {};
    this._adData = {};
    this._iframeListeners = {};
    this._iframeCleanups = {};
    this._imgCleanups = {};
    this._skipTimers = {};
    this._startTokens = {};
    this._overlayDelayInfo = {};
    this._callbacks = {}; // Clear all callbacks
    
    if (this._messageListener) {
      window.removeEventListener('message', this._messageListener);
      this._messageListener = null;
    }
    
    this._started = false;
    this._handlers = {};
    
    this.emit('destroy');
    log(this.cfg.debug, 'SDK fully reset (destroyHard).');
  }
  
  fitBannerIframe(slotWrapperOrId, iframe, originalW, originalH) {
    const wrapper = (typeof slotWrapperOrId === "string")
      ? document.getElementById(slotWrapperOrId)
      : slotWrapperOrId;
    
    if (!wrapper || !iframe) return null;
    
    const applyScale = () => {
      const wrapW = wrapper.clientWidth;
      const wrapH = wrapper.clientHeight;
      
      if (!wrapW || !wrapH) return;
      
      const scale = Math.min(wrapW / originalW, wrapH / originalH) || 1;
      
      iframe.style.width = originalW + "px";
      iframe.style.height = originalH + "px";
      
      iframe.style.transform = `scale(${scale})`;
      iframe.style.transformOrigin = "top left";
      
      iframe.style.position = "absolute";
      iframe.style.left = (wrapW - originalW * scale) / 2 + "px";
      iframe.style.top = (wrapH - originalH * scale) / 2 + "px";
      
      wrapper.style.position = "relative";
      wrapper.style.overflow = "visible";
    };
    
    applyScale();
    
    const resizeHandler = () => applyScale();
    window.addEventListener("resize", resizeHandler);
    
    return () => {
      window.removeEventListener("resize", resizeHandler);
    };
  }
  
  _startSkipCountdown(token, domId, ad, isWelcome) {
    if (this._skipTimers?.[domId]) {
      clearTimeout(this._skipTimers[domId]);
      this._skipTimers[domId] = null;
    }
    
    const skipTime = (isWelcome ? ad.skipOffset : ad.skipOffSet) || 0
    
    if (!skipTime) return;
    
    let countdownText = null;
    if (isWelcome) {
      const container = this._containers[domId];
      if (container) {
        countdownText = document.createElement("div");
        countdownText.className = "skip-countdown-text";
        countdownText.textContent = `Bỏ qua sau ${skipTime} giây`;
        Object.assign(countdownText.style, {
          position: "absolute",
          bottom: "10px",
          right: "10px",
          background: "rgba(0,0,0,0.7)",
          color: "#ffffff",
          padding: "8px 12px",
          borderRadius: "4px",
          fontSize: "14px",
          fontWeight: "500",
          zIndex: "1000001",
          pointerEvents: "none",
          transition: "opacity 0.3s ease"
        });
        container.appendChild(countdownText);
        
        let remainingTime = skipTime;
        const countdownInterval = setInterval(() => {
          if (token !== this._startTokens[domId]) {
            clearInterval(countdownInterval);
            if (countdownText && countdownText.parentNode) {
              countdownText.remove();
            }
            return;
          }
          
          remainingTime--;
          if (remainingTime > 0) {
            countdownText.textContent = `Bỏ qua sau ${remainingTime} giây`;
          } else {
            clearInterval(countdownInterval);
            if (countdownText) {
              countdownText.style.opacity = "0";
              setTimeout(() => {
                if (countdownText && countdownText.parentNode) {
                  countdownText.remove();
                }
              }, 300);
            }
          }
        }, 1000);
      }
    }
    
    this._skipTimers[domId] = setTimeout(() => {
      if (token !== this._startTokens[domId]) return;
      
      if (document.getElementById(domId)?.querySelector('.banner-close-btn')) {
        document.getElementById(domId).querySelector('.banner-close-btn').style.opacity = "1";
        document.getElementById(domId).querySelector('.banner-close-btn').style.pointerEvents = "auto";
      }
      
      if (countdownText && countdownText.parentNode) {
        countdownText.style.opacity = "0";
        setTimeout(() => {
          if (countdownText && countdownText.parentNode) {
            countdownText.remove();
          }
        }, 300);
      }
    }, skipTime * 1000);
  }
  
  _renderAd(ad, token, domId, bannerType) {
    if (!ad) return this._renderFallback(domId, 2);
    
    if (token !== this._startTokens[domId]) {
      log(this.cfg.debug, `Render ignored for #${domId} (stale token:${token})`, 'warn');
      return;
    }
    
    const container = this._containers[domId];
    if (!container) {
      log(this.cfg.debug, `Render aborted: container missing for #${domId}`, 'warn');
      return this._renderFallback(domId, 3);
    }
    
    container.innerHTML = "";
    
    if (!this._renderTimeouts) this._renderTimeouts = {};
    
    const isWelcome = this.cfg.type === AdSDK.TYPE.WELCOME;
    
    if (this.cfg.isUsePartnerSkipButton && (bannerType === "OVERLAY" || isWelcome)) {
      const buttonSkip = document.createElement("button");
      buttonSkip.className = "banner-close-btn";
      buttonSkip.innerHTML = "✕";
      Object.assign(buttonSkip.style, {
        position: "absolute",
        top: "-16px",
        right: "-16px",
        width: "32px",
        height: "32px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        fontSize: "20px",
        border: "none",
        boxShadow: "0px 0px 6.4px 0px #00000080",
        borderRadius: "50%",
        background: "#ffffff",
        color: "#000000",
        zIndex: "1000000",
        opacity: "0",
        transition: "opacity .3s ease",
        pointerEvents: "none",
      });
      container.appendChild(buttonSkip);
      
      if (isWelcome) {
        this._welcomeCloseBtn = buttonSkip;
      }
      
      buttonSkip.addEventListener("click", () => {
        this.emit("skip", {domId: domId, ad});
        this._track("skip", ad.trackingEvents?.skip);
        buttonSkip.style.opacity = "0";
        buttonSkip.style.pointerEvents = "none";
        
        if (isWelcome && this._welcomeDom) {
          this._welcomeDom.style.opacity = "0";
          setTimeout(() => {
            this.dismiss(domId);
          }, 300);
        }
      });
    }
    
    switch (ad.bannerSource) {
      case "IMG": {
        this._renderImageAd(ad, token, domId, container, isWelcome);
        break;
      }
      
      case "URL":
      case "HTML":
      case "SDK": {
        this._renderIframeAd(ad, token, domId, container, isWelcome);
        break;
      }
      
      case "VAST": {
        this._renderVast(ad.url, token, domId)
          .then(() => {
            if (token !== this._startTokens[domId]) return;
            this.emit("rendered", {domId, ad});
            // Execute callback for VAST success
            this._executeCallback(domId, 'success', ad);
          })
          .catch((err) => {
            console.error("[AdSDK] VAST render error:", err);
            if (token !== this._startTokens[domId]) return;
            this.emit("error", {domId, err});
            this._handleRenderError(domId, isWelcome);
            // Execute callback for VAST error
            this._executeCallback(domId, 'error', null, err);
          });
        break;
      }
      
      default:
        this._renderFallback(domId, 4);
    }
  }
  
  _renderImageAd(ad, token, domId, container, isWelcome) {
    const img = new Image();
    img.src = isWelcome ? ad.url : ad.content;
    img.style.position = "absolute";
    img.style.top = "0";
    img.style.left = "0";
    img.style.transformOrigin = "top left";
    img.style.cursor = ad.clickThrough ? "pointer" : "default";
    
    const applyScale = () => {
      if (!this._containers[domId]) return;
      
      const wrapW = container.clientWidth;
      const wrapH = container.clientHeight;
      if (!wrapW || !wrapH) return;
      
      const scale = Math.min(wrapW / ad.ratioWidth, wrapH / ad.ratioHeight) || 1;
      
      img.style.width = ad.ratioWidth + "px";
      img.style.height = ad.ratioHeight + "px";
      img.style.transform = `scale(${scale})`;
      
      const left = (wrapW - ad.ratioWidth * scale) / 2;
      const top = (wrapH - ad.ratioHeight * scale) / 2;
      
      img.style.left = left + "px";
      img.style.top = top + "px";
      
      container.style.position = "relative";
      container.style.overflow = "visible";
      
      this._syncCloseButtonToImage(domId, img, scale);
    };
    
    container.appendChild(img);
    applyScale();
    
    const resizeHandler = () => applyScale();
    window.addEventListener("resize", resizeHandler);
    
    this._imgCleanups[domId] = () => {
      window.removeEventListener("resize", resizeHandler);
    };
    
    img.onload = () => {
      if (token !== this._startTokens[domId]) return;
      if (!this._containers[domId]) return;
      
      if (isWelcome && this._welcomeDom) {
        requestAnimationFrame(() => {
          this._welcomeDom.style.opacity = "1";
        });
      }
      
      this.emit("rendered", {domId, ad});
      this._startSkipCountdown(token, domId, ad, isWelcome);
      this._track("impression", ad.trackingEvents && ad.trackingEvents.impression);
      
      // NEW: Execute callback on successful render
      this._executeCallback(domId, 'success', ad);
    };
    
    img.onerror = () => {
      console.error("[AdSDK] Image load error:", img.src);
      if (token !== this._startTokens[domId]) return;
      this._track("error", ad.trackingEvents?.error);
      const error = new Error(`Image load error: ${img.src}`);
      this.emit("error", {domId, err: error});
      this._handleRenderError(domId, isWelcome);
      
      // NEW: Execute callback on image load error
      this._executeCallback(domId, 'error', null, error);
    };
    
    if (ad.clickThrough) {
      img.addEventListener("click", () => {
        if (token !== this._startTokens[domId]) return;
        window.open(ad.clickThrough, "_blank");
        this._track("click", ad.clickTracking);
        this.emit("click", {domId, ad});
      });
    }
  }
  
  _renderIframeAd(ad, token, domId, container, isWelcome) {
    if (token !== this._startTokens[domId]) return;
    
    container.style.overflow = "visible";
    
    const iframe = document.createElement("iframe");
    iframe.style.border = "none";
    iframe.sandbox = "allow-scripts allow-same-origin allow-popups allow-top-navigation-by-user-activation";
    
    const iframeId = `iframe-${domId}-${token}`;
    iframe.setAttribute('data-ad-iframe-id', iframeId);
    
    const contentSource = isWelcome ? ad.url : ad.content;
    
    if (!contentSource) {
      console.error('[AdSDK] No content source for iframe ad');
      const error = new Error('No content source');
      this.emit("error", {domId, err: error});
      this._handleRenderError(domId, isWelcome);
      this._executeCallback(domId, 'error', null, error);
      return;
    }
    
    try {
      const url = new URL(contentSource);
      iframe.src = url.href;
    } catch (err) {
      iframe.srcdoc = contentSource;
    }
    
    if (ad.ratioWidth) iframe.width = ad.ratioWidth;
    if (ad.ratioHeight) iframe.height = ad.ratioHeight;
    
    container.appendChild(iframe);
    
    const cleanupFit = this.fitBannerIframe(
      container,
      iframe,
      iframe.width || (ad.ratioWidth || 300),
      iframe.height || (ad.ratioHeight || 250)
    );
    if (this._iframeCleanups[domId]) {
      try {
        this._iframeCleanups[domId]();
      } catch (e) {
      }
    }
    this._iframeCleanups[domId] = cleanupFit;
    
    let hasRendered = false;
    
    if (this._iframeListeners[domId]) {
      try {
        window.removeEventListener("message", this._iframeListeners[domId]);
      } catch (e) {
      }
      delete this._iframeListeners[domId];
    }
    
    this._iframeListeners[domId] = (e) => {
      const d = e.data;
      
      if (!d) return;
      if (hasRendered) return;
      
      if (d.imageLoaded || d.type === "RENDERED" || d.event === "rendered" || d.action === "ADS_LOADED") {
        if (token !== this._startTokens[domId]) return;
        
        hasRendered = true;
        
        if (this._renderTimeouts && this._renderTimeouts[domId]) {
          clearTimeout(this._renderTimeouts[domId]);
          delete this._renderTimeouts[domId];
        }
        
        if (isWelcome && this._welcomeDom) {
          requestAnimationFrame(() => {
            this._welcomeDom.style.opacity = "1";
          });
        }
        
        this.emit("rendered", {domId, ad});
        this._startSkipCountdown(token, domId, ad, isWelcome);
        this._track("impression", ad.trackingEvents && ad.trackingEvents.impression);
        
        // NEW: Execute callback on successful render
        this._executeCallback(domId, 'success', ad);
      }
    };
    
    window.addEventListener("message", this._iframeListeners[domId]);
    
    const renderTimeout = setTimeout(() => {
      console.log('[AdSDK Debug] Timeout fired for domId:', domId, {
        token: token,
        currentToken: this._startTokens[domId],
        hasRendered: hasRendered,
        isWelcome: isWelcome,
        welcomeDomExists: !!this._welcomeDom,
        welcomeDomOpacity: this._welcomeDom?.style.opacity
      });
      
      if (token !== this._startTokens[domId]) return;
      if (hasRendered) return;
      
      const alreadyRendered = isWelcome
        ? (this._welcomeDom && this._welcomeDom.style.opacity === "1")
        : false;
      
      if (!alreadyRendered) {
        console.error('[AdSDK] ❌ Iframe render timeout - no message received for domId:', domId, 'isWelcome:', isWelcome);
        const error = new Error('Iframe render timeout');
        this._track("error", ad.trackingEvents?.error);
        this.emit("error", {domId, err: error});
        this._handleRenderError(domId, isWelcome);
        
        // NEW: Execute callback on timeout error
        this._executeCallback(domId, 'error', null, error);
      }
    }, 3000);
    
    if (!this._renderTimeouts) this._renderTimeouts = {};
    this._renderTimeouts[domId] = renderTimeout;
    
    if (ad.clickThrough) {
      const wrapper = document.getElementById(domId);
      wrapper.style.position = "absolute";
      
      const clickLayer = document.createElement("div");
      clickLayer.className = "ad-click-layer-" + domId;
      clickLayer.style.cssText = `
        position:absolute;
        inset:0;
        z-index:9998;
        cursor:pointer;
        background:rgba(0,0,0,0);
      `;
      
      clickLayer.addEventListener("click", (e) => {
        e.stopPropagation();
        window.open(ad.clickThrough, "_blank");
        this._track("click", ad.clickTracking);
        this.emit("click", {domId, ad});
      });
      
      wrapper.appendChild(clickLayer);
    }
  }
  
  _handleRenderError(domId, isWelcome) {
    if (isWelcome) {
      if (this._welcomeDom) {
        this._welcomeDom.style.opacity = "0";
        setTimeout(() => {
          this.dismiss(domId);
        }, 300);
      } else {
        this.dismiss(domId);
      }
    } else {
      this._renderFallback(domId, 5);
    }
  }
  
  async _renderVast(vastUrl, token, domId) {
    const response = await fetch(vastUrl);
    if (!response.ok) throw new Error(`VAST fetch error: ${response.status}`);
    const xmlText = await response.text();
    
    if (token !== this._startTokens[domId]) {
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
        if (token !== this._startTokens[domId]) return;
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
    
    const container = this._containers[domId];
    if (!container) {
      throw new Error('Container missing for VAST render');
    }
    
    container.innerHTML = "";
    container.appendChild(wrapper);
    
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
      if (token !== this._startTokens[domId]) return;
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
        if (token !== this._startTokens[domId]) {
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
          this.emit("vast_skip_available", {domId, allowSkipAfter});
          skipBtn.addEventListener("click", () => {
            if (token !== this._startTokens[domId]) return;
            this.emit("vast_skipped", {domId});
            this._track("video_skip");
            this._fadeOut(wrapper, () => this.dismiss(domId));
          });
        }
      }, 1000);
      
      this.emit("vast_skip_timer_start", {domId, allowSkipAfter});
    } else {
      skipBtn.textContent = "Ad playing...";
      skipBtn.style.opacity = "0.8";
    }
    
    const onPlay = () => {
      if (token === this._startTokens[domId]) this._track("video_start");
    };
    const onEnded = () => {
      if (token !== this._startTokens[domId]) return;
      this._track("video_complete");
      this._fadeOut(wrapper, () => {
        if (this.cfg.type === "WELCOME") this.dismiss(domId);
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
  
  _renderFallback(domId, index) {
    const container = this._containers[domId];
    if (!container) return;
    container.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;background:#eee;width:100%;height:100%;color:#999;">
        Ad unavailable
      </div>`;
    this.emit("rendered", {domId, type: "fallback", index: index});
    
    // Execute callback for fallback
    this._executeCallback(domId, 'fallback', null, new Error('Ad unavailable'));
  }
  
  _track(eventType, fetchUrl) {
    try {
      const {debug} = this.cfg;
      
      if (!fetchUrl) return;
      
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
    
    document.body.appendChild(el);
    
    const slotId = `welcome-slot-${Math.random().toString(36).slice(2, 7)}`;
    const slot = document.createElement("div");
    slot.id = slotId;
    Object.assign(slot.style, {
      width: "600px",
      height: "500px",
      maxWidth: "100vw",
      maxHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      position: "relative",
      overflow: "visible",
    });
    el.appendChild(slot);
    
    this._domEls[slotId] = slot;
    
    this._welcomeDom = el;
    this._welcomeSlotId = slotId;
    
    const closeBtn = document.createElement("div");
    closeBtn.innerText = "✕";
    Object.assign(closeBtn.style, {
      position: "absolute",
      top: "-16px",
      right: "-16px",
      width: "32px",
      height: "32px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
      fontSize: "20px",
      boxShadow: "0px 0px 6.4px 0px #00000080",
      borderRadius: "50%",
      background: "#ffffff",
      color: "#000000",
      zIndex: "1000000",
      opacity: "0",
      transition: "opacity .3s ease",
      pointerEvents: "none",
    });
    
    slot.appendChild(closeBtn);
    
    this._welcomeCloseBtn = closeBtn;
    
    closeBtn.addEventListener("click", () => {
      this._track("skip", this._adData[slotId]?.trackingEvents?.skip);
      el.style.opacity = "0";
      setTimeout(() => {
        el.remove();
        this._welcomeDom = null;
        this._welcomeSlotId = null;
        this._welcomeCloseBtn = null;
      }, 300);
    });
    
    return el;
  }
  
  _initPostMessage() {
    this._messageListener = (event) => {
      const data = event.data;
      if (!data || data.channel !== this.cfg.postMessageChannel) return;
      
      switch (data.type) {
        case "start":
          this.start(data.domId || this.cfg.domId, data.bannerType, data.adSize, data.positionId, data.callback).then();
          break;
        case "render":
          this._renderAd(data.payload, this._startTokens[data.domId] || 0, data.domId);
          break;
        case "dismiss":
          this.dismiss(data.domId);
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
    DISPLAY: "DISPLAY",
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
    SUBPAGE_BANNER: "SUBPAGE_BANNER",
    HOMEPAGE_LARGE_BANNER: "HOMEPAGE_LARGE_BANNER",
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