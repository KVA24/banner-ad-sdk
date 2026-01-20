// src/ad-sdk.js
// Ad SDK – Optimized for WebOS 3.x (Chrome 38+)
// Fixed: typos, polyfills, ES5 compatibility

// Polyfills for Chrome 38
import 'core-js/stable';
import 'regenerator-runtime/runtime';
import 'whatwg-fetch';
import 'es6-promise/auto';

import md5 from "crypto-js/md5";

// ---- Utils ----
var now = function() {
  return Date.now();
};

var log = function(debug, msg, level) {
  if (level === void 0) level = 'log';
  if (!debug) return;
  var style = {
    log: 'color:#4CAF50;font-weight:bold',
    warn: 'color:#FF9800;font-weight:bold',
    error: 'color:#F44336;font-weight:bold'
  };
  console[level] && console[level]('%c[AdSDK]', style[level] || '', msg);
};

var extend = function(dest) {
  var sources = Array.prototype.slice.call(arguments, 1);
  return Object.assign.apply(Object, [dest].concat(sources));
};

// ---- Main SDK ----
export default function AdSDK(cfg) {
  if (cfg === void 0) cfg = {};
  
  // Environment presets
  var baseFetch = {
    responseType: "json",
    fetchTimeout: 8000,
    fetchRetries: 2,
    fetchBackoff: 300
  };
  
  var ENV = cfg.type === AdSDK.TYPE.WELCOME ? {
    SANDBOX: extend({}, baseFetch, {fetchUrl: "https://dev-pubads.wiinvent.tv/v1/adserving/welcome/campaign"}),
    PRODUCTION: extend({}, baseFetch, {fetchUrl: "https://pubads-wiinvent.tv360.vn/v1/adserving/welcome/campaign?"})
  } : {
    SANDBOX: extend({}, baseFetch, {fetchUrl: "https://dev-pubads.wiinvent.tv/v1/adserving/banner/campaign"}),
    PRODUCTION: extend({}, baseFetch, {fetchUrl: "https://pubads-wiinvent.tv360.vn/v1/adserving/banner/campaign"})
  };
  
  var baseCfg = extend(
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
      isUsePartnerSkipButton: cfg.isUsePartnerSkipButton
    },
    ENV[(cfg.env || "SANDBOX").toUpperCase()] || ENV.SANDBOX
  );
  
  var signData = this._sign(baseCfg.positionId, baseCfg.tenantId);
  var sign = signData.sign;
  var salt = signData.salt;
  var deviceId = signData.deviceId;
  
  var fetchUrl =
    baseCfg.fetchUrl + "?t=" + baseCfg.tenantId +
    "&sid=" + baseCfg.streamId +
    "&cid=" + baseCfg.channelId +
    "&p=" + baseCfg.platform +
    "&dt=" + baseCfg.deviceType +
    "&d=" + deviceId +
    "&ai=" + (baseCfg.adId || "") +
    "&ct=" + (baseCfg.contentType || "") +
    "&tt=" + (baseCfg.title || "") +
    "&ti=" + (baseCfg.transId || "") +
    "&ctg=" + (baseCfg.category || "") +
    "&kw=" + (baseCfg.keyword || "") +
    "&a=" + (baseCfg.age || "0") +
    "&gd=" + (baseCfg.gender || "NONE") +
    "&sm=" + (baseCfg.segments || "");
  
  this.cfg = Object.assign({}, baseCfg, {fetchUrl: fetchUrl});
  
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
  this._callbacks = {};
  
  // Optional postMessage API
  if (this.cfg.postMessage) this._initPostMessage();
  
  log(this.cfg.debug, "SDK initialized (multi-slot ready).");
}

// ---- Event system ----
AdSDK.prototype.on = function(ev, fn) {
  if (!this._handlers[ev]) this._handlers[ev] = [];
  this._handlers[ev].push(fn);
};

AdSDK.prototype.off = function(ev, fn) {
  if (!this._handlers[ev]) return;
  this._handlers[ev] = this._handlers[ev].filter(function(f) { return f !== fn; });
};

AdSDK.prototype.emit = function(ev, data) {
  var handlers = this._handlers[ev] || [];
  handlers.forEach(function(fn) {
    try {
      fn(data);
    } catch (e) {
      // Silent catch
    }
  });
};

AdSDK.prototype._sign = function(positionId, tenantId) {
  if (!md5) throw new Error("MD5 module not found. Import crypto-js/md5 first.");
  
  var chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  var salt = '';
  for (var i = 0; i < 20; i++) {
    salt += chars[Math.floor(Math.random() * 36)];
  }
  
  var key = "wiinvent-viewer-id";
  var deviceId = localStorage.getItem(key);
  if (!deviceId) {
    var dt = Date.now();
    deviceId = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function(c) {
      var r = (dt + Math.random() * 16) % 16 | 0;
      dt = Math.floor(dt / 16);
      return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });
    localStorage.setItem(key, deviceId);
  }
  
  var raw = (positionId || "") + deviceId + tenantId + salt;
  var hash = md5(raw).toString();
  var sign = salt + hash;
  
  if (this.cfg && this.cfg.debug) {
    console.groupCollapsed("[AdSDK] Sign Generation");
    console.log("positionId:", positionId);
    console.log("tenantId:", tenantId);
    console.log("deviceId:", deviceId);
    console.log("salt:", salt);
    console.log("sign:", sign);
    console.groupEnd();
  }
  
  return {sign: sign, salt: salt, deviceId: deviceId};
};

