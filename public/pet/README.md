# 固定角色展示

当前三张 `companion/*.webp` 以用户在对话中提供的三张角色参考图为基础，通过图像生成工具制作透明底版本，再分帧导出。它们是参考图的生成式改绘，不是原图文件的逐像素复制，也不作为独立原创角色的权利声明。

角色固定在右下角：桌面 124×136px、手机 108×118px。每五秒依次切换眨眼、开心、招手姿势，位置不变。没有拖拽、跟随、散步、键盘移动、点击互动或模式选择。鲸鱼按钮切换显示/隐藏并记忆状态。页面不可见、角色隐藏或系统开启减少动态效果时停止姿势轮换。

页面不显示版权声明控件。旧版项目来源的 MIT 文本保存在 `docs/licenses/dafeiyu-MIT.txt`，旧角色图片已经移除。Git 历史未改写。

验证：`npm run test:all`。启动 `npm run dev` 后运行：

```sh
PLAYWRIGHT_MODULE=/tmp/pet-runtime/node_modules/playwright-core/index.mjs node tools/test-pet-browser.mjs
```

浏览器测试需要 Playwright Core 与 Chromium。可用 `BASE_URL`、`CHROMIUM_PATH` 覆盖本地默认值。
