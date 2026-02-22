"use strict";

// electron-src/deepseek_login_preload.ts
var platformLabel = process.platform === "darwin" ? "macOS" : process.platform === "win32" ? "Windows" : "Linux";
var navigatorPlatform = process.platform === "darwin" ? "MacIntel" : process.platform === "win32" ? "Win32" : "Linux x86_64";
var languageList = ["zh-CN", "zh", "en-US", "en"];
var stealthPatchSource = `(() => {
  const defineGetter = (target, key, value) => {
    try {
      Object.defineProperty(target, key, {
        configurable: true,
        enumerable: true,
        get: () => value
      });
    } catch (_error) {}
  };

  const patchNavigator = () => {
    const proto = Navigator.prototype || navigator;
    defineGetter(proto, 'webdriver', undefined);
    defineGetter(proto, 'platform', ${JSON.stringify(navigatorPlatform)});
    defineGetter(proto, 'language', ${JSON.stringify(languageList[0])});
    defineGetter(proto, 'languages', ${JSON.stringify(languageList)});
    defineGetter(proto, 'hardwareConcurrency', 8);
    defineGetter(proto, 'deviceMemory', 8);

    const fakePlugins = [
      { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
      { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
      { name: 'Native Client', filename: 'internal-nacl-plugin', description: '' }
    ];
    defineGetter(proto, 'plugins', fakePlugins);
    defineGetter(proto, 'mimeTypes', [{ type: 'application/pdf', suffixes: 'pdf', description: '' }]);

    defineGetter(proto, 'userAgentData', {
      brands: [
        { brand: 'Not A(Brand', version: '99' },
        { brand: 'Google Chrome', version: '124' },
        { brand: 'Chromium', version: '124' }
      ],
      mobile: false,
      platform: ${JSON.stringify(platformLabel)},
      getHighEntropyValues: async (hints = []) => {
        const result = {};
        for (const hint of hints) {
          if (hint === 'platform') result.platform = ${JSON.stringify(platformLabel)};
          if (hint === 'platformVersion') result.platformVersion = '15.0.0';
          if (hint === 'architecture') result.architecture = 'x86';
          if (hint === 'model') result.model = '';
          if (hint === 'uaFullVersion') result.uaFullVersion = '124.0.0.0';
          if (hint === 'fullVersionList') {
            result.fullVersionList = [
              { brand: 'Not A(Brand', version: '99.0.0.0' },
              { brand: 'Google Chrome', version: '124.0.0.0' },
              { brand: 'Chromium', version: '124.0.0.0' }
            ];
          }
        }
        return result;
      }
    });
  };

  const patchWindow = () => {
    if (!window.chrome) {
      Object.defineProperty(window, 'chrome', {
        configurable: true,
        enumerable: true,
        value: { runtime: {} }
      });
    }
  };

  patchNavigator();
  patchWindow();
})();`;
function injectStealthPatch() {
  try {
    const parent = document.head || document.documentElement;
    if (!parent) return false;
    const script = document.createElement("script");
    script.type = "text/javascript";
    script.textContent = stealthPatchSource;
    parent.appendChild(script);
    script.remove();
    return true;
  } catch (_error) {
    return false;
  }
}
if (!injectStealthPatch()) {
  window.addEventListener(
    "DOMContentLoaded",
    () => {
      injectStealthPatch();
    },
    { once: true }
  );
}
