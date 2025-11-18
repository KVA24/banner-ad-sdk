// ad-sdk-refactored.js
import CryptoJS from 'crypto-js';

// ============================================================================
// CONSTANTS
// ============================================================================

const CONSTANTS = {
  TIMEOUTS: {
    FETCH: 8000,
    BACKOFF: 300,
    FADE_OUT: 800,
    VAST_FETCH: 10000
  },
  RETRY: {
    MAX_ATTEMPTS: 2,
    BACKOFF_MS: 300
  },
  STORAGE_KEY: 'wiinvent-viewer-id',
  SALT_LENGTH: 20,
  LOG_STYLES: {
    log: 'color:#4CAF50;font-weight:bold',
    warn: 'color:#FF9800;font-weight:bold',
    error: 'color:#F44336;font-weight:bold'
  }
};

const ENV = {
  SANDBOX: 'SANDBOX',
  PRODUCTION: 'PRODUCTION'
};

const TYPE = {
  DISPLAY: 'DISPLAY',
  OUTSTREAM: 'OUTSTREAM',
  WELCOME: 'WELCOME',
  BANNER: 'BANNER'
};

const EVENT_TYPE = {
  REQUEST: 'REQUEST',
  START: 'START',
  IMPRESSION: 'IMPRESSION',
  CLICK: 'CLICK',
  COMPLETE: 'COMPLETE',
  SKIPPED: 'SKIPPED',
  USER_AD_BLOCK: 'USER_AD_BLOCK',
  VOLUME_MUTED: 'VOLUME_MUTED',
  VOLUME_ON: 'VOLUME_ON',
  ERROR: 'ERROR',
  QUARTILE_25: 'QUARTILE_25',
  QUARTILE_50: 'QUARTILE_50',
  QUARTILE_75: 'QUARTILE_75'
};

const PLATFORM = {
  TV: 'TV',
  WEB: 'WEB',
  ANDROID: 'ANDROID',
  IOS: 'IOS'
};

const CONTENT_TYPE = {
  VOD: 'VOD',
  LIVE: 'LIVE',
  FILM: 'FILM',
  VIDEO: 'VIDEO'
};

const GENDER = {
  MALE: 'MALE',
  FEMALE: 'FEMALE',
  OTHER: 'OTHER',
  NONE: 'NONE'
};

const AD_SIZE = {
  MINI_BANNER: 'MINI_BANNER',
  MEDIUM_BANNER: 'MEDIUM_BANNER',
  LARGE_BANNER: 'LARGE_BANNER',
  PAUSE_BANNER: 'PAUSE_BANNER'
};

const BANNER_TYPE = {
  DISPLAY: 'DISPLAY',
  OVERLAY: 'OVERLAY'
};

// ============================================================================
// UTILITIES
// ============================================================================

class Logger {
  constructor(debug = false) {
    this.debug = debug;
  }
  
  log(message, level = 'log') {
    if (!this.debug) return;
    const style = CONSTANTS.LOG_STYLES[level] || '';
    if (console[level]) {
      console[level](`%c[AdSDK]`, style, message);
    }
  }
  
  warn(message) {
    this.log(message, 'warn');
  }
  
  error(message) {
    this.log(message, 'error');
  }
  
  group(title, fn) {
    if (!this.debug) return;
    console.groupCollapsed(title);
    fn();
    console.groupEnd();
  }
}

class DeviceIdManager {
  static get() {
    let deviceId = localStorage.getItem(CONSTANTS.STORAGE_KEY);
    
    if (!deviceId) {
      deviceId = this.generate();
      localStorage.setItem(CONSTANTS.STORAGE_KEY, deviceId);
    }
    
    return deviceId;
  }
  
  static generate() {
    let dt = Date.now();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (dt + Math.random() * 16) % 16 | 0;
      dt = Math.floor(dt / 16);
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }
  
  static clear() {
    localStorage.removeItem(CONSTANTS.STORAGE_KEY);
  }
}

