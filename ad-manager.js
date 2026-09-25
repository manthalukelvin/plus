/**
 * 🎯 IMPROVED Ad Manager - Handles all ad types with individual IDs
 * Controls Native Banner, Smartlink, Popunder, Social, and Multiple Banners
 * Premium users (isPremium: true) have ALL ads turned OFF
 * Free users (isPremium: false) see all ads
 */

class AdManager {
  constructor(config = {}) {
    this.config = {
      apiKey: "AIzaSyAtzbIZvFLQM65QhOwph0PFpO9vOYcYUdE",
      authDomain: "myjournal-plus.firebaseapp.com",
      projectId: "myjournal-plus",
      storageBucket: "myjournal-plus.firebasestorage.app",
      messagingSenderId: "288260274583",
      appId: "1:288260274583:web:9c40aafed9ab9fa30e6cd2",
      measurementId: "G-MXJ84MJGTR",
      ...config
    };

    this.userPremiumStatus = false;
    this.isInitialized = false;
    
    // All ad configurations
    this.ads = {
      nativeBanner: {
        id: "ad-native-banner",
        type: "native",
        script: "https://pl29175187.effectivecpmnetwork.com/f0eb972dd823895d4d33d2f0a17fe88e/invoke.js",
        enabled: true,
        loaded: false
      },
      smartlink: {
        id: "ad-smartlink",
        type: "smartlink",
        url: "https://www.effectivecpmnetwork.com/nthhce0sja?key=e7fa539d92f46575058662a9a5d5d6d3",
        enabled: true,
        loaded: false
      },
      popunder: {
        id: "ad-popunder",
        type: "popunder",
        script: "https://pl29175186.effectivecpmnetwork.com/d4/1f/98/d41f9812a1b0e3b8bb04c8bfc802ee7c.js",
        enabled: true,
        loaded: false,
        loadOnInteraction: true // Load only after user interaction
      },
      social: {
        id: "ad-social",
        type: "social",
        script: "https://pl29175184.effectivecpmnetwork.com/a6/14/1e/a6141eb3dffeaecc45fd7a33a6e07717.js",
        enabled: true,
        loaded: false
      },
      banner728x90: {
        id: "ad-banner-728x90",
        type: "banner",
        dimensions: { width: 728, height: 90 },
        key: "4aa793c07b9057d59c7b518ae184bfae",
        script: "https://www.highperformanceformat.com/4aa793c07b9057d59c7b518ae184bfae/invoke.js",
        enabled: true,
        loaded: false
      },
      banner320x50: {
        id: "ad-banner-320x50",
        type: "banner",
        dimensions: { width: 320, height: 50 },
        key: "14d4519185fc4a4d24be977bbb3eca6c",
        script: "https://www.highperformanceformat.com/14d4519185fc4a4d24be977bbb3eca6c/invoke.js",
        enabled: true,
        loaded: false
      }
    };

    // Track loaded ad scripts to prevent duplicates
    this.loadedScripts = new Set();
  }

  /**
   * Initialize the Ad Manager
   */
  async init() {
    try {
      // Validate that containers exist
      let validContainers = 0;
      for (const [key, ad] of Object.entries(this.ads)) {
        const container = document.getElementById(ad.id);
        if (container) {
          validContainers++;
          console.log(`✓ Found ad container: ${ad.id}`);
        } else {
          console.warn(`⚠️  Ad container not found: ${ad.id} (It's optional)`);
        }
      }

      if (validContainers === 0) {
        console.warn("⚠️  No ad containers found in page. Make sure containers exist before initialization.");
      }

      this.isInitialized = true;
      console.log("✅ Ad Manager initialized successfully");
      return true;
    } catch (error) {
      console.error("❌ Ad Manager initialization failed:", error);
      return false;
    }
  }

  /**
   * Set user premium status and update all ads accordingly
   * @param {boolean} isPremium - User premium status
   */
  setUserPremiumStatus(isPremium) {
    this.userPremiumStatus = isPremium;
    console.log(`🎯 User premium status: ${isPremium ? "✅ PREMIUM (Ads Hidden)" : "❌ FREE (Ads Shown)"}`);
    
    // Update display for all ads
    this.updateAllAdsDisplay();
  }

  /**
   * Get current premium status
   * @returns {boolean} User premium status
   */
  getPremiumStatus() {
    return this.userPremiumStatus;
  }

  /**
   * Update display for all ads based on premium status
   */
  updateAllAdsDisplay() {
    if (!this.isInitialized) {
      console.warn("⚠️  Ad Manager not initialized");
      return;
    }

    for (const [key, ad] of Object.entries(this.ads)) {
      this.updateAdDisplay(key);
    }
  }

