# 静态待机与单次动作桌宠

素材来自用户上传的 `blue_maid_desktop_assets (1).zip`，保留原始静态 WebP 和 PNG 动作帧，不再使用此前生成的动图。没有对素材重新绘制或裁切。包内说明将这些素材描述为依据参考图生成、经过对齐的有限帧二维动画；这里不额外声明其角色权利归属。

`maid/manifest.json` 保留原包的画布、锚点、动作顺序和每帧时长，仅移除未部署的 animation/start/end 文件引用。画布 512×512，锚点 (256,472)。静态图与动作首尾对应。

默认静态待机，每隔 4–6 秒播放一次待机眨眼。点击顺序为跳跃 → 卖萌 → 招手，动作播放一次后停在对应静态图。使用预解码图片与 requestAnimationFrame 按原始时长播放，不依赖动画 WebP 的结束事件。连续点击立即取消旧播放任务，异步加载完成后也不能覆盖更新的动作。下一动作预加载失败不影响当前图，主动播放失败保留静态图并提供重试。

角色固定右下角，桌面 124×136px、手机 108×118px；不拖拽、不跟随。鲸鱼按钮收起/恢复并记忆隐藏状态，恢复时保留当前姿势。隐藏、切到后台或启用系统减少动态效果时停止动画，显示当前静态图。支持键盘 Enter/空格和触屏点击。

页面不显示版权控件。旧项目 MIT 文本仍保存在 `docs/licenses/dafeiyu-MIT.txt`。

验证：`npm run test:all`；启动开发服务后运行 `PLAYWRIGHT_MODULE=/tmp/pet-runtime/node_modules/playwright-core/index.mjs node tools/test-pet-browser.mjs`。浏览器测试需要 Playwright Core 与 Chromium，可用 `BASE_URL`、`CHROMIUM_PATH` 指定服务和浏览器。
