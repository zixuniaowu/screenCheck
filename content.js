// Schedule Diff Checker - 内容脚本

(function() {
  'use strict';

  // 提取页面数据
  function extractScheduleData() {
    const data = [];

    // 策略1: 尝试查找甘特图中的任务块（常见的CSS类名）
    const selectors = [
      // 通用甘特图选择器
      '.gantt-task',
      '.task-bar',
      '.slot',
      '.cell',
      '.schedule-item',
      '.event',
      '.fc-event',
      // 表格类选择器
      'td[data-task]',
      'td[data-slot]',
      '.grid-cell',
      // 更通用的选择器 - 带背景色的div（任务块通常有颜色）
      'div[style*="background"]',
      // 生产系统常用选择器
      '.production-slot',
      '.schedule-block',
      '[class*="slot"]',
      '[class*="task"]',
      '[class*="block"]'
    ];

    // 尝试每个选择器
    for (const selector of selectors) {
      try {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          console.log(`[差分检测] 选择器 "${selector}" 找到 ${elements.length} 个元素`);
        }
      } catch (e) {
        // 忽略无效选择器
      }
    }

    // 策略2: 查找所有具有颜色背景的元素（任务块通常有背景色）
    const allElements = document.querySelectorAll('*');
    const coloredElements = [];

    allElements.forEach((el, index) => {
      const style = window.getComputedStyle(el);
      const bgColor = style.backgroundColor;
      const rect = el.getBoundingClientRect();

      // 过滤条件：
      // 1. 有背景色（非透明、非白色）
      // 2. 尺寸合理（任务块通常有一定大小）
      // 3. 在可视区域内
      if (
        bgColor &&
        bgColor !== 'rgba(0, 0, 0, 0)' &&
        bgColor !== 'transparent' &&
        bgColor !== 'rgb(255, 255, 255)' &&
        rect.width > 20 &&
        rect.height > 10 &&
        rect.width < 500 &&
        rect.height < 100
      ) {
        const text = el.innerText?.trim() || '';
        if (text && text.length < 50) { // 只取有文字且不太长的
          coloredElements.push({
            element: el,
            text: text,
            color: bgColor,
            x: Math.round(rect.left),
            y: Math.round(rect.top),
            width: Math.round(rect.width),
            height: Math.round(rect.height)
          });
        }
      }
    });

    console.log(`[差分检测] 找到 ${coloredElements.length} 个带颜色的元素`);

    // 策略3: 基于表格结构提取
    const tables = document.querySelectorAll('table');
    tables.forEach((table, tableIndex) => {
      const rows = table.querySelectorAll('tr');
      rows.forEach((row, rowIndex) => {
        const cells = row.querySelectorAll('td, th');
        cells.forEach((cell, colIndex) => {
          const text = cell.innerText?.trim();
          const style = window.getComputedStyle(cell);
          if (text) {
            data.push({
              type: 'table-cell',
              row: rowIndex,
              col: colIndex,
              tableIndex: tableIndex,
              text: text,
              color: style.backgroundColor,
              element: getElementPath(cell)
            });
          }
        });
      });
    });

    // 策略4: 查找网格布局中的元素
    const gridContainers = document.querySelectorAll('[style*="grid"], .grid, .gantt, .schedule, .timeline');
    gridContainers.forEach(container => {
      const children = container.children;
      for (let i = 0; i < children.length; i++) {
        const child = children[i];
        const text = child.innerText?.trim();
        const style = window.getComputedStyle(child);
        const rect = child.getBoundingClientRect();

        if (text && rect.width > 10) {
          data.push({
            type: 'grid-item',
            row: Math.floor(i / 20), // 假设每行约20个元素
            col: i % 20,
            text: text,
            color: style.backgroundColor,
            x: rect.left,
            y: rect.top
          });
        }
      }
    });

    // 如果上述策略没找到数据，使用带颜色元素的位置来推断行列
    if (data.length === 0 && coloredElements.length > 0) {
      // 根据 Y 坐标分组（行）
      const yGroups = new Map();
      coloredElements.forEach(el => {
        const yKey = Math.floor(el.y / 30) * 30; // 30px 为一个行高单位
        if (!yGroups.has(yKey)) {
          yGroups.set(yKey, []);
        }
        yGroups.get(yKey).push(el);
      });

      // 转换为行列格式
      const sortedYKeys = Array.from(yGroups.keys()).sort((a, b) => a - b);
      sortedYKeys.forEach((yKey, rowIndex) => {
        const rowElements = yGroups.get(yKey).sort((a, b) => a.x - b.x);
        rowElements.forEach((el, colIndex) => {
          data.push({
            type: 'visual-position',
            row: rowIndex,
            col: colIndex,
            text: el.text,
            color: el.color,
            x: el.x,
            y: el.y,
            width: el.width,
            height: el.height,
            element: getElementPath(el.element)
          });
        });
      });
    }

    return data;
  }

  // 获取元素的唯一路径标识
  function getElementPath(element) {
    const path = [];
    while (element && element.nodeType === Node.ELEMENT_NODE) {
      let selector = element.nodeName.toLowerCase();
      if (element.id) {
        selector += '#' + element.id;
        path.unshift(selector);
        break;
      } else {
        let sibling = element;
        let nth = 1;
        while (sibling = sibling.previousElementSibling) {
          if (sibling.nodeName.toLowerCase() === selector) nth++;
        }
        if (nth !== 1) selector += `:nth-of-type(${nth})`;
      }
      path.unshift(selector);
      element = element.parentNode;
    }
    return path.join(' > ');
  }

  // 根据路径找到元素
  function findElementByPosition(x, y, tolerance = 10) {
    const elements = document.elementsFromPoint(x, y);
    return elements[0];
  }

  // 高亮差异元素
  function highlightDifferences(differences) {
    // 先清除之前的高亮
    clearHighlights();

    differences.forEach(diff => {
      // 尝试找到对应的元素
      let element = null;

      // 方法1: 通过坐标查找
      if (diff.x && diff.y) {
        element = findElementByPosition(diff.x, diff.y);
      }

      // 方法2: 通过 CSS 路径查找
      if (!element && diff.element) {
        try {
          element = document.querySelector(diff.element);
        } catch (e) {
          // 忽略无效选择器
        }
      }

      // 方法3: 通过文本内容查找
      if (!element && diff.newValue) {
        const allElements = document.querySelectorAll('*');
        for (const el of allElements) {
          if (el.innerText?.trim() === diff.newValue) {
            element = el;
            break;
          }
        }
      }

      if (element) {
        // 创建高亮覆盖层
        const rect = element.getBoundingClientRect();
        const highlight = document.createElement('div');
        highlight.className = 'schedule-diff-highlight';
        highlight.dataset.diffType = diff.type;

        // 根据差异类型设置颜色
        let color;
        switch (diff.type) {
          case 'added':
            color = 'rgba(76, 175, 80, 0.5)'; // 绿色 - 新增
            break;
          case 'removed':
            color = 'rgba(244, 67, 54, 0.5)'; // 红色 - 删除
            break;
          case 'changed':
            color = 'rgba(255, 152, 0, 0.5)'; // 橙色 - 变更
            break;
          default:
            color = 'rgba(33, 150, 243, 0.5)'; // 蓝色
        }

        highlight.style.cssText = `
          position: fixed;
          left: ${rect.left - 2}px;
          top: ${rect.top - 2}px;
          width: ${rect.width + 4}px;
          height: ${rect.height + 4}px;
          background: ${color};
          border: 3px solid ${color.replace('0.5', '1')};
          border-radius: 4px;
          pointer-events: none;
          z-index: 999999;
          animation: pulse 1.5s infinite;
        `;

        // 添加提示标签
        const label = document.createElement('div');
        label.className = 'schedule-diff-label';
        label.style.cssText = `
          position: fixed;
          left: ${rect.left}px;
          top: ${rect.top - 24}px;
          background: ${color.replace('0.5', '0.9')};
          color: white;
          padding: 2px 6px;
          font-size: 11px;
          border-radius: 3px;
          z-index: 1000000;
          pointer-events: none;
          white-space: nowrap;
        `;

        let labelText = '';
        switch (diff.type) {
          case 'added':
            labelText = `新增: ${diff.newValue}`;
            break;
          case 'removed':
            labelText = `删除: ${diff.oldValue}`;
            break;
          case 'changed':
            labelText = `${diff.oldValue} → ${diff.newValue}`;
            break;
        }
        label.textContent = labelText;

        document.body.appendChild(highlight);
        document.body.appendChild(label);
      }
    });

    console.log(`[差分检测] 已高亮 ${differences.length} 处差异`);
  }

  // 清除高亮
  function clearHighlights() {
    document.querySelectorAll('.schedule-diff-highlight, .schedule-diff-label').forEach(el => {
      el.remove();
    });
  }

  // 监听来自 popup 的消息
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('[差分检测] 收到消息:', request.action);

    switch (request.action) {
      case 'extractData':
        try {
          const data = extractScheduleData();
          sendResponse({
            success: true,
            data: data,
            url: window.location.href,
            timestamp: Date.now()
          });
        } catch (error) {
          sendResponse({
            success: false,
            error: error.message
          });
        }
        break;

      case 'highlightDiff':
        try {
          highlightDifferences(request.differences);
          sendResponse({ success: true });
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
        break;

      case 'clearHighlight':
        clearHighlights();
        sendResponse({ success: true });
        break;

      default:
        sendResponse({ success: false, error: '未知操作' });
    }

    return true; // 保持消息通道开放
  });

  console.log('[Schedule Diff Checker] 内容脚本已加载');
})();