class SignatureGenerator {
  static generate(positionId, tenantId, secretKey, logger) {
    if (!positionId || !tenantId) {
      throw new Error('positionId and tenantId are required for signature generation');
    }
    
    const salt = this._generateSalt();
    const deviceId = DeviceIdManager.get();
    const raw = `${positionId}${deviceId}${tenantId}${salt}`;
    
    // Use HMAC-SHA256 instead of MD5 for security
    const hash = CryptoJS.HmacSHA256(raw, secretKey || 'default-secret').toString();
    const sign = salt + hash;
    
    logger?.group('[AdSDK] Signature Generation', () => {
      console.log('positionId:', positionId);
      console.log('tenantId:', tenantId);
      console.log('deviceId:', deviceId);
      console.log('salt:', salt);
      console.log('signature:', sign);
    });
    
    return {sign, salt, deviceId};
  }
  
  static _generateSalt() {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    return Array.from(
      {length: CONSTANTS.SALT_LENGTH},
      () => chars[Math.floor(Math.random() * chars.length)]
    ).join('');
  }
}

// ============================================================================
// CONFIG MANAGER
// ============================================================================

class ConfigManager {
  static getDefaultConfig() {
    return {
      // Required
      tenantId: null,
      streamId: null,
      positionId: null,
      
      // Optional
      adId: null,
      channelId: null,
      platform: PLATFORM.WEB,
      deviceType: 'DESKTOP',
      transId: null,
      category: null,
      keyword: null,
      age: '0',
      gender: GENDER.NONE,
      token: null,
      segments: null,
      
      // SDK Settings
      env: ENV.SANDBOX,
      type: TYPE.DISPLAY,
      position: null,
      adSize: AD_SIZE.MEDIUM_BANNER,
      bannerType: BANNER_TYPE.DISPLAY,
      debug: false,
      width: null,
      height: null,
      
      // PostMessage
      postMessage: true,
      postMessageChannel: 'ad-sdk',
      targetOrigin: '*',
      
      // Fetch settings
      fetchTimeout: CONSTANTS.TIMEOUTS.FETCH,
      fetchRetries: CONSTANTS.RETRY.MAX_ATTEMPTS,
      fetchBackoff: CONSTANTS.RETRY.BACKOFF_MS,
      
      // Secret key for signing (should be provided by backend)
      secretKey: 'default-secret'
    };
  }
  
  static getEnvironmentConfig(env) {
    const configs = {
      [ENV.SANDBOX]: {
        fetchUrl: 'https://dev-pubads.wiinvent.tv/v1/adserving/banner/campaign',
        trackUrl: 'https://dev-pubads.wiinvent.tv/v1/track'
      },
      [ENV.PRODUCTION]: {
        fetchUrl: 'https://pubads.wiinvent.tv/v1/adserving/banner/campaign',
        trackUrl: 'https://pubads.wiinvent.tv/v1/track'
      }
    };
    
    return configs[env] || configs[ENV.SANDBOX];
  }
  
  static validate(config) {
    const errors = [];
    
    if (!config.tenantId) {
      errors.push('tenantId is required');
    }
    
    if (!config.streamId) {
      errors.push('streamId is required');
    }
    
    if (!Object.values(PLATFORM).includes(config.platform)) {
      errors.push(`Invalid platform: ${config.platform}`);
    }
    
    if (!Object.values(ENV).includes(config.env)) {
      errors.push(`Invalid environment: ${config.env}`);
    }
    
    return errors;
  }
  
  static merge(userConfig) {
    const defaults = this.getDefaultConfig();
    const merged = {...defaults, ...userConfig};
    
    // Merge environment-specific config
    const envConfig = this.getEnvironmentConfig(merged.env);
    Object.assign(merged, envConfig);
    
    return merged;
  }
}

// ============================================================================
// EVENT EMITTER
// ============================================================================

class EventEmitter {
  constructor(logger) {
    this._handlers = {};
    this._logger = logger;
  }
  
  on(event, handler) {
    if (typeof handler !== 'function') {
      throw new Error('Event handler must be a function');
    }
    
    if (!this._handlers[event]) {
      this._handlers[event] = [];
    }
    
    this._handlers[event].push(handler);
  }
  
  off(event, handler) {
    if (!this._handlers[event]) return;
    
    if (handler) {
      this._handlers[event] = this._handlers[event].filter(h => h !== handler);
    } else {
      delete this._handlers[event];
    }
  }
  
  emit(event, data) {
    const handlers = this._handlers[event] || [];
    
    handlers.forEach(handler => {
      try {
        handler(data);
      } catch (err) {
        this._logger?.error(`Event handler error (${event}): ${err.message}`);
      }
    });
  }
  