  /**
   * Update display for a specific ad
   * @param {string} adKey - Ad key from this.ads
   */
  updateAdDisplay(adKey) {
    const ad = this.ads[adKey];
    if (!ad) {
      console.warn(`⚠️  Ad not found: ${adKey}`);
      return;
    }

    const container = document.getElementById(ad.id);
    if (!container) return;

    if (this.userPremiumStatus) {
      // Premium user - hide ad
      this.hideAd(adKey);
    } else {
      // Free user - show ad
      this.showAd(adKey);
    }
  }

  /**
   * Show a specific ad
   * @param {string} adKey - Ad key from this.ads
   */
  showAd(adKey) {
    const ad = this.ads[adKey];
    if (!ad) return;

    const container = document.getElementById(ad.id);
    if (!container) return;

    container.style.display = "block";
    container.style.visibility = "visible";
    container.style.opacity = "1";
    
    console.log(`📺 ${adKey} ad is now visible`);
  }

  /**
   * Hide a specific ad
   * @param {string} adKey - Ad key from this.ads
   */
  hideAd(adKey) {
    const ad = this.ads[adKey];
    if (!ad) return;

    const container = document.getElementById(ad.id);
    if (!container) return;

    container.style.display = "none";
    container.style.visibility = "hidden";
    container.style.opacity = "0";
    
    console.log(`🚫 ${adKey} ad is now hidden`);
  }

  /**
   * Load a specific ad script
   * @param {string} adKey - Ad key from this.ads
   */
  loadAdScript(adKey) {
    const ad = this.ads[adKey];
    if (!ad) {
      console.warn(`⚠️  Ad not found: ${adKey}`);
      return false;
    }

    // Skip if user is premium
    if (this.userPremiumStatus) {
      console.log(`⏭️  Skipping ${adKey} (Premium user)`);
      return false;
    }

    // Skip if already loaded
    if (ad.loaded || this.loadedScripts.has(ad.script)) {
      console.log(`⏭️  ${adKey} already loaded`);
      return false;
    }

    // Verify container exists
    const container = document.getElementById(ad.id);
    if (!container) {
      console.warn(`⚠️  Container not found for ${adKey}`);
      return false;
    }

    try {
      if (ad.type === "smartlink") {
        // Smartlink is just a URL, no script needed
        this.loadSmartlinkAd(adKey);
      } else if (ad.type === "popunder" && ad.loadOnInteraction) {
        // Popunder loads on user interaction
        this.setupPopunderOnInteraction(adKey);
      } else {
        // Load script dynamically
        this.injectScript(ad.script, adKey);
      }

      ad.loaded = true;
      this.loadedScripts.add(ad.script);
      return true;
    } catch (error) {
      console.error(`❌ Error loading ${adKey}:`, error);
      return false;
    }
  }

  /**
   * Load all ads
   */
  loadAllAds() {
    if (this.userPremiumStatus) {
      console.log("✅ Skipping all ads (Premium user)");
      return;
    }

    console.log("🚀 Loading all ads for free user...");
    for (const adKey of Object.keys(this.ads)) {
      this.loadAdScript(adKey);
    }
  }

  /**
   * Inject script tag dynamically
   * @param {string} scriptUrl - Script URL
   * @param {string} adKey - Ad key for logging
   */
  injectScript(scriptUrl, adKey) {
    const script = document.createElement("script");
    script.src = scriptUrl;
    script.async = true;
    script.type = "text/javascript";

    script.onload = () => {
      console.log(`✅ ${adKey} script loaded successfully`);
    };

    script.onerror = () => {
      console.error(`❌ Failed to load ${adKey} script`);
    };

    document.head.appendChild(script);
  }

  /**
   * Setup banner ad configuration
   * @param {string} adKey - Ad key from this.ads
   */
  setupBannerAd(adKey) {
    const ad = this.ads[adKey];
    if (!ad || ad.type !== "banner") return;

    window.atOptions = {
      key: ad.key,
      format: "iframe",
      height: ad.dimensions.height,
      width: ad.dimensions.width,
      params: {}
    };

    this.injectScript(ad.script, adKey);
  }

  /**
   * Setup smartlink ad
   * @param {string} adKey - Ad key
   */
  loadSmartlinkAd(adKey) {
    const ad = this.ads[adKey];
    if (!ad || ad.type !== "smartlink") return;

    const container = document.getElementById(ad.id);
    if (!container) return;

    const link = document.createElement("a");
    link.href = ad.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.style.display = "inline-block";
    link.style.padding = "15px 30px";
    link.style.backgroundColor = "#FF6B6B";
    link.style.color = "white";
    link.style.textDecoration = "none";
    link.style.borderRadius = "5px";
    link.style.fontWeight = "bold";
    link.style.cursor = "pointer";
    link.style.fontSize = "16px";
    link.textContent = "🎁 View Special Offer";

    link.onmouseover = () => {
      link.style.backgroundColor = "#E85555";
    };
    link.onmouseout = () => {
      link.style.backgroundColor = "#FF6B6B";
    };

    container.innerHTML = "";
    container.appendChild(link);
    console.log(`✅ ${adKey} ad loaded`);
  }

