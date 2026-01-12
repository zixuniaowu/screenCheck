// 获取当前活动标签页
async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

// 向内容脚本发送消息
async function sendMessageToContent(action, data = {}) {
  const tab = await getCurrentTab();
  return chrome.tabs.sendMessage(tab.id, { action, ...data });
}

// 格式化时间
function formatTime(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

// 更新快照状态显示
async function updateSnapshotStatus() {
  const result = await chrome.storage.local.get(['snapshotA', 'snapshotB']);

  const statusA = document.getElementById('statusA');
  const statusB = document.getElementById('statusB');

  if (result.snapshotA) {
    statusA.textContent = `✓ 已保存 (${formatTime(result.snapshotA.timestamp)})`;
    statusA.className = 'status has-data';
    const info = document.createElement('div');
    info.className = 'snapshot-info';
    info.innerHTML = `<span>共 ${result.snapshotA.data.length} 个slot</span>`;
    statusA.appendChild(info);
  } else {
    statusA.textContent = '未保存';
    statusA.className = 'status no-data';
  }

  if (result.snapshotB) {
    statusB.textContent = `✓ 已保存 (${formatTime(result.snapshotB.timestamp)})`;
    statusB.className = 'status has-data';
    const info = document.createElement('div');
    info.className = 'snapshot-info';
    info.innerHTML = `<span>共 ${result.snapshotB.data.length} 个slot</span>`;
    statusB.appendChild(info);
  } else {
    statusB.textContent = '未保存';
    statusB.className = 'status no-data';
  }
}

// 保存快照 A
document.getElementById('saveSnapshotA').addEventListener('click', async () => {
  try {
    const response = await sendMessageToContent('extractData');
    if (response && response.success) {
      await chrome.storage.local.set({
        snapshotA: {
          data: response.data,
          timestamp: Date.now(),
          url: response.url
        }
      });
      updateSnapshotStatus();
      alert(`快照 A 保存成功！\n共提取 ${response.data.length} 个slot`);
    } else {
      alert('提取数据失败: ' + (response?.error || '未知错误'));
    }
  } catch (e) {
    alert('操作失败: ' + e.message);
  }
});

// 保存快照 B
document.getElementById('saveSnapshotB').addEventListener('click', async () => {
  try {
    const response = await sendMessageToContent('extractData');
    if (response && response.success) {
      await chrome.storage.local.set({
        snapshotB: {
          data: response.data,
          timestamp: Date.now(),
          url: response.url
        }
      });
      updateSnapshotStatus();
      alert(`快照 B 保存成功！\n共提取 ${response.data.length} 个slot`);
    } else {
      alert('提取数据失败: ' + (response?.error || '未知错误'));
    }
  } catch (e) {
    alert('操作失败: ' + e.message);
  }
});

// 对比差异
document.getElementById('compareDiff').addEventListener('click', async () => {
  const result = await chrome.storage.local.get(['snapshotA', 'snapshotB']);

  if (!result.snapshotA || !result.snapshotB) {
    alert('请先保存快照 A 和快照 B');
    return;
  }

  const dataA = result.snapshotA.data;
  const dataB = result.snapshotB.data;

  // 创建映射方便查找
  const mapA = new Map();
  const mapB = new Map();

  dataA.forEach(item => {
    const key = `${item.row}-${item.col}`;
    mapA.set(key, item);
  });

  dataB.forEach(item => {
    const key = `${item.row}-${item.col}`;
    mapB.set(key, item);
  });

  // 找出差异
  const differences = [];

  // 检查 A 中的元素在 B 中是否有变化
  mapA.forEach((itemA, key) => {
    const itemB = mapB.get(key);
    if (!itemB) {
      differences.push({
        type: 'removed',
        key: key,
        row: itemA.row,
        col: itemA.col,
        oldValue: itemA.text,
        newValue: null,
        description: `已删除: 行${itemA.row} 列${itemA.col}`
      });
    } else if (itemA.text !== itemB.text || itemA.color !== itemB.color) {
      differences.push({
        type: 'changed',
        key: key,
        row: itemA.row,
        col: itemA.col,
        oldValue: itemA.text,
        newValue: itemB.text,
        oldColor: itemA.color,
        newColor: itemB.color,
        description: `变更: 行${itemA.row} 列${itemA.col}: "${itemA.text}" → "${itemB.text}"`
      });
    }
  });

  // 检查 B 中新增的元素
  mapB.forEach((itemB, key) => {
    if (!mapA.has(key)) {
      differences.push({
        type: 'added',
        key: key,
        row: itemB.row,
        col: itemB.col,
        oldValue: null,
        newValue: itemB.text,
        description: `新增: 行${itemB.row} 列${itemB.col}: "${itemB.text}"`
      });
    }
  });

  // 显示结果
  const diffResult = document.getElementById('diffResult');
  const diffCount = document.getElementById('diffCount');
  const diffList = document.getElementById('diffList');

  diffResult.classList.add('show');
  diffCount.textContent = differences.length;

  if (differences.length > 0) {
    diffResult.classList.add('has-diff');
    diffResult.classList.remove('no-diff');

    diffList.innerHTML = differences.map(d =>
      `<div class="diff-item">${d.description}</div>`
    ).join('');

    // 发送差异到内容脚本进行高亮
    await sendMessageToContent('highlightDiff', { differences });
  } else {
    diffResult.classList.remove('has-diff');
    diffResult.classList.add('no-diff');
    diffList.innerHTML = '<div class="diff-item">没有发现差异 ✓</div>';
  }
});

// 清除高亮
document.getElementById('clearHighlight').addEventListener('click', async () => {
  await sendMessageToContent('clearHighlight');
});

// 清除所有数据
document.getElementById('clearAll').addEventListener('click', async () => {
  if (confirm('确定要清除所有快照数据吗？')) {
    await chrome.storage.local.remove(['snapshotA', 'snapshotB']);
    await sendMessageToContent('clearHighlight');
    updateSnapshotStatus();

    const diffResult = document.getElementById('diffResult');
    diffResult.classList.remove('show');
  }
});

// 初始化
updateSnapshotStatus();