AdSDK.prototype._fetchAd = function(domId, token, bannerType, adSize, positionId) {
  var self = this;
  var signData = this._sign(positionId, this.cfg.tenantId);
  var sign = signData.sign;
  var fetchUrl = this.cfg.fetchUrl;
  var fetchTimeout = this.cfg.fetchTimeout;
  var fetchRetries = this.cfg.fetchRetries;
  var fetchBackoff = this.cfg.fetchBackoff;
  var debug = this.cfg.debug;
  
  var url = fetchUrl + "&si=" + sign + "&bt=" + (bannerType || "") + "&as=" + (adSize || "") + "&pid=" + (positionId || "");
  var attempt = 0;
  
  var doFetch = function() {
    attempt++;
    return new Promise(function(resolve, reject) {
      var controller = new AbortController();
      var timeoutId = setTimeout(function() {
        controller.abort();
      }, fetchTimeout);
      
      fetch(url, {signal: controller.signal})
        .then(function(res) {
          clearTimeout(timeoutId);
          if (!res.ok) throw new Error("HTTP " + res.status);
          return res.json();
        })
        .then(function(json) {
          if (token !== self._startTokens[domId]) {
            log(debug, "Fetch result ignored for #" + domId + " (stale token)", 'warn');
            throw new Error('stale_fetch');
          }
          
          if (bannerType === "OVERLAY" && json && json.delayOffSet !== undefined) {
            self._overlayDelayInfo[domId] = {
              lastRequestTime: now(),
              delayOffSet: json.delayOffSet * 1000
            };
            log(debug, "OVERLAY delay tracked for #" + domId + ": " + json.delayOffSet + "s");
          }
          resolve(json);
        })
        .catch(function(err) {
          if (err.message === 'stale_fetch') {
            reject(err);
            return;
          }
          if (attempt <= fetchRetries) {
            log(debug, "Retrying fetch (" + attempt + ") after " + fetchBackoff + "ms due to " + err.message);
            setTimeout(function() {
              doFetch().then(resolve).catch(reject);
            }, fetchBackoff);
          } else {
            reject(new Error("Fetch failed after retries: " + err.message));
          }
        });
    });
  };
  
  return doFetch();
};

AdSDK.prototype._checkOverlayDelay = function(domId, bannerType) {
  if (bannerType !== "OVERLAY") return true;
  
  var delayInfo = this._overlayDelayInfo[domId];
  if (!delayInfo) return true;
  
  var timeSinceLastRequest = now() - delayInfo.lastRequestTime;
  var remainingDelay = delayInfo.delayOffSet - timeSinceLastRequest;
  
  if (remainingDelay > 0) {
    log(this.cfg.debug, "OVERLAY #" + domId + " still in delay: " + Math.ceil(remainingDelay / 1000) + "s remaining");
    return false;
  }
  
  return true;
};

AdSDK.prototype._executeCallback = function(domId, status, data, error) {
  if (typeof data === 'undefined') data = null;
  if (typeof error === 'undefined') error = null;
  var callback = this._callbacks[domId];
  if (callback && typeof callback === 'function') {
    try {
      callback({
        status: status,
        domId: domId,
        data: data,
        error: error,
        timestamp: now()
      });
    } catch (err) {
      log(this.cfg.debug, "Callback error for #" + domId + ": " + err.message, 'error');
    }
    delete this._callbacks[domId];
  }
};

AdSDK.prototype._syncCloseButtonToImage = function(domId, img, scale, offset) {
  if (offset === void 0) offset = 16;
  var container = this._containers[domId];
  if (!container) return;
  
  var btn = container.querySelector('.banner-close-btn');
  if (!btn) return;
  
  var imgLeft = parseFloat(img.style.left || 0);
  var imgTop = parseFloat(img.style.top || 0);
  var scaledWidth = img.width * scale;
  
  btn.style.top = (imgTop - offset) + "px";
  btn.style.left = (imgLeft + scaledWidth - btn.offsetWidth + offset) + "px";
};