  removeAllListeners() {
    this._handlers = {};
  }
}

// ============================================================================
// HTTP CLIENT
// ============================================================================

class HttpClient {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
  }
  
  async fetch(url, options = {}) {
    let attempt = 0;
    const maxAttempts = this.config.fetchRetries + 1;
    
    while (attempt < maxAttempts) {
      attempt++;
      
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(
          () => controller.abort(),
          options.timeout || this.config.fetchTimeout
        );
        
        const response = await fetch(url, {
          ...options,
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        return await response.json();
      } catch (err) {
        if (attempt < maxAttempts) {
          this.logger?.warn(
            `Fetch attempt ${attempt} failed: ${err.message}. Retrying in ${this.config.fetchBackoff}ms...`
          );
          await this._delay(this.config.fetchBackoff);
        } else {
          throw new Error(`Fetch failed after ${maxAttempts} attempts: ${err.message}`);
        }
      }
    }
  }
  
  buildUrl(baseUrl, params) {
    const url = new URL(baseUrl);
    
    Object.keys(params).forEach(key => {
      const value = params[key];
      if (value !== null && value !== undefined && value !== '') {
        url.searchParams.append(key, value);
      }
    });
    
    return url.toString();
  }
  
  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// TRACKER
// ============================================================================

class Tracker {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this._tracked = new Set();
  }
  
  track(eventType, data = {}) {
    try {
      const trackUrl = this.config.trackUrl;
      const params = {
        type: eventType,
        tenantId: this.config.tenantId,
        streamId: this.config.streamId,
        position: this.config.position || '',
        ts: Date.now(),
        ...data
      };
      
      const url = new URL(trackUrl);
      Object.keys(params).forEach(key => {
        url.searchParams.append(key, params[key]);
      });
      
      // Use beacon API if available, fallback to image pixel
      if (navigator.sendBeacon) {
        navigator.sendBeacon(url.toString());
      } else {
        new Image().src = url.toString();
      }
      
      this.logger?.log(`Tracked: ${eventType}`);
    } catch (err) {
      this.logger?.error(`Tracking error: ${err.message}`);
    }
  }
  
  trackOnce(eventType, data) {
    const key = `${eventType}-${JSON.stringify(data)}`;
    
    if (this._tracked.has(key)) {
      return;
    }
    
    this._tracked.add(key);
    this.track(eventType, data);
  }
  
  trackPixel(url) {
    if (!url) return;
    
    try {
      new Image().src = url;
      this.logger?.log(`Tracked pixel: ${url}`);
    } catch (err) {
      this.logger?.error(`Pixel tracking error: ${err.message}`);
    }
  }
  
  reset() {
    this._tracked.clear();
  }
}

// ============================================================================
// VAST PARSER
// ============================================================================

class VASTParser {
  constructor(logger) {
    this.logger = logger;
  }
  