  /**
   * Setup popunder to load on user interaction
   * @param {string} adKey - Ad key
   */
  setupPopunderOnInteraction(adKey) {
    const ad = this.ads[adKey];
    if (!ad) return;

    const loadPopunder = () => {
      if (!ad.loaded) {
        this.injectScript(ad.script, adKey);
        ad.loaded = true;
      }
      // Remove listeners after first interaction
      document.removeEventListener("click", loadPopunder);
      document.removeEventListener("scroll", loadPopunder);
      document.removeEventListener("mousemove", loadPopunder);
    };

    document.addEventListener("click", loadPopunder);
    document.addEventListener("scroll", loadPopunder);
    document.addEventListener("mousemove", loadPopunder);

    console.log(`✅ ${adKey} ready to load on user interaction`);
  }

  /**
   * Enable specific ad
   * @param {string} adKey - Ad key
   */
  enableAd(adKey) {
    const ad = this.ads[adKey];
    if (!ad) return;
    
    ad.enabled = true;
    console.log(`✓ ${adKey} enabled`);
    this.updateAdDisplay(adKey);
  }

  /**
   * Disable specific ad
   * @param {string} adKey - Ad key
   */
  disableAd(adKey) {
    const ad = this.ads[adKey];
    if (!ad) return;
    
    ad.enabled = false;
    this.hideAd(adKey);
    console.log(`✓ ${adKey} disabled`);
  }

  /**
   * Get all ad statuses
   * @returns {object} Status of all ads
   */
  getAdStatuses() {
    const statuses = {};
    for (const [key, ad] of Object.entries(this.ads)) {
      const container = document.getElementById(ad.id);
      statuses[key] = {
        id: ad.id,
        type: ad.type,
        enabled: ad.enabled,
        loaded: ad.loaded,
        containerExists: !!container,
        visible: container ? container.style.display !== "none" : false
      };
    }
    return statuses;
  }

  /**
   * Log all ad statuses to console
   */
  logAdStatuses() {
    console.table(this.getAdStatuses());
  }

  /**
   * Clear all ads from containers
   */
  clearAllAds() {
    for (const [key, ad] of Object.entries(this.ads)) {
      const container = document.getElementById(ad.id);
      if (container) {
        container.innerHTML = "";
      }
    }
    console.log("🗑️  All ad containers cleared");
  }

  /**
   * Get configuration
   * @returns {object} Current configuration
   */
  getConfig() {
    return { ...this.config };
  }

  /**
   * Update configuration
   * @param {object} newConfig - New config values
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    console.log("✓ Configuration updated");
  }

  /**
   * Destroy ad manager instance
   */
  destroy() {
    this.clearAllAds();
    this.isInitialized = false;
    this.loadedScripts.clear();
    console.log("✓ Ad Manager destroyed");
  }

  /**
   * Get all ads info
   * @returns {object} All ads configuration
   */
  getAdsInfo() {
    return this.ads;
  }

  /**
   * Watch user status for real-time updates
   * @param {function} userStatusCallback - Callback function returning user data
   * @param {number} interval - Check interval in milliseconds (default: 5000)
   * @returns {number} Interval ID for cleanup
   */
  watchUserStatus(userStatusCallback, interval = 5000) {
    if (typeof userStatusCallback !== "function") {
      console.error("❌ userStatusCallback must be a function");
      return null;
    }

    const statusCheck = setInterval(async () => {
      try {
        const userData = await userStatusCallback();
        if (userData && typeof userData.isPremium === "boolean") {
          this.setUserPremiumStatus(userData.isPremium);
        }
      } catch (error) {
        console.error("Error checking user status:", error);
      }
    }, interval);

    console.log(`✓ Watching user status (check every ${interval}ms)`);
    return statusCheck;
  }

  /**
   * Stop watching user status
   * @param {number} intervalId - Interval ID from watchUserStatus
   */
  stopWatchingUserStatus(intervalId) {
    if (intervalId) {
      clearInterval(intervalId);
      console.log("✓ Stopped watching user status");
    }
  }
}

// Export for different module systems
if (typeof module !== "undefined" && module.exports) {
  module.exports = AdManager;
}