AdSDK.prototype.start = function(domId, bannerType, adSize, positionIdOrCallback, callback) {
  var self = this;
  var positionId;
  var cb;
  
  if (typeof positionIdOrCallback === 'function') {
    cb = positionIdOrCallback;
    positionId = undefined;
  } else {
    positionId = positionIdOrCallback;
    cb = callback;
  }
  
  if (!this._checkOverlayDelay(domId, bannerType)) {
    var delayInfo = this._overlayDelayInfo[domId];
    var remainingDelay = Math.ceil((delayInfo.delayOffSet - (now() - delayInfo.lastRequestTime)) / 1000);
    
    this.emit("inDelay", {
      domId: domId,
      remainingSeconds: remainingDelay,
      delayOffSet: delayInfo.delayOffSet / 1000
    });
    
    this._executeCallback(domId, 'delay', {
      remainingSeconds: remainingDelay,
      delayOffSet: delayInfo.delayOffSet / 1000,
      message: 'Ad is in delay period'
    });
    
    log(this.cfg.debug, "Start blocked for #" + domId + ": in delay period (" + remainingDelay + "s remaining)");
    return Promise.resolve();
  }
  
  if (!domId && this.cfg.type !== AdSDK.TYPE.WELCOME) {
    var error = new Error("AdSDK.start(domId) requires a DOM ID");
    this._executeCallback(domId, 'error', null, error);
    throw error;
  }
  
  if (this.cfg.type === AdSDK.TYPE.WELCOME) {
    if (!this._welcomeDom) {
      this._welcomeDom = this._createWelcomeDom();
      domId = this._welcomeSlotId;
      
      if (!domId) {
        var err = new Error("Welcome slot was not initialized correctly");
        this._executeCallback(domId, 'error', null, err);
        console.error(err.message);
        return Promise.resolve();
      }
    }
  }
  
  if (cb) {
    this._callbacks[domId] = cb;
  }
  
  var wrapper = (typeof domId === "string") ? document.getElementById(domId) : domId;
  if (!wrapper) {
    var err2 = new Error("AdSDK: element #" + domId + " not found");
    this._executeCallback(domId, 'error', null, err2);
    throw err2;
  }
  
  this._domEls[domId] = wrapper;
  if (bannerType === "DISPLAY") {
    this._domEls[domId].innerHTML = "";
    var existing = wrapper.querySelector('.ad-sdk-wrapper');
    if (existing) existing.remove();
  }
  
  var container = document.createElement("div");
  container.className = "ad-sdk-wrapper";
  if (this.cfg.width) {
    container.style.width = this.cfg.width + "px";
  } else {
    container.style.width = "100%";
  }
  if (this.cfg.height) {
    container.style.height = this.cfg.height + "px";
  } else {
    container.style.height = "100%";
  }
  
  this._containers[domId] = container;
  this._domEls[domId].appendChild(container);
  
  this._started = true;
  
  var token = (this._startTokens[domId] || 0) + 1;
  this._startTokens[domId] = token;
  
  this.emit("start", {domId: domId});
  log(this.cfg.debug, "SDK start for #" + domId + " (token:" + token + ")");
  
  return this._fetchAd(domId, token, bannerType, adSize, positionId)
    .then(function(data) {
      self._adData[domId] = data;
      self._renderAd(data, token, domId, bannerType);
      self.emit("loaded", {domId: domId, data: data});
    })
    .catch(function(err) {
      if (err.message === 'stale_fetch') {
        log(self.cfg.debug, "Stale fetch ignored for #" + domId + ".");
        return;
      }
      
      log(self.cfg.debug, "Ad fetch error for #" + domId + ": " + err.message);
      self._renderFallback(domId, 1);
      self.emit("error", {domId: domId, err: err});
      self._executeCallback(domId, 'error', null, err);
    });
};

AdSDK.prototype.dismiss = function(domId) {
  var wrapper = document.getElementById(domId);
  var layer = wrapper && wrapper.querySelector(".ad-click-layer-" + domId);
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
    
    if (this._iframeListeners && this._iframeListeners[domId]) {
      window.removeEventListener("message", this._iframeListeners[domId]);
      delete this._iframeListeners[domId];
    }
    
    if (this._iframeCleanups && this._iframeCleanups[domId]) {
      try {
        this._iframeCleanups[domId]();
      } catch (e) {
        // Silent
      }
      delete this._iframeCleanups[domId];
    }
    
    if (this._imgCleanups && this._imgCleanups[domId]) {
      try {
        this._imgCleanups[domId]();
      } catch (e) {
        // Silent
      }
      delete this._imgCleanups[domId];
    }
    
    if (this._skipTimers && this._skipTimers[domId]) {
      clearTimeout(this._skipTimers[domId]);
      delete this._skipTimers[domId];
    }
    
    delete this._callbacks[domId];
    
    var el = this._domEls[domId] || document.getElementById(domId);
    if (el) {
      var cont = el.querySelector('.ad-sdk-wrapper');
      if (cont) el.removeChild(cont);
    }
    
    delete this._containers[domId];
    delete this._domEls[domId];
    delete this._adData[domId];
    delete this._startTokens[domId];
    
    this.emit("dismiss", {domId: domId});
    log(this.cfg.debug, "SDK destroyed view for #" + domId + " - cleaned up listeners & timers.");
    return;
  }
  
  var self = this;
  Object.keys(this._containers).forEach(function(id) {
    self.dismiss(id);
  });
};