  async parse(vastUrl) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        CONSTANTS.TIMEOUTS.VAST_FETCH
      );
      
      const response = await fetch(vastUrl, {signal: controller.signal});
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`VAST fetch failed: ${response.status}`);
      }
      
      const xmlText = await response.text();
      const parser = new DOMParser();
      const xml = parser.parseFromString(xmlText, 'text/xml');
      
      const errorNode = xml.querySelector('parsererror');
      if (errorNode) {
        throw new Error('Invalid VAST XML');
      }
      
      return this._extractData(xml);
    } catch (err) {
      this.logger?.error(`VAST parsing error: ${err.message}`);
      throw err;
    }
  }
  
  _extractData(xml) {
    const linear = xml.querySelector('Linear');
    
    return {
      mediaFile: this._getMediaFile(xml),
      clickThrough: this._getClickThrough(xml),
      skipOffset: this._getSkipOffset(linear),
      duration: this._getDuration(linear),
      trackingEvents: this._getTrackingEvents(xml),
      impressions: this._getImpressions(xml),
      clickTracking: this._getClickTracking(xml)
    };
  }
  
  _getMediaFile(xml) {
    const mediaFile = xml.querySelector('MediaFile[type="video/mp4"], MediaFile');
    return mediaFile?.textContent?.trim() || null;
  }
  
  _getClickThrough(xml) {
    return xml.querySelector('ClickThrough')?.textContent?.trim() || null;
  }
  
  _getSkipOffset(linear) {
    if (!linear) return null;
    
    const skipOffset = linear.getAttribute('skipoffset');
    if (!skipOffset) return null;
    
    return this._parseTime(skipOffset);
  }
  
  _getDuration(linear) {
    const duration = linear?.querySelector('Duration')?.textContent?.trim();
    return duration ? this._parseTime(duration) : null;
  }
  
  _getTrackingEvents(xml) {
    const events = {};
    const trackingNodes = xml.querySelectorAll('Tracking');
    
    trackingNodes.forEach(node => {
      const event = node.getAttribute('event');
      const url = node.textContent?.trim();
      
      if (event && url) {
        if (!events[event]) {
          events[event] = [];
        }
        events[event].push(url);
      }
    });
    
    return events;
  }
  
  _getImpressions(xml) {
    const impressions = [];
    const impressionNodes = xml.querySelectorAll('Impression');
    
    impressionNodes.forEach(node => {
      const url = node.textContent?.trim();
      if (url) {
        impressions.push(url);
      }
    });
    
    return impressions;
  }
  
  _getClickTracking(xml) {
    const clicks = [];
    const clickNodes = xml.querySelectorAll('ClickTracking');
    
    clickNodes.forEach(node => {
      const url = node.textContent?.trim();
      if (url) {
        clicks.push(url);
      }
    });
    
    return clicks;
  }
  
  _parseTime(timeStr) {
    if (!timeStr) return 0;
    
    // Handle percentage
    if (timeStr.endsWith('%')) {
      return parseFloat(timeStr) / 100;
    }
    
    // Handle HH:MM:SS format
    const parts = timeStr.split(':').map(Number);
    if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    
    // Handle seconds
    return parseInt(timeStr, 10) || 0;
  }
}

// ============================================================================
// RENDERER
// ============================================================================

class AdRenderer {
  constructor(container, config, logger, tracker) {
    this.container = container;
    this.config = config;
    this.logger = logger;
    this.tracker = tracker;
    this.videoElement = null;
    this.quartileTracked = {25: false, 50: false, 75: false, 100: false};
  }
  
  render(ad) {
    if (!ad || !ad.format) {
      return this.renderFallback();
    }
    
    this.container.innerHTML = '';
    
    switch (ad.format) {
      case 'image':
        return this.renderImage(ad);
      case 'html':
        return this.renderHTML(ad);
      case 'iframe':
        return this.renderIframe(ad);
      case 'script':
        return this.renderScript(ad);
      case 'VAST':
        return this.renderVAST(ad.url);
      default:
        return this.renderFallback();
    }
  }
  
  renderImage(ad) {
    const img = new Image();
    
    img.onload = () => {
      this.container.appendChild(img);
      this.logger?.log('Image ad rendered');
    };
    
    img.onerror = () => {
      this.logger?.error('Image load failed');
      this.renderFallback();
    };
    
    img.src = ad.url;
    img.style.maxWidth = '100%';
    img.style.height = 'auto';
    
    if (ad.clickUrl) {
      img.style.cursor = 'pointer';
      img.addEventListener('click', () => {
        window.open(ad.clickUrl, '_blank');
        this.tracker.track(EVENT_TYPE.CLICK);
      });
    }
  }
  
  renderHTML(ad) {
    // Sanitize HTML to prevent XSS
    const sanitized = this._sanitizeHTML(ad.html || '<div>Advertisement</div>');
    this.container.innerHTML = sanitized;
    this.logger?.log('HTML ad rendered');
  }
  
  renderIframe(ad) {
    const iframe = document.createElement('iframe');
    iframe.src = ad.url;
    iframe.width = this.config.width || ad.width || '100%';
    iframe.height = this.config.height || ad.height || '100%';
    iframe.style.border = 'none';
    iframe.sandbox = 'allow-scripts allow-same-origin allow-popups';
    
    this.container.appendChild(iframe);
    this.logger?.log('Iframe ad rendered');
  }
  
  renderScript(ad) {
    const script = document.createElement('script');
    script.src = ad.url;
    script.async = true;
    
    this.container.appendChild(script);
    this.logger?.log('Script ad loaded');
  }
  
