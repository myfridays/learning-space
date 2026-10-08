# 大肥鱼网页桌宠

来源：https://github.com/1190fasheqi/dafeiyu-pet

参考提交：`5b0e01856116bd2bae82df1f43c32faa5f056196`。

上游仓库声明 MIT 许可，原始声明完整保留在 `dafeiyu/LICENSE`。上游 README 将形象描述为 DeepSeek V4 Pro 的二创形象「鲸鱼娘·大肥鱼」；本项目沿用该来源说明，不将形象称为原创，也不将代码开源许可表述成对全部第三方形象权利的保证。

素材保持上游原样：

- `sprites/正面_306.png` → `dafeiyu/front.png`
- `sprites/侧面_306.png` → `dafeiyu/side.png`
- `sprites/背面_306.png` → `dafeiyu/back.png`

`public/js/pet.js` 参考上游 `桌宠.py` 的三视图朝向、左右镜像、散步休息、跟随鼠标距离、拖拽阈值、单双击区分等行为，改写为浏览器原生 JavaScript；使用 CSS 实现呼吸、走路、摸摸、喂食和跳跃。

默认原地陪伴，可切换自由散步和跟随鼠标。鼠标悬停、焦点处于桌宠控件、拖拽或互动时停止自动移动，方便操作。支持暂停、收起、位置和模式记忆、触屏拖拽、方向键移动、回车互动。减少动态效果时停止动画和自动移动。

旧模型、旧运行库和它们的声明文件已从当前工作树移除；历史 Git 提交未重写。Service Worker 缓存版本已更新，激活新版本时清理旧缓存。此版本无 Live2D/WebGL、CDN、AI API、API Key 或全局键盘监听；仅需三个同源 PNG，无新增依赖或构建步骤。

## 本地验证

启动 `npm run dev`，运行 `npm run test:all`。浏览器回归脚本：

```sh
npm install --prefix /tmp/learning-space-browser playwright-core --cache=/tmp/npm-cache
PLAYWRIGHT_MODULE=/tmp/learning-space-browser/node_modules/playwright-core/index.mjs node tools/test-pet-browser.mjs
```

浏览器脚本默认使用 `/usr/bin/chromium` 和 `http://127.0.0.1:8787`，可通过 `CHROMIUM_PATH`、`BASE_URL` 覆盖，不修改业务数据。