AdSDK.prototype.destroy = function() {
  var self = this;
  
  Object.keys(this._containers).forEach(function(domId) {
    try {
      var el = self._domEls[domId] || document.getElementById(domId);
      if (el) {
        var container = el.querySelector('.ad-sdk-wrapper');
        if (container) el.removeChild(container);
      }
    } catch (e) {
      // Silent
    }
  });
  
  Object.keys(this._iframeListeners).forEach(function(k) {
    window.removeEventListener("message", self._iframeListeners[k]);
  });
  
  Object.keys(this._renderTimeouts || {}).forEach(function(k) {
    clearTimeout(self._renderTimeouts[k]);
  });
  this._renderTimeouts = {};
  
  Object.keys(this._iframeCleanups).forEach(function(k) {
    try {
      self._iframeCleanups[k]();
    } catch (e) {
      // Silent
    }
  });
  
  Object.keys(this._imgCleanups).forEach(function(k) {
    try {
      self._imgCleanups[k]();
    } catch (e) {
      // Silent
    }
  });
  
  Object.keys(this._skipTimers).forEach(function(k) {
    clearTimeout(self._skipTimers[k]);
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
  this._callbacks = {};
  
  if (this._messageListener) {
    window.removeEventListener('message', this._messageListener);
    this._messageListener = null;
  }
  
  this._started = false;
  this._handlers = {};
  
  this.emit('destroy');
  log(this.cfg.debug, 'SDK fully reset (destroyHard).');
};

AdSDK.prototype.fitBannerIframe = function(slotWrapperOrId, iframe, originalW, originalH) {
  var wrapper = (typeof slotWrapperOrId === "string")
    ? document.getElementById(slotWrapperOrId)
    : slotWrapperOrId;
  
  if (!wrapper || !iframe) return null;
  
  var applyScale = function() {
    var wrapW = wrapper.clientWidth;
    var wrapH = wrapper.clientHeight;
    
    if (!wrapW || !wrapH) return;
    
    var scale = Math.min(wrapW / originalW, wrapH / originalH) || 1;
    
    iframe.style.width = originalW + "px";
    iframe.style.height = originalH + "px";
    iframe.style.transform = "scale(" + scale + ")";
    iframe.style.transformOrigin = "top left";
    iframe.style.position = "absolute";
    iframe.style.left = (wrapW - originalW * scale) / 2 + "px";
    iframe.style.top = (wrapH - originalH * scale) / 2 + "px";
    
    wrapper.style.position = "relative";
    wrapper.style.overflow = "visible";
  };
  
  applyScale();
  
  var resizeHandler = function() {
    applyScale();
  };
  window.addEventListener("resize", resizeHandler);
  
  return function() {
    window.removeEventListener("resize", resizeHandler);
  };
};

AdSDK.prototype._startSkipCountdown = function(token, domId, ad, isWelcome) {
  var self = this;
  
  if (this._skipTimers && this._skipTimers[domId]) {
    clearTimeout(this._skipTimers[domId]);
    this._skipTimers[domId] = null;
  }
  
  var skipTime = (isWelcome ? ad.skipOffset : ad.skipOffSet) || 0;
  
  if (!skipTime) return;
  
  var countdownText = null;
  if (isWelcome) {
    var container = this._containers[domId];
    if (container) {
      countdownText = document.createElement("div");
      countdownText.className = "skip-countdown-text";
      countdownText.textContent = "Bỏ qua sau " + skipTime + " giây";
      
      countdownText.style.position = "absolute";
      countdownText.style.bottom = "10px";
      countdownText.style.right = "10px";
      countdownText.style.background = "rgba(0,0,0,0.7)";
      countdownText.style.color = "#ffffff";
      countdownText.style.padding = "8px 12px";
      countdownText.style.borderRadius = "4px";
      countdownText.style.fontSize = "14px";
      countdownText.style.fontWeight = "500";
      countdownText.style.zIndex = "1000001";
      countdownText.style.pointerEvents = "none";
      countdownText.style.transition = "opacity 0.3s ease";
      
      container.appendChild(countdownText);
      
      var remainingTime = skipTime;
      var countdownInterval = setInterval(function() {
        if (token !== self._startTokens[domId]) {
          clearInterval(countdownInterval);
          if (countdownText && countdownText.parentNode) {
            countdownText.remove();
          }
          return;
        }
        
        remainingTime--;
        if (remainingTime > 0) {
          countdownText.textContent = "Bỏ qua sau " + remainingTime + " giây";
        } else {
          clearInterval(countdownInterval);
          if (countdownText) {
            countdownText.style.opacity = "0";
            setTimeout(function() {
              if (countdownText && countdownText.parentNode) {
                countdownText.remove();
              }
            }, 300);
          }
        }
      }, 1000);
    }
  }
  
  this._skipTimers[domId] = setTimeout(function() {
    if (token !== self._startTokens[domId]) return;
    
    // FIXED: typo "ocument" -> "document"
    var elem = document.getElementById(domId);
    if (elem && elem.querySelector('.banner-close-btn')) {
      elem.querySelector('.banner-close-btn').style.opacity = "1";
      elem.querySelector('.banner-close-btn').style.pointerEvents = "auto";
    }
    
    if (countdownText && countdownText.parentNode) {
      countdownText.style.opacity = "0";
      setTimeout(function() {
        if (countdownText && countdownText.parentNode) {
          countdownText.remove();
        }
      }, 300);
    }
  }, skipTime * 1000);
};

AdSDK.prototype._renderAd = function(ad, token, domId, bannerType) {
  var self = this;
  
  if (!ad) return this._renderFallback(domId, 2);
  
  if (token !== this._startTokens[domId]) {
    log(this.cfg.debug, "Render ignored for #" + domId + " (stale token:" + token + ")", 'warn');
    return;
  }
  
  var container = this._containers[domId];
  if (!container) {
    log(this.cfg.debug, "Render aborted: container missing for #" + domId, 'warn');
    return this._renderFallback(domId, 3);
  }
  
  container.innerHTML = "";
  
  if (!this._renderTimeouts) this._renderTimeouts = {};
  
  var isWelcome = this.cfg.type === AdSDK.TYPE.WELCOME;
  
  if (this.cfg.isUsePartnerSkipButton && (bannerType === "OVERLAY" || isWelcome)) {
    var buttonSkip = document.createElement("button");
    buttonSkip.className = "banner-close-btn";
    buttonSkip.innerHTML = "✕";
    buttonSkip.style.position = "absolute";
    buttonSkip.style.top = "-16px";
    buttonSkip.style.right = "-16px";
    buttonSkip.style.width = "32px";
    buttonSkip.style.height = "32px";
    buttonSkip.style.display = "flex";
    buttonSkip.style.alignItems = "center";
    buttonSkip.style.justifyContent = "center";
    buttonSkip.style.cursor = "pointer";
    buttonSkip.style.fontSize = "20px";
    buttonSkip.style.border = "none";
    buttonSkip.style.boxShadow = "0px 0px 6.4px 0px #00000080";
    buttonSkip.style.borderRadius = "50%";
    buttonSkip.style.background = "#ffffff";
    buttonSkip.style.color = "#000000";
    buttonSkip.style.zIndex = "1000000";
    buttonSkip.style.opacity = "0";
    buttonSkip.style.transition = "opacity .3s ease";
    buttonSkip.style.pointerEvents = "none";
    container.appendChild(buttonSkip);
    
    if (isWelcome) {
      this._welcomeCloseBtn = buttonSkip;
    }
    
    buttonSkip.addEventListener("click", function() {
      self.emit("skip", {domId: domId, ad: ad});
      self._track("skip", ad.trackingEvents && ad.trackingEvents.skip);
      buttonSkip.style.opacity = "0";
      buttonSkip.style.pointerEvents = "none";
      
      if (isWelcome && self._welcomeDom) {
        self._welcomeDom.style.opacity = "0";
        setTimeout(function() {
          self.dismiss(domId);
        }, 300);
      }
    });
  }
  
  switch (ad.bannerSource) {
    case "IMG":
      this._renderImageAd(ad, token, domId, container, isWelcome);
      break;
    
    case "URL":
    case "HTML":
    case "SDK":
      this._renderIframeAd(ad, token, domId, container, isWelcome);
      break;
    
    case "VAST":
      this._renderVast(ad.url, token, domId)
        .then(function() {
          if (token !== self._startTokens[domId]) return;
          self.emit("rendered", {domId: domId, ad: ad});
          self._executeCallback(domId, 'success', ad);
        })
        .catch(function(err) {
          console.error("[AdSDK] VAST render error:", err);
          if (token !== self._startTokens[domId]) return;
          self.emit("error", {domId: domId, err: err});
          self._handleRenderError(domId, isWelcome);
          self._executeCallback(domId, 'error', null, err);
        });
      break;
    
    default:
      this._renderFallback(domId, 4);
  }
};

AdSDK.prototype._renderImageAd = function(ad, token, domId, container, isWelcome) {
  var self = this;
  var img = new Image();
  img.src = isWelcome ? ad.url : ad.content;
  img.style.position = "absolute";
  img.style.top = "0";
  img.style.left = "0";
  img.style.transformOrigin = "top left";
  img.style.cursor = ad.clickThrough ? "pointer" : "default";
  
  var applyScale = function() {
    if (!self._containers[domId]) return;
    
    var wrapW = container.clientWidth;
    var wrapH = container.clientHeight;
    if (!wrapW || !wrapH) return;
    
    var scale = Math.min(wrapW / ad.ratioWidth, wrapH / ad.ratioHeight) || 1;
    
    img.style.width = ad.ratioWidth + "px";
    img.style.height = ad.ratioHeight + "px";
    img.style.transform = "scale(" + scale + ")";
    
    var left = (wrapW - ad.ratioWidth * scale) / 2;
    var top = (wrapH - ad.ratioHeight * scale) / 2;
    
    img.style.left = left + "px";
    img.style.top = top + "px";
    
    container.style.position = "relative";
    container.style.overflow = "visible";
    
    self._syncCloseButtonToImage(domId, img, scale);
  };
  
  container.appendChild(img);
  applyScale();
  
  var resizeHandler = function() {
    applyScale();
  };
  window.addEventListener("resize", resizeHandler);
  
  this._imgCleanups[domId] = function() {
    window.removeEventListener("resize", resizeHandler);
  };
  
  img.onload = function() {
    if (token !== self._startTokens[domId]) return;
    if (!self._containers[domId]) return;
    
    if (isWelcome && self._welcomeDom) {
      // FIXED: Use setTimeout instead of requestAnimationFrame for Chrome 38
      setTimeout(function() {
        self._welcomeDom.style.opacity = "1";
      }, 16);
    }
    
    self.emit("rendered", {domId: domId, ad: ad});
    self._startSkipCountdown(token, domId, ad, isWelcome);
    self._track("impression", ad.trackingEvents && ad.trackingEvents.impression);
    self._executeCallback(domId, 'success', ad);
  };
  
  img.onerror = function() {
    console.error("[AdSDK] Image load error:", img.src);
    if (token !== self._startTokens[domId]) return;
    self._track("error", ad.trackingEvents && ad.trackingEvents.error);
    var error = new Error("Image load error: " + img.src);
    self.emit("error", {domId: domId, err: error});
    self._handleRenderError(domId, isWelcome);
    self._executeCallback(domId, 'error', null, error);
  };
  
  if (ad.clickThrough) {
    img.addEventListener("click", function() {
      if (token !== self._startTokens[domId]) return;
      window.open(ad.clickThrough, "_blank");
      self._track("click", ad.clickTracking);
      self.emit("click", {domId: domId, ad: ad});
    });
  }
};

AdSDK.prototype._renderIframeAd = function(ad, token, domId, container, isWelcome) {
  var self = this;
  
  if (token !== this._startTokens[domId]) return;
  
  container.style.overflow = "visible";
  
  var iframe = document.createElement("iframe");
  iframe.style.border = "none";
  iframe.sandbox = "allow-scripts allow-same-origin allow-popups allow-top-navigation-by-user-activation";
  
  var iframeId = "iframe-" + domId + "-" + token;
  iframe.setAttribute('data-ad-iframe-id', iframeId);
  
  var contentSource = isWelcome ? ad.url : ad.content;
  
  if (!contentSource) {
    console.error('[AdSDK] No content source for iframe ad');
    var error = new Error('No content source');
    this.emit("error", {domId: domId, err: error});
    this._handleRenderError(domId, isWelcome);
    this._executeCallback(domId, 'error', null, error);
    return;
  }
  
  try {
    var url = new URL(contentSource);
    iframe.src = url.href;
  } catch (err) {
    iframe.srcdoc = contentSource;
  }
  
  if (ad.ratioWidth) iframe.width = ad.ratioWidth;
  if (ad.ratioHeight) iframe.height = ad.ratioHeight;
  
  container.appendChild(iframe);
  
  var cleanupFit = this.fitBannerIframe(
    container,
    iframe,
    iframe.width || (ad.ratioWidth || 300),
    iframe.height || (ad.ratioHeight || 250)
  );
  
  if (this._iframeCleanups[domId]) {
    try {
      this._iframeCleanups[domId]();
    } catch (e) {
      // Silent
    }
  }
  this._iframeCleanups[domId] = cleanupFit;
  
  var hasRendered = false;
  
  if (this._iframeListeners[domId]) {
    try {
      window.removeEventListener("message", this._iframeListeners[domId]);
    } catch (e) {
      // Silent
    }
    delete this._iframeListeners[domId];
  }
  
  this._iframeListeners[domId] = function(e) {
    var d = e.data;
    
    if (!d) return;
    if (hasRendered) return;
    
    if (d.imageLoaded || d.type === "RENDERED" || d.event === "rendered" || d.action === "ADS_LOADED") {
      if (token !== self._startTokens[domId]) return;
      
      hasRendered = true;
      
      if (self._renderTimeouts && self._renderTimeouts[domId]) {
        clearTimeout(self._renderTimeouts[domId]);
        delete self._renderTimeouts[domId];
      }
      
      if (isWelcome && self._welcomeDom) {
        // FIXED: Use setTimeout instead of requestAnimationFrame
        setTimeout(function() {
          self._welcomeDom.style.opacity = "1";
        }, 16);
      }
      
      self.emit("rendered", {domId: domId, ad: ad});
      self._startSkipCountdown(token, domId, ad, isWelcome);
      self._track("impression", ad.trackingEvents && ad.trackingEvents.impression);
      self._executeCallback(domId, 'success', ad);
    }
  };
  
  window.addEventListener("message", this._iframeListeners[domId]);
  
  var renderTimeout = setTimeout(function() {
    console.log('[AdSDK Debug] Timeout fired for domId:', domId, {
      token: token,
      currentToken: self._startTokens[domId],
      hasRendered: hasRendered,
      isWelcome: isWelcome,
      welcomeDomExists: !!self._welcomeDom,
      welcomeDomOpacity: self._welcomeDom && self._welcomeDom.style.opacity
    });
    
    if (token !== self._startTokens[domId]) return;
    if (hasRendered) return;
    
    var alreadyRendered = isWelcome
      ? (self._welcomeDom && self._welcomeDom.style.opacity === "1")
      : false;
    
    if (!alreadyRendered) {
      console.error('[AdSDK] ❌ Iframe render timeout - no message received for domId:', domId, 'isWelcome:', isWelcome);
      var error = new Error('Iframe render timeout');
      self._track("error", ad.trackingEvents && ad.trackingEvents.error);
      self.emit("error", {domId: domId, err: error});
      self._handleRenderError(domId, isWelcome);
      self._executeCallback(domId, 'error', null, error);
    }
  }, 3000);
  
  if (!this._renderTimeouts) this._renderTimeouts = {};
  this._renderTimeouts[domId] = renderTimeout;
  
  if (ad.clickThrough) {
    var wrapper = document.getElementById(domId);
    wrapper.style.position = "absolute";
    
    var clickLayer = document.createElement("div");
    clickLayer.className = "ad-click-layer-" + domId;
    clickLayer.style.cssText =
      "position:absolute;" +
      "inset:0;" +
      "z-index:9998;" +
      "cursor:pointer;" +
      "background:rgba(0,0,0,0);";
    
    clickLayer.addEventListener("click", function(e) {
      e.stopPropagation();
      window.open(ad.clickThrough, "_blank");
      self._track("click", ad.clickTracking);
      self.emit("click", {domId: domId, ad: ad});
    });
    
    wrapper.appendChild(clickLayer);
  }
};

AdSDK.prototype._handleRenderError = function(domId, isWelcome) {
  var self = this;
  if (isWelcome) {
    if (this._welcomeDom) {
      this._welcomeDom.style.opacity = "0";
      setTimeout(function() {
        self.dismiss(domId);
      }, 300);
    } else {
      this.dismiss(domId);
    }
  } else {
    this._renderFallback(domId, 5);
  }
};

AdSDK.prototype._renderVast = function(vastUrl, token, domId) {
  var self = this;
  
  return fetch(vastUrl)
    .then(function(response) {
      if (!response.ok) throw new Error("VAST fetch error: " + response.status);
      return response.text();
    })
    .then(function(xmlText) {
      if (token !== self._startTokens[domId]) {
        log(self.cfg.debug, 'VAST fetch ignored (stale token)', 'warn');
        return;
      }
      
      var parser = new DOMParser();
      var xml = parser.parseFromString(xmlText, "text/xml");
      
      var linear = xml.querySelector("Linear");
      var skipOffsetAttr = linear && linear.getAttribute("skipoffset");
      var skipOffsetSec = skipOffsetAttr
        ? self._vastTimeToSeconds(skipOffsetAttr)
        : null;
      var skippable = skipOffsetAttr !== null;
      
      var mediaFile = xml.querySelector("MediaFile[type='video/mp4'], MediaFile").textContent.trim();
      if (!mediaFile) throw new Error("No MediaFile found in VAST");
      
      var video = document.createElement("video");
      video.src = mediaFile;
      video.autoplay = true;
      video.controls = false;
      video.playsInline = true;
      video.muted = true;
      video.style.width = "100%";
      video.style.height = "100%";
      video.style.background = "#000";
      
      var clickThrough = xml.querySelector("ClickThrough").textContent.trim();
      if (clickThrough) {
        video.style.cursor = "pointer";
        video.addEventListener("click", function() {
          if (token !== self._startTokens[domId]) return;
          window.open(clickThrough, "_blank");
          self._track("click");
        });
      }
      
      var wrapper = document.createElement("div");
      wrapper.style.position = "relative";
      wrapper.style.width = "100%";
      wrapper.style.height = "100%";
      wrapper.style.overflow = "hidden";
      wrapper.appendChild(video);
      
      var container = self._containers[domId];
      if (!container) {
        throw new Error('Container missing for VAST render');
      }
      
      container.innerHTML = "";
      container.appendChild(wrapper);
      
      var skipBtn = document.createElement("div");
      skipBtn.style.position = "absolute";
      skipBtn.style.bottom = "20px";
      skipBtn.style.right = "20px";
      skipBtn.style.background = "rgba(0,0,0,0.7)";
      skipBtn.style.color = "#fff";
      skipBtn.style.fontSize = "14px";
      skipBtn.style.padding = "8px 16px";
      skipBtn.style.borderRadius = "4px";
      skipBtn.style.cursor = "default";
      skipBtn.style.opacity = "0";
      skipBtn.style.transition = "opacity 0.3s";
      wrapper.appendChild(skipBtn);
      
      var muteBtn = document.createElement("div");
      muteBtn.style.position = "absolute";
      muteBtn.style.bottom = "20px";
      muteBtn.style.left = "20px";
      muteBtn.style.background = "rgba(0,0,0,0.6)";
      muteBtn.style.color = "#fff";
      muteBtn.style.fontSize = "16px";
      muteBtn.style.padding = "6px 10px";
      muteBtn.style.borderRadius = "50%";
      muteBtn.style.cursor = "pointer";
      muteBtn.style.opacity = "0.8";
      muteBtn.style.userSelect = "none";
      muteBtn.textContent = "🔇";
      wrapper.appendChild(muteBtn);
      
      var onMuteToggle = function() {
        if (token !== self._startTokens[domId]) return;
        video.muted = !video.muted;
        muteBtn.textContent = video.muted ? "🔇" : "🔊";
      };
      muteBtn.addEventListener("click", onMuteToggle);
      
      if (skippable) {
        var allowSkipAfter = skipOffsetSec !== null && skipOffsetSec !== undefined ? skipOffsetSec : 5;
        var remaining = allowSkipAfter;
        skipBtn.textContent = "Skip in " + remaining + "s";
        skipBtn.style.opacity = "1";
        
        var interval = setInterval(function() {
          if (token !== self._startTokens[domId]) {
            clearInterval(interval);
            return;
          }
          remaining -= 1;
          if (remaining > 0) {
            skipBtn.textContent = "Skip in " + remaining + "s";
          } else {
            clearInterval(interval);
            skipBtn.textContent = "Skip Ad ▶";
            skipBtn.style.cursor = "pointer";
            self.emit("vast_skip_available", {domId: domId, allowSkipAfter: allowSkipAfter});
            skipBtn.addEventListener("click", function() {
              if (token !== self._startTokens[domId]) return;
              self.emit("vast_skipped", {domId: domId});
              self._track("video_skip");
              self._fadeOut(wrapper, function() {
                self.dismiss(domId);
              });
            });
          }
        }, 1000);
        
        self.emit("vast_skip_timer_start", {domId: domId, allowSkipAfter: allowSkipAfter});
      } else {
        skipBtn.textContent = "Ad playing...";
        skipBtn.style.opacity = "0.8";
      }
      
      var onPlay = function() {
        if (token === self._startTokens[domId]) self._track("video_start");
      };
      var onEnded = function() {
        if (token !== self._startTokens[domId]) return;
        self._track("video_complete");
        self._fadeOut(wrapper, function() {
          if (self.cfg.type === "WELCOME") self.dismiss(domId);
        });
      };
      
      video.addEventListener("play", onPlay);
      video.addEventListener("ended", onEnded);
    });
};

AdSDK.prototype._vastTimeToSeconds = function(timeStr) {
  if (!timeStr) return 0;
  var parts = timeStr.split(":").map(Number);
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (timeStr.indexOf("%") !== -1) {
    return parseFloat(timeStr) / 100;
  }
  return parseInt(timeStr, 10) || 0;
};

AdSDK.prototype._fadeOut = function(el, callback) {
  el.style.transition = "opacity 0.8s ease";
  el.style.opacity = "1";
  // FIXED: Use setTimeout instead of requestAnimationFrame
  setTimeout(function() {
    el.style.opacity = "0";
    setTimeout(function() {
      if (el.parentNode) el.parentNode.removeChild(el);
      if (callback) callback();
    }, 800);
  }, 16);
};

AdSDK.prototype._renderFallback = function(domId, index) {
  var container = this._containers[domId];
  if (!container) return;
  container.innerHTML =
    '<div style="display:flex;align-items:center;justify-content:center;background:#eee;width:100%;height:100%;color:#999;">' +
    'Ad unavailable' +
    '</div>';
  this.emit("rendered", {domId: domId, type: "fallback", index: index});
  this._executeCallback(domId, 'fallback', null, new Error('Ad unavailable'));
};

AdSDK.prototype._track = function(eventType, fetchUrl) {
  try {
    var debug = this.cfg.debug;
    
    if (!fetchUrl) return;
    
    fetch(fetchUrl, {method: "GET", mode: "no-cors"})
      .then(function() {
        log(debug, "Tracking " + eventType + ": " + fetchUrl);
      })
      .catch(function(err) {
        log(debug, "Tracking error: " + err.message);
      });
    
  } catch (e) {
    log(this.cfg.debug, "Track error: " + e.message);
  }
};

AdSDK.prototype._createWelcomeDom = function() {
  var self = this;
  var id = "ad-welcome-" + Math.random().toString(36).slice(2, 7);
  var el = document.createElement("div");
  el.style.position = "fixed";
  el.style.inset = "0";
  el.style.zIndex = "999999";
  el.style.background = "rgba(0,0,0,0.85)";
  el.style.display = "flex";
  el.style.alignItems = "center";
  el.style.justifyContent = "center";
  el.style.width = "100vw";
  el.style.height = "100vh";
  el.id = id;
  el.style.opacity = "0";
  el.style.transition = "opacity 0.4s ease";
  
  document.body.appendChild(el);
  
  var slotId = "welcome-slot-" + Math.random().toString(36).slice(2, 7);
  var slot = document.createElement("div");
  slot.id = slotId;
  slot.style.width = "600px";
  slot.style.height = "500px";
  slot.style.maxWidth = "100vw";
  slot.style.maxHeight = "100vh";
  slot.style.display = "flex";
  slot.style.alignItems = "center";
  slot.style.justifyContent = "center";
  slot.style.position = "relative";
  slot.style.overflow = "visible";
  el.appendChild(slot);
  
  this._domEls[slotId] = slot;
  this._welcomeDom = el;
  this._welcomeSlotId = slotId;
  
  var closeBtn = document.createElement("div");
  closeBtn.innerText = "✕";
  closeBtn.style.position = "absolute";
  closeBtn.style.top = "-16px";
  closeBtn.style.right = "-16px";
  closeBtn.style.width = "32px";
  closeBtn.style.height = "32px";
  closeBtn.style.display = "flex";
  closeBtn.style.alignItems = "center";
  closeBtn.style.justifyContent = "center";
  closeBtn.style.cursor = "pointer";
  closeBtn.style.fontSize = "20px";
  closeBtn.style.boxShadow = "0px 0px 6.4px 0px #00000080";
  closeBtn.style.borderRadius = "50%";
  closeBtn.style.background = "#ffffff";
  closeBtn.style.color = "#000000";
  closeBtn.style.zIndex = "1000000";
  closeBtn.style.opacity = "0";
  closeBtn.style.transition = "opacity .3s ease";
  closeBtn.style.pointerEvents = "none";
  
  slot.appendChild(closeBtn);
  this._welcomeCloseBtn = closeBtn;
  
  closeBtn.addEventListener("click", function() {
    self._track("skip", self._adData[slotId] && self._adData[slotId].trackingEvents && self._adData[slotId].trackingEvents.skip);
    el.style.opacity = "0";
    setTimeout(function() {
      el.remove();
      self._welcomeDom = null;
      self._welcomeSlotId = null;
      self._welcomeCloseBtn = null;
    }, 300);
  });
  
  return el;
};

AdSDK.prototype._initPostMessage = function() {
  var self = this;
  this._messageListener = function(event) {
    var data = event.data;
    if (!data || data.channel !== self.cfg.postMessageChannel) return;
    
    switch (data.type) {
      case "start":
        self.start(data.domId || self.cfg.domId, data.bannerType, data.adSize, data.positionId, data.callback);
        break;
      case "render":
        self._renderAd(data.payload, self._startTokens[data.domId] || 0, data.domId);
        break;
      case "dismiss":
        self.dismiss(data.domId);
        break;
    }
  };
  window.addEventListener("message", this._messageListener);
  log(this.cfg.debug, "PostMessage channel initialized.");
};

// ---- Constants ----
AdSDK.ENV = {
  SANDBOX: "SANDBOX",
  PRODUCTION: "PRODUCTION"
};

AdSDK.TYPE = {
  DISPLAY: "DISPLAY",
  OUTSTREAM: "OUTSTREAM",
  WELCOME: "WELCOME"
};

AdSDK.EVENT_TYPE = {
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

AdSDK.PLATFORM = {
  TV: "TV",
  WEB: "WEB",
  ANDROID: "ANDROID",
  IOS: "IOS"
};

AdSDK.CONTENT_TYPE = {
  VOD: "VOD",
  LIVE: "LIVE",
  FILM: "FILM",
  VIDEO: "VIDEO"
};

AdSDK.GENDER = {
  MALE: "MALE",
  FEMALE: "FEMALE",
  OTHER: "OTHER",
  NONE: "NONE"
};

AdSDK.AD_SIZE = {
  MINI_BANNER: "MINI_BANNER",
  SUBPAGE_BANNER: "SUBPAGE_BANNER",
  HOMEPAGE_LARGE_BANNER: "HOMEPAGE_LARGE_BANNER",
  PAUSE_BANNER: "PAUSE_BANNER"
};

AdSDK.BANNER_TYPE = {
  DISPLAY: "DISPLAY",
  OVERLAY: "OVERLAY"
};

// ---- Auto-init ----
window.SDK_INIT = undefined;
if (typeof window !== "undefined" && window.SDK_INIT && typeof window.SDK_INIT === "object") {
  window.sdk = new AdSDK(window.SDK_INIT);
  if (window.SDK_INIT.domId) window.sdk.start(window.SDK_INIT.domId);
}