  async renderVAST(vastUrl) {
    try {
      const parser = new VASTParser(this.logger);
      const vastData = await parser.parse(vastUrl);
      
      if (!vastData.mediaFile) {
        throw new Error('No media file found in VAST');
      }
      
      this._createVideoPlayer(vastData);
      this.logger?.log('VAST ad rendered');
    } catch (err) {
      this.logger?.error(`VAST render error: ${err.message}`);
      this.renderFallback();
      throw err;
    }
  }
  
  _createVideoPlayer(vastData) {
    const wrapper = document.createElement('div');
    Object.assign(wrapper.style, {
      position: 'relative',
      width: '100%',
      height: '100%',
      overflow: 'hidden',
      backgroundColor: '#000'
    });
    
    // Video element
    const video = document.createElement('video');
    video.src = vastData.mediaFile;
    video.autoplay = true;
    video.controls = false;
    video.playsInline = true;
    video.muted = true;
    Object.assign(video.style, {
      width: '100%',
      height: '100%',
      objectFit: 'contain'
    });
    
    this.videoElement = video;
    
    // Click handler
    if (vastData.clickThrough) {
      video.style.cursor = 'pointer';
      video.addEventListener('click', () => {
        window.open(vastData.clickThrough, '_blank');
        this.tracker.track(EVENT_TYPE.CLICK);
        vastData.clickTracking?.forEach(url => this.tracker.trackPixel(url));
      });
    }
    
    // Mute button
    const muteBtn = this._createMuteButton(video);
    
    // Skip button
    const skipBtn = vastData.skipOffset !== null
      ? this._createSkipButton(video, vastData.skipOffset, wrapper)
      : null;
    
    // Tracking
    this._setupVideoTracking(video, vastData);
    
    wrapper.appendChild(video);
    wrapper.appendChild(muteBtn);
    if (skipBtn) wrapper.appendChild(skipBtn);
    
    this.container.appendChild(wrapper);
  }
  
