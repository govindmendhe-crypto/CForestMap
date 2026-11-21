/**
 * Copyright 2018 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// If the loader is already loaded, just stop.
if (!self.define) {
  let registry = {};

  // Used for `eval` and `importScripts` where we can't get script URL by other means.
  // In both cases, it's safe to use a global var because those functions are synchronous.
  let nextDefineUri;

  const singleRequire = (uri, parentUri) => {
    uri = new URL(uri + ".js", parentUri).href;
    return registry[uri] || (
      
        new Promise(resolve => {
          if ("document" in self) {
            const script = document.createElement("script");
            script.src = uri;
            script.onload = resolve;
            document.head.appendChild(script);
          } else {
            nextDefineUri = uri;
            importScripts(uri);
            resolve();
          }
        })
      
      .then(() => {
        let promise = registry[uri];
        if (!promise) {
          throw new Error(`Module ${uri} didn’t register its module`);
        }
        return promise;
      })
    );
  };

  self.define = (depsNames, factory) => {
    const uri = nextDefineUri || ("document" in self ? document.currentScript.src : "") || location.href;
    if (registry[uri]) {
      // Module is already loading or loaded.
      return;
    }
    let exports = {};
    const require = depUri => singleRequire(depUri, uri);
    const specialDeps = {
      module: { uri },
      exports,
      require
    };
    registry[uri] = Promise.all(depsNames.map(
      depName => specialDeps[depName] || require(depName)
    )).then(deps => {
      factory(...deps);
      return exports;
    });
  };
}
define(['./workbox-afac4cd2'], (function (workbox) { 'use strict';

  importScripts("/sw-share-target.js");
  self.skipWaiting();
  workbox.clientsClaim();
  /**
   * The precacheAndRoute() method efficiently caches and responds to
   * requests for URLs in the manifest.
   * See https://goo.gl/S9QRab
   */
  workbox.precacheAndRoute([{
    "url": "sw-share-target.js",
    "revision": "4c981597b6a41cb276570dc851bb9ab3"
  }, {
    "url": "pwa-maskable-512x512.png",
    "revision": "a1200ade803ece3da11e8c472828eddd"
  }, {
    "url": "pwa-512x512.png",
    "revision": "164caa744edddb63da8647c43219144f"
  }, {
    "url": "pwa-192x192.png",
    "revision": "7f650dae970e7e17b3ec4d88d4fab3f8"
  }, {
    "url": "privacy-policy.html",
    "revision": "6fbfd589234ff82fc9e4ba2c6ccca292"
  }, {
    "url": "index.html",
    "revision": "baa9196931dd9f10cbcdcba5d17eff74"
  }, {
    "url": "icon.svg",
    "revision": "31637722de4f55a878680f00c6700e58"
  }, {
    "url": "favicon.ico",
    "revision": "9f346d2998b32f09845236f45ac0e9d9"
  }, {
    "url": "apple-touch-icon.png",
    "revision": "d4e237e8a57601a07914a43e77164231"
  }, {
    "url": "assets/workbox-window.prod.es5-Bd17z0YL.js",
    "revision": null
  }, {
    "url": "assets/web-DZaeuEUZ.js",
    "revision": null
  }, {
    "url": "assets/web-CUqYYqcx.js",
    "revision": null
  }, {
    "url": "assets/web-BfwG_gZa.js",
    "revision": null
  }, {
    "url": "assets/purify.es-Dqk5qvad.js",
    "revision": null
  }, {
    "url": "assets/index.es-CPbc5zmb.js",
    "revision": null
  }, {
    "url": "assets/index-DjRtAxf1.js",
    "revision": null
  }, {
    "url": "assets/index-659RQh0X.css",
    "revision": null
  }, {
    "url": "assets/aistudio/deepseek_html_20261029_c727c3_8ea5467a.html",
    "revision": null
  }, {
    "url": "apple-touch-icon.png",
    "revision": "d4e237e8a57601a07914a43e77164231"
  }, {
    "url": "favicon.ico",
    "revision": "9f346d2998b32f09845236f45ac0e9d9"
  }, {
    "url": "icon.svg",
    "revision": "31637722de4f55a878680f00c6700e58"
  }, {
    "url": "privacy-policy.html",
    "revision": "6fbfd589234ff82fc9e4ba2c6ccca292"
  }, {
    "url": "pwa-192x192.png",
    "revision": "7f650dae970e7e17b3ec4d88d4fab3f8"
  }, {
    "url": "pwa-512x512.png",
    "revision": "164caa744edddb63da8647c43219144f"
  }, {
    "url": "pwa-maskable-512x512.png",
    "revision": "a1200ade803ece3da11e8c472828eddd"
  }, {
    "url": "sw-share-target.js",
    "revision": "4c981597b6a41cb276570dc851bb9ab3"
  }, {
    "url": "manifest.webmanifest",
    "revision": "db26077facb33ab8ee34b315b2e959b8"
  }], {});
  workbox.cleanupOutdatedCaches();
  workbox.registerRoute(new workbox.NavigationRoute(workbox.createHandlerBoundToURL("/index.html"), {
    denylist: [/^\/\.well-known\//, /^\/privacy-policy\.html$/]
  }));
  workbox.registerRoute(/^https:\/\/fonts\.googleapis\.com\/.*/i, new workbox.CacheFirst({
    "cacheName": "google-fonts-cache",
    plugins: [new workbox.ExpirationPlugin({
      maxEntries: 20,
      maxAgeSeconds: 31536000
    }), new workbox.CacheableResponsePlugin({
      statuses: [0, 200]
    })]
  }), 'GET');
  workbox.registerRoute(/^https:\/\/fonts\.gstatic\.com\/.*/i, new workbox.CacheFirst({
    "cacheName": "gstatic-fonts-cache",
    plugins: [new workbox.ExpirationPlugin({
      maxEntries: 60,
      maxAgeSeconds: 31536000
    }), new workbox.CacheableResponsePlugin({
      statuses: [0, 200]
    })]
  }), 'GET');

}));
