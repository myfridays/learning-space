# 点击切换的固定动图角色

`companion/animated` 使用此前对话中依用户参考图生成的动作分帧制作的透明循环 WebP 动图：招手 8 帧、跳跃 6 帧、眨眼 5 帧。`companion/still` 是对应首帧，供减少动态效果、收起角色或页面不可见时使用。这些是参考角色的生成式改绘，不是用户最新聊天图片原始文件的逐像素复制。

角色固定在右下角：桌面 124×136px、手机 108×118px。初始招手，每点击一次依序切换「招手 → 跳跃 → 眨眼 → 招手」。当前动作循环播放，不自动切换动作；Enter、空格和触屏点击同样支持。没有拖拽、跟随、散步或方向键移动。

鲸鱼按钮收起/恢复并记忆隐藏状态，不改变当前动作。系统减少动态效果开启时显示所选动作首帧，仍可点击选择。素材加载失败提供重试。

页面不显示版权控件。旧项目 MIT 文本保存在 `docs/licenses/dafeiyu-MIT.txt`；历史 Git 提交未改写。

验证：`npm run test:all`。启动 `npm run dev` 后运行：

```sh
PLAYWRIGHT_MODULE=/tmp/pet-runtime/node_modules/playwright-core/index.mjs node tools/test-pet-browser.mjs
```

浏览器测试需要 Playwright Core 与 Chromium，可用 `BASE_URL`、`CHROMIUM_PATH` 覆盖默认值。
