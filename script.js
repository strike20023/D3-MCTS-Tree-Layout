let treeData = null;
let svg, g, root, tree, zoom;
let width = 1140, height = 600;
let duration = 750;
let i = 0;
let max_step;
let step = -1;
let tooltip;

// 初始化SVG
function initSVG() {
    const container = d3.select("#tree-container");
    container.selectAll("*").remove();
    
    svg = container
        .append("svg")
        .attr("width", width)
        .attr("height", height);

    // 创建缩放行为
    zoom = d3.zoom()
        .scaleExtent([0.1, 3])
        .on("zoom", function(event) {
            g.attr("transform", event.transform);
        });

    svg.call(zoom);

    g = svg.append("g");

    // 创建tooltip
    tooltip = d3.select("body").append("div")
        .attr("class", "tooltip")
        .style("opacity", 0);
}

// 从本地tree.json文件加载数据
function loadTreeFromFile() {
    return fetch('./tree.json')
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            loadTreeData(data);
        })
        .catch(error => {
            console.error('Error loading tree.json:', error);
            showError('无法加载tree.json文件，请确保文件存在且格式正确。错误信息: ' + error.message);
        });
}

// 加载树形数据
function loadTreeData(data) {
    clearError();
    treeData = data;
    
    // 初始化SVG
    initSVG();
    
    // 创建树布局
    tree = d3.tree().size([height - 100, width - 200]);
    
    // 处理数据
    root = d3.hierarchy(treeData, d => d.children);
    root.x0 = height / 2;
    root.y0 = 0;

    // 折叠除了第一层之外的所有节点
    // root.children.forEach(collapse);

    update(root);
    
    // 居中显示
    const bounds = g.node().getBBox();
    const fullWidth = width, fullHeight = height;
    const scale = 0.8 / Math.max(bounds.width / fullWidth, bounds.height / fullHeight);
    const translate = [fullWidth / 2 - scale * bounds.x - scale * bounds.width / 2, 
                        fullHeight / 2 - scale * bounds.y - scale * bounds.height / 2];
    
    svg.transition()
        .duration(750)
        .call(zoom.transform, d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale));
    
    resetZoom()
    updateStats();
}

// 折叠节点
function collapse(d) {
    if (d.children) {
        d._children = d.children;
        d._children.forEach(collapse);
        d.children = null;
    }
}
// 展开所有节点
function expandAll() {
    if (!root) return;
    _expandAll(root);
    update(root);
    updateStats();
}

// 展开所有节点
function _expandAll(d) {
    if (d._children) {
        d.children = d._children;
        d._children = null;
    }
    if (d.children) {
        d.children.forEach(_expandAll);
    }
}

// 更新树形图
function update(source) {
    const treeData = tree(root);
    const nodes = treeData.descendants().filter(
        d => d.data.step <= step
    );
    const links = treeData.descendants().filter(
        d => d.data.step <= step
    ).slice(1);

    // 标准化节点深度
    nodes.forEach(d => d.y = d.depth * 180);

    // 更新节点
    const node = g.selectAll('g.node')
        .data(nodes, d => d.id || (d.id = ++i));

    // 进入新节点
    const nodeEnter = node.enter().append('g')
        .attr('class', 'node')
        .attr('transform', d => `translate(${source.y0},${source.x0})`)
        .on('click', click)
        .on('mouseover', function(event, d) {
            // 显示tooltip
            let content = `<strong>${d.data.name}</strong>`;
            // if (d.data.value) content += `<br/>值: ${d.data.value}`;
            if (d.data.description) content += `<br/>${d.data.description}`;
            if (d.children || d._children) {
                const childCount = d.children ? d.children.length : d._children.length;
                content += `<br/>子节点: ${childCount}`;
            }
            
            tooltip.transition()
                .duration(200)
                .style("opacity", .9);
            tooltip.html(content)
                .style("left", (event.pageX + 10) + "px")
                .style("top", (event.pageY - 10) + "px");
        })
        .on('mouseout', function(d) {
            tooltip.transition()
                .duration(500)
                .style("opacity", 0);
        });

    // 添加圆圈
    nodeEnter.append('circle')
        .attr('r', 1e-6)
        .style('fill', d => d._children ? "#764ba2" : "#667eea");

    // 添加文本
    nodeEnter.append('text')
        .attr('dy', '.35em')
        .attr('x', d => d.children || d._children ? -13 : 13)
        .attr('text-anchor', d => d.children || d._children ? 'end' : 'start')
        .text(d => d.data.name)
        .style('fill-opacity', 1e-6);

    // 更新现有节点
    const nodeUpdate = nodeEnter.merge(node);

    nodeUpdate.transition()
        .duration(duration)
        .attr('transform', d => `translate(${d.y},${d.x})`);

    nodeUpdate.select('circle')
        .attr('r', d => {
            if (d.data.value) {
                return Math.max(6, Math.min(20, d.data.value / 10));
            }
            return 8;
        })
        .style('fill', d => d._children ? "#764ba2" : "#667eea")
        .attr('cursor', 'pointer');

    nodeUpdate.select('text')
        .style('fill-opacity', 1);

    // 移除退出的节点
    const nodeExit = node.exit().transition()
        .duration(duration)
        .attr('transform', d => `translate(${source.y},${source.x})`)
        .remove();

    nodeExit.select('circle')
        .attr('r', 1e-6);

    nodeExit.select('text')
        .style('fill-opacity', 1e-6);

    // 更新链接
    const link = g.selectAll('path.link')
        .data(links, d => d.id);

    const linkEnter = link.enter().insert('path', 'g')
        .attr('class', 'link')
        .attr('d', d => {
            const o = {x: source.x0, y: source.y0};
            return diagonal(o, o);
        });

    const linkUpdate = linkEnter.merge(link);

    linkUpdate.transition()
        .duration(duration)
        .attr('d', d => diagonal(d, d.parent));

    const linkExit = link.exit().transition()
        .duration(duration)
        .attr('d', d => {
            const o = {x: source.x, y: source.y};
            return diagonal(o, o);
        })
        .remove();

    // 存储旧位置用于过渡
    nodes.forEach(d => {
        d.x0 = d.x;
        d.y0 = d.y;
    });
}