  _createMuteButton(video) {
    const btn = document.createElement('button');
    btn.innerHTML = '🔇';
    Object.assign(btn.style, {
      position: 'absolute',
      bottom: '20px',
      left: '20px',
      width: '40px',
      height: '40px',
      border: 'none',
      borderRadius: '50%',
      background: 'rgba(0,0,0,0.6)',
      color: '#fff',
      fontSize: '18px',
      cursor: 'pointer',
      transition: 'all 0.2s',
      zIndex: '10'
    });
    
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      video.muted = !video.muted;
      btn.innerHTML = video.muted ? '🔇' : '🔊';
      this.tracker.track(video.muted ? EVENT_TYPE.VOLUME_MUTED : EVENT_TYPE.VOLUME_ON);
    });
    
    return btn;
  }
  
  _createSkipButton(video, skipOffset, wrapper) {
    const btn = document.createElement('button');
    Object.assign(btn.style, {
      position: 'absolute',
      bottom: '20px',
      right: '20px',
      background: 'rgba(0,0,0,0.7)',
      color: '#fff',
      fontSize: '14px',
      padding: '8px 16px',
      border: 'none',
      borderRadius: '4px',
      cursor: 'default',
      transition: 'opacity 0.3s',
      zIndex: '10'
    });
    
    let remaining = Math.max(0, skipOffset);
    btn.textContent = `Skip in ${remaining}s`;
    
    const interval = setInterval(() => {
      remaining -= 1;
      
      if (remaining > 0) {
        btn.textContent = `Skip in ${remaining}s`;
      } else {
        clearInterval(interval);
        btn.textContent = 'Skip Ad ▶';
        btn.style.cursor = 'pointer';
        
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.tracker.track(EVENT_TYPE.SKIPPED);
          this._fadeOut(wrapper);
        });
      }
    }, 1000);
    
    return btn;
  }
  
  _setupVideoTracking(video, vastData) {
    // Impression tracking
    vastData.impressions?.forEach(url => this.tracker.trackPixel(url));
    this.tracker.track(EVENT_TYPE.IMPRESSION);
    
    // Start tracking
    video.addEventListener('play', () => {
      this.tracker.trackOnce(EVENT_TYPE.START);
      vastData.trackingEvents?.start?.forEach(url => this.tracker.trackPixel(url));
    });
    
    // Quartile tracking
    video.addEventListener('timeupdate', () => {
      if (!video.duration) return;
      
      const progress = (video.currentTime / video.duration) * 100;
      
      if (progress >= 25 && !this.quartileTracked[25]) {
        this.quartileTracked[25] = true;
        this.tracker.track(EVENT_TYPE.QUARTILE_25);
        vastData.trackingEvents?.firstQuartile?.forEach(url => this.tracker.trackPixel(url));
      }
      
      if (progress >= 50 && !this.quartileTracked[50]) {
        this.quartileTracked[50] = true;
        this.tracker.track(EVENT_TYPE.QUARTILE_50);
        vastData.trackingEvents?.midpoint?.forEach(url => this.tracker.trackPixel(url));
      }
      
      if (progress >= 75 && !this.quartileTracked[75]) {
        this.quartileTracked[75] = true;
        this.tracker.track(EVENT_TYPE.QUARTILE_75);
        vastData.trackingEvents?.thirdQuartile?.forEach(url => this.tracker.trackPixel(url));
      }
    });
    
    // Complete tracking
    video.addEventListener('ended', () => {
      this.quartileTracked[100] = true;
      this.tracker.track(EVENT_TYPE.COMPLETE);
      vastData.trackingEvents?.complete?.forEach(url => this.tracker.trackPixel(url));
      
      if (this.config.type === TYPE.WELCOME) {
        this._fadeOut(this.container.firstChild);
      }
    });
    
    // Error tracking
    video.addEventListener('error', () => {
      this.tracker.track(EVENT_TYPE.ERROR, {error: 'video_load_failed'});
      vastData.trackingEvents?.error?.forEach(url => this.tracker.trackPixel(url));
    });
  }
  
  _fadeOut(element, callback) {
    element.style.transition = `opacity ${CONSTANTS.TIMEOUTS.FADE_OUT}ms ease`;
    element.style.opacity = '0';
    
    setTimeout(() => {
      if (element.parentNode) {
        element.parentNode.removeChild(element);
      }
      callback?.();
    }, CONSTANTS.TIMEOUTS.FADE_OUT);
  }
  
  _sanitizeHTML(html) {
    // Basic XSS prevention - in production, use DOMPurify
    const div = document.createElement('div');
    div.textContent = html;
    return div.innerHTML;
  }
  
  renderFallback() {
    this.container.innerHTML = `
      <div style="
        display: flex;
        align-items: center;
        justify-content: center;
        background: #eee;
        width: 100%;
        height: 100%;
        color: #999;
        font-family: Arial, sans-serif;
      ">
        Ad unavailable
      </div>
    `;
    this.logger?.log('Fallback ad rendered');
  }
  
  destroy() {
    if (this.videoElement) {
      this.videoElement.pause();
      this.videoElement.src = '';
      this.videoElement = null;
    }
    
    this.quartileTracked = {25: false, 50: false, 75: false, 100: false};
  }
}

// ============================================================================
// MAIN SDK
// ============================================================================

export default class AdSDK {
  constructor(userConfig = {}) {
    // Merge config
    this.config = ConfigManager.merge(userConfig);
    
    // Validate config
    const errors = ConfigManager.validate(this.config);
    if (errors.length > 0) {
      throw new Error(`Configuration errors: ${errors.join(', ')}`);
    }
    
    // Initialize components
    this.logger = new Logger(this.config.debug);
    this.events = new EventEmitter(this.logger);
    this.http = new HttpClient(this.config, this.logger);
    this.tracker = new Tracker(this.config, this.logger);
    
    // Generate signature
    const {sign, deviceId} = SignatureGenerator.generate(
      this.config.positionId,
      this.config.tenantId,
      this.config.secretKey,
      this.logger
    );
    this.signature = sign;
    this.deviceId = deviceId;
    
    // Build fetch URL
    this.fetchUrl = this._buildFetchUrl();
    
    // State
    this._started = false;
    this._locked = false;
    this.domEl = null;
    this.container = null;
    this.renderer = null;
    this._messageListener = null;
    this._adData = null;
    
    // Initialize PostMessage if enabled
    if (this.config.postMessage) {
      this._initPostMessage();
    }
    
    this.logger.log('SDK initialized successfully');
  }
  
  // ---- Public API ----
  
