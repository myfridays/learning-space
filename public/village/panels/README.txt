功能面板外框

严格按本次四张上传图的顺序对应：
1. mindfulness.png：正念输出框，卷轴样式。
2. fitness.png：健身记录面板，银紫样式。
3. todos.png：待办面板，木制样式。
4. settings.png：设置面板，金色样式。

四张均保留原始 64×64 透明 PNG，没有重绘或改动颜色。
panels.css 提供完整外框与内部滚动内容区域的基础样式。
建议面板以 256×256 或 320×320 显示（整数倍放大）；不要拉成长方形。
文字、按钮和输入框由网页添加。内容较多时在内层滚动，避免覆盖装饰边框。
本次更换的是功能面板外观，村庄建筑仍使用 buildings/ 中的素材。
这是素材及接入样式更新，未修改或部署任何实际网站。

接入示例（相对于本目录）：
<link rel="stylesheet" href="panels.css">
<section class="village-panel" data-kind="mindfulness" aria-label="正念">
  <img class="village-panel__frame" src="mindfulness.png" alt="">
  <div class="village-panel__content">在这里放置正念输出内容。</div>
</section>

其他功能同时替换 data-kind、图片文件名和 aria-label 即可。