// 创建对角线路径
function diagonal(s, d) {
    return `M ${s.y} ${s.x}
            C ${(s.y + d.y) / 2} ${s.x},
                ${(s.y + d.y) / 2} ${d.x},
                ${d.y} ${d.x}`;
}

// 点击事件处理
function click(event, d) {
    if (d.children) {
        d._children = d.children;
        d.children = null;
    } else {
        d.children = d._children;
        d._children = null;
    }
    update(d);
    updateStats();
}

// 缩放控制
function zoomIn() {
    svg.transition().call(zoom.scaleBy, 1.5);
}

function zoomOut() {
    svg.transition().call(zoom.scaleBy, 1 / 1.5);
}

function resetZoom() {
    svg.transition().call(zoom.transform, d3.zoomIdentity);
}

// 更新统计信息
function updateStats() {
    if (!root) return;
    
    const allNodes = [];
    function traverse(node) {
        allNodes.push(node);
        if (node.children) {
            node.children.forEach(traverse);
        }
        if (node._children) {
            node._children.forEach(traverse);
        }
    }
    traverse(root);

    const visibleNodes = [];
    function traverseVisible(node) {
        visibleNodes.push(node);
        if (node.children) {
            node.children.forEach(traverseVisible);
        }
    }
    traverseVisible(root);

    const maxDepth = d3.max(allNodes, d => d.depth);
    
    const statsHtml = `
        <div class="stats">
            <div class="stat-item">
                <span class="stat-value">${allNodes.length}</span>
                <span class="stat-label">总节点数</span>
            </div>
            <div class="stat-item">
                <span class="stat-value">${visibleNodes.length}</span>
                <span class="stat-label">可见节点</span>
            </div>
            <div class="stat-item">
                <span class="stat-value">${maxDepth}</span>
                <span class="stat-label">最大深度</span>
            </div>
        </div>
    `;
    max_step = allNodes.length;
    document.getElementById('stats-container').innerHTML = statsHtml;
    document.getElementById('step-slider').min=0;
    document.getElementById('step-slider').max=max_step;
}

// 错误处理
function showError(message) {
    document.getElementById('error-container').innerHTML = 
        `<div class="error-message">❌ ${message}</div>`;
}

function clearError() {
    document.getElementById('error-container').innerHTML = '';
}

// 页面加载时自动从tree.json加载数据
document.addEventListener('DOMContentLoaded', function() {
    loadTreeFromFile().then(() => {
        // 数据加载完成后执行
        console.log(max_step);
        document.getElementById('step-slider').value=0;
        document.getElementById('step-value').textContent=0;
        console.log(document.getElementById('step-slider').value);
    });
    // 滑块事件处理
    document.getElementById('step-slider').addEventListener('input', function(e) {
        document.getElementById('step-value').textContent = e.target.value;
        step = e.target.value;
        console.log('Step updated to:', step); // 调试用，检查step值
        expandAll();
        update(root);
        updateStats();
    });
});

function rollout() {
  step = 0;
  console.log(`初始${step} 最大${max_step}`);
  const intervalId = setInterval(() => {
    if (step >= max_step) {
      clearInterval(intervalId);
      console.log(`已达到最大步数 ${max_step}，停止计数`);
      return;
    }
    step++;
    document.getElementById('step-value').textContent=step;
    document.getElementById('step-slider').value=step;
    expandAll();
    update(root);
    updateStats();

    console.log(`当前步数：${step}`);
  }, 500);
}