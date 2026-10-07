# 仇远网页桌宠

模型来自用户提供的 `仇远-无表情版.zip`，使用其中 `A-仇远/img/standard/cat_model` 的原始文件。模型、8192px 纹理、物理配置和作者说明均保持原样；素材画面署名为「哔哩哔哩 @宇痕/」。素材版权仍归原作者，此项目不另行授予素材使用权。

首次打开保留模型内的免费版说明。用户点击「开始陪伴」后，执行素材配置中 Alt+1 对应的 `Paramshuiying` 状态；持续显示作者署名，点击署名可以重新查看模型自带说明。

实现参考 https://github.com/vladelaina/BongoCat ，检查版本 `a832ec16b9e29d83affe8a85bd6b6ecd60b8cee7` 的 `src/core/app_state.c`、`src/core/input_state.c` 和 `src/live2d/cubism_model_update.cpp`：按键按下/释放控制动作、鼠标位置映射模型参数、失焦释放输入、按需更新。网页实现为独立 JavaScript，未复制或捆绑该项目的 AGPL 源码。

- `public/js/pet.js`：拖拽、触屏、位置记忆、键盘操作、互动、暂停和收起。
- `public/js/pet-renderer.js`：Live2D 加载、30fps 更新、页内键鼠映射、失焦释放、减少动态效果。
- 浏览器只能响应当前网页的输入，不监听其他软件。密码框不驱动按键动作；不读取、记录或发送输入内容。
- 素材含 12.7MB 的原始纹理，首次显示桌宠时才加载。GPU 上传前在内存中缩小至最多 2048px；磁盘素材不变。
- 收起或页面隐藏时停止渲染；减少动态效果模式保留静态模型和按键状态。加载失败有重试按钮，主应用照常使用。
- 所有运行库与模型资源均同源托管，无 CDN 请求、无新增构建步骤。现有 Workers 静态资源目录可直接发布。

## 本地验证

在仓库根目录运行 `npm run dev`，访问本地页面。首次点击「开始陪伴」，在非密码输入框输入 A/S/D 或其他按键，观察手部、键盘响应；移动鼠标观察头部、眼睛和鼠标手跟随。测试摸摸、击键、加油，拖拽和方向键移动，收起/召唤，暂停/继续，刷新后的记忆与手机边界。

运行 `npm run test:all` 验证原有前后端功能。浏览器回归脚本为 `tools/test-pet-browser.mjs`，需要可用的 Chromium 和 Playwright Core（可安装到仓库外）：

```sh
npm install --prefix /tmp/learning-space-browser playwright-core --cache=/tmp/npm-cache
PLAYWRIGHT_MODULE=/tmp/learning-space-browser/node_modules/playwright-core/index.mjs node tools/test-pet-browser.mjs
```

测试默认访问 `http://127.0.0.1:8787`，可用 `BASE_URL` 覆盖；`CHROMIUM_PATH` 默认 `/usr/bin/chromium`。浏览器脚本不访问或修改业务数据。