  async start(domId) {
    // Prevent concurrent starts
    if (this._locked) {
      throw new Error('SDK is locked. Wait for current operation to complete.');
    }
    
    this._locked = true;
    
    try {
      // Handle WELCOME type
      if (this.config.type === TYPE.WELCOME) {
        this.domEl = this._createWelcomeOverlay();
      } else {
        if (!domId) {
          throw new Error('domId is required for non-WELCOME ads');
        }
        
        this.domEl = document.getElementById(domId);
        if (!this.domEl) {
          throw new Error(`Element #${domId} not found`);
        }
        
        this.domEl.innerHTML = '';
      }
      
      // Destroy previous instance if exists
      if (this._started) {
        await this.destroy();
      }
      
      // Create container
      this.container = this._createContainer();
      this.domEl.appendChild(this.container);
      
      // Create renderer
      this.renderer = new AdRenderer(
        this.container,
        this.config,
        this.logger,
        this.tracker
      );
      
      this._started = true;
      this.events.emit('start');
      this.logger.log(`SDK started (${this.config.type})`);
      
      // Fetch and render ad
      try {
        const adData = await this._fetchAd();
        this._adData = adData;
        
        this.tracker.track(EVENT_TYPE.IMPRESSION);
        await this.renderer.render(adData);
        
        this.events.emit('loaded', adData);
      } catch (err) {
        this.logger.error(`Ad fetch error: ${err.message}`);
        this.renderer.renderFallback();
        this.events.emit('error', err);
      }
    } finally {
      this._locked = false;
    }
  }
  
  async destroy() {
    if (!this._started) return;
    
    this._started = false;
    
    // Clean up renderer
    if (this.renderer) {
      this.renderer.destroy();
      this.renderer = null;
    }
    
    // Remove DOM elements
    if (this.container?.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
    
    if (this._welcomeOverlay?.parentNode) {
      this._welcomeOverlay.parentNode.removeChild(this._welcomeOverlay);
      this._welcomeOverlay = null;
    }
    
    // this.domEl = null;
    this.container = null;
    this._adData = null;
    
    // Reset tracker
    this.tracker.reset();
    
    this.events.emit('destroy');
    this.logger.log('SDK destroyed');
  }
  
  on(event, handler) {
    this.events.on(event, handler);
  }
  
  off(event, handler) {
    this.events.off(event, handler);
  }
  
  getAdData() {
    return this._adData;
  }
  
  getConfig() {
    return {...this.config};
  }
  
  isStarted() {
    return this._started;
  }
  
  // ---- Private Methods ----
  
  _buildFetchUrl() {
    const params = {
      t: this.config.tenantId,
      sid: this.config.streamId,
      cid: this.config.channelId,
      pid: this.config.positionId,
      p: this.config.platform,
      dt: this.config.deviceType,
      d: this.deviceId,
      si: this.signature,
      as: this.config.adSize,
      bt: this.config.bannerType,
      ai: this.config.adId,
      ct: this.config.contentType,
      tt: this.config.title,
      ti: this.config.transId,
      ctg: this.config.category,
      kw: this.config.keyword,
      a: this.config.age,
      gd: this.config.gender,
      sm: this.config.segments
    };
    
    return this.http.buildUrl(this.config.fetchUrl, params);
  }
  
  async _fetchAd() {
    const params = {
      position: this.config.position
    };
    
    const url = this.http.buildUrl(this.fetchUrl, params);
    
    this.tracker.track(EVENT_TYPE.REQUEST);
    
    return await this.http.fetch(url);
  }
  
  _createContainer() {
    const container = document.createElement('div');
    container.className = 'ad-sdk-wrapper';
    
    Object.assign(container.style, {
      width: this.config.width ? `${this.config.width}px` : '100%',
      height: this.config.height ? `${this.config.height}px` : '100%',
      position: 'relative',
      overflow: 'hidden'
    });
    
    return container;
  }
  
  _createWelcomeOverlay() {
    const overlay = document.createElement('div');
    overlay.className = 'ad-sdk-welcome-overlay';
    
    Object.assign(overlay.style, {
      position: 'fixed',
      inset: '0',
      zIndex: '999999',
      background: 'rgba(0,0,0,0.85)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '100vw',
      height: '100vh',
      opacity: '0',
      transition: 'opacity 0.4s ease'
    });
    
    // Create close button
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '✕';
    closeBtn.setAttribute('aria-label', 'Close advertisement');
    
    Object.assign(closeBtn.style, {
      position: 'absolute',
      top: '20px',
      right: '20px',
      width: '36px',
      height: '36px',
      border: 'none',
      borderRadius: '50%',
      background: 'rgba(255,255,255,0.15)',
      color: '#fff',
      fontSize: '20px',
      cursor: 'pointer',
      transition: 'all 0.2s',
      zIndex: '1'
    });
    
    closeBtn.addEventListener('mouseenter', () => {
      closeBtn.style.background = 'rgba(255,255,255,0.3)';
      closeBtn.style.transform = 'scale(1.1)';
    });
    
    closeBtn.addEventListener('mouseleave', () => {
      closeBtn.style.background = 'rgba(255,255,255,0.15)';
      closeBtn.style.transform = 'scale(1)';
    });
    
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.events.emit('close');
      this.destroy();
    });
    
