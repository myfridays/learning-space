# Vendored Live2D browser runtime

Only the browser distribution files are shipped; no remote CDN is needed at runtime.

| File | Package / version | License |
| --- | --- | --- |
| pixi.min.js | pixi.js 6.5.10 | MIT, see PIXI-LICENSE |
| cubism4.min.js | pixi-live2d-display 0.4.0 | MIT, see DISPLAY-LICENSE; bundled Cubism Framework has separate terms in CUBISM-FRAMEWORK-LICENSE.md |
| live2dcubismcore.min.js | live2dcubismcore 1.0.2 (npm distribution) | Live2D proprietary redistributable code, as stated in the file header |

Files were obtained with npm from https://registry.npmjs.org using npm's package integrity verification. Core is redistributed via that npm package, not downloaded from the official SDK site. Its embedded Live2D notice takes precedence over the npm package's ISC metadata:

> Live2D Cubism Core (C) 2019 Live2D Inc. All rights reserved.
> This file is licensed pursuant to the license agreement below.
> This file corresponds to the "Redistributable Code" in the agreement.
> https://www.live2d.com/eula/live2d-proprietary-software-license-agreement_en.html

Upstream libraries: https://github.com/pixijs/pixijs and https://github.com/guansss/pixi-live2d-display . The latter's v0.4.0 tag pins guansss/CubismWebFramework at `1f9cdfd140e87ba0ae68a356bb5ec339a0e65f99`; its LICENSE.md is included here. All embedded copyright/license notices are retained. SHA256SUMS records the vendored runtime files.