    overlay.appendChild(closeBtn);
    document.body.appendChild(overlay);
    
    // Fade in
    requestAnimationFrame(() => {
      overlay.style.opacity = '1';
    });
    
    this._welcomeOverlay = overlay;
    return overlay;
  }
  
  _initPostMessage() {
    this._messageListener = (event) => {
      const data = event.data;
      
      if (!data || data.channel !== this.config.postMessageChannel) {
        return;
      }
      
      // Validate origin if not wildcard
      if (this.config.targetOrigin !== '*' && event.origin !== this.config.targetOrigin) {
        this.logger.warn(`Rejected message from unauthorized origin: ${event.origin}`);
        return;
      }
      
      this._handlePostMessage(data);
    };
    
    window.addEventListener('message', this._messageListener);
    this.logger.log('PostMessage channel initialized');
  }
  
  _handlePostMessage(data) {
    switch (data.type) {
      case 'start':
        this.start(data.domId).catch(err => {
          this.logger.error(`PostMessage start error: ${err.message}`);
        });
        break;
      
      case 'destroy':
        this.destroy().catch(err => {
          this.logger.error(`PostMessage destroy error: ${err.message}`);
        });
        break;
      
      case 'render':
        if (this.renderer) {
          this.renderer.render(data.payload);
        }
        break;
      
      default:
        this.logger.warn(`Unknown PostMessage type: ${data.type}`);
    }
  }
  
  _removePostMessage() {
    if (this._messageListener) {
      window.removeEventListener('message', this._messageListener);
      this._messageListener = null;
      this.logger.log('PostMessage channel removed');
    }
  }
  
  // ---- Static Methods ----
  
  static clearDeviceId() {
    DeviceIdManager.clear();
  }
  
  static getDeviceId() {
    return DeviceIdManager.get();
  }
  
  // ---- Constants ----
  static ENV = ENV;
  static TYPE = TYPE;
  static EVENT_TYPE = EVENT_TYPE;
  static PLATFORM = PLATFORM;
  static CONTENT_TYPE = CONTENT_TYPE;
  static GENDER = GENDER;
  static AD_SIZE = AD_SIZE;
  static BANNER_TYPE = BANNER_TYPE;
}

// ============================================================================
// AUTO-INIT
// ============================================================================

if (typeof window !== 'undefined') {
  // Expose SDK globally
  window.AdSDK = AdSDK;
  
  // Auto-init if config provided
  if (window.SDK_INIT && typeof window.SDK_INIT === 'object') {
    try {
      window.sdk = new AdSDK(window.SDK_INIT);
      
      if (window.SDK_INIT.domId) {
        window.sdk.start(window.SDK_INIT.domId).catch(err => {
          console.error('[AdSDK] Auto-init failed:', err);
        });
      }
    } catch (err) {
      console.error('[AdSDK] Auto-init error:', err);
    }
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  ENV,
  TYPE,
  EVENT_TYPE,
  PLATFORM,
  CONTENT_TYPE,
  GENDER,
  AD_SIZE,
  BANNER_TYPE,
  Logger,
  DeviceIdManager,
  SignatureGenerator,
  ConfigManager,
  EventEmitter,
  HttpClient,
  Tracker,
  VASTParser,
  AdRenderer
